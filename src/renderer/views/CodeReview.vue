<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bot, Clipboard, FileDiff, Square } from 'lucide-vue-next'
import type { AiConfigResponse, ProjectTask } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { isGitCommandError } from '../ipcGuards'
import { renderMarkdown } from '../markdown'
import { safeLoad } from '../safeLoad'
import { currentProjectId, loadProjectContext, projects as contextProjects } from '../stores/projectContext'
import { showToast } from '../toast'
import { showOperationError } from '../dbFeedback'

type ReviewSource = 'unstaged' | 'staged' | 'file' | 'paste'

const projects = contextProjects
const tasks = ref<ProjectTask[]>([])
const selectedProjectId = currentProjectId
const selectedTaskId = ref('')
const cwd = ref('')
const sourceType = ref<ReviewSource>('unstaged')
const filePath = ref('')
const input = ref('')
const output = ref('')
const loading = ref(false)
const activeRequestId = ref('')
const status = ref('正在读取代码审查上下文')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const config = ref<AiConfigResponse>({ hasApiKey: false, provider: 'siliconflow', model: 'Qwen/Qwen2.5-7B-Instruct' })

const selectedProject = computed(() => projects.value.find((item) => item.id === selectedProjectId.value) ?? null)
const selectedTask = computed(() => tasks.value.find((item) => item.id === selectedTaskId.value) ?? null)
const renderedOutput = computed(() => renderMarkdown(output.value))

async function loadConfig(): Promise<void> {
  config.value = await devtoolsApi.ai.getConfig()
}

async function loadProjects(): Promise<void> {
  await loadProjectContext()
  cwd.value = selectedProject.value?.path || cwd.value
}

async function loadTasks(): Promise<void> {
  if (!selectedProjectId.value) {
    tasks.value = []
    selectedTaskId.value = ''
    return
  }
  tasks.value = await devtoolsApi.projects.listTasks({ projectId: selectedProjectId.value })
  if (selectedTaskId.value && !tasks.value.some((item) => item.id === selectedTaskId.value)) selectedTaskId.value = ''
}

async function loadReviewSource(): Promise<void> {
  if (sourceType.value === 'paste') {
    status.value = '可直接粘贴代码或 diff 后发起审查'
    statusType.value = 'idle'
    return
  }

  const command = sourceType.value === 'staged' ? 'staged-diff' : sourceType.value === 'file' ? 'file-diff' : 'raw-diff'
  const response = await devtoolsApi.git.run({
    command,
    cwd: cwd.value || selectedProject.value?.path || undefined,
    path: sourceType.value === 'file' ? filePath.value : undefined
  })

  if (isGitCommandError(response)) {
    status.value = response.error
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }
  if (response.command === 'status' || response.command === 'log') return
  input.value = response.diff.raw
  status.value = `已读取 ${sourceType.value === 'staged' ? 'staged diff' : sourceType.value === 'file' ? '文件 diff' : '未暂存 diff'}`
  statusType.value = 'success'
}

function buildReviewPrompt(): string {
  const project = selectedProject.value
  const task = selectedTask.value
  return [
    '请审查以下代码或 Git diff。',
    '输出格式：高风险问题、一般问题、测试建议、可直接采用的修改建议、提交或 PR 摘要。',
    '要求：只列实际风险；如果没有明显问题，请明确说明残余风险和建议验证。',
    project ? `项目：${project.name}\n路径：${project.path}\n技术栈：${project.techStack || '未设置'}` : '',
    task ? `关联任务：${task.title}\n任务描述：${task.description || '无'}` : '',
    `审查来源：${sourceType.value}`,
    '',
    '```diff',
    input.value,
    '```'
  ]
    .filter(Boolean)
    .join('\n')
}

async function runReview(): Promise<void> {
  if (!config.value.hasApiKey) {
    status.value = '请先在设置页配置当前模型平台 API Key'
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }
  if (!input.value.trim()) {
    status.value = '请先读取或粘贴需要审查的内容'
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  loading.value = true
  output.value = ''
  const prompt = buildReviewPrompt()
  const stream = await devtoolsApi.ai.generateTextStream({ taskType: 'git-summary', prompt }, (event) => {
    if (event.type === 'chunk') {
      output.value += event.text
      return
    }
    loading.value = false
    activeRequestId.value = ''
    if (event.type === 'done') {
      status.value = `代码审查完成 · ${event.model}`
      statusType.value = 'success'
      showToast(status.value, 'success')
      void saveReviewHistory(prompt, event.model)
    } else if (event.type === 'canceled') {
      status.value = '已停止代码审查'
      statusType.value = 'idle'
    } else {
      output.value = event.error
      status.value = event.error
      statusType.value = 'error'
      showToast(status.value, 'error')
    }
  })
  activeRequestId.value = stream.requestId
}

async function saveReviewHistory(prompt: string, model: string): Promise<void> {
  if (!output.value.trim()) return
  try {
    await devtoolsApi.ai.saveHistory({
      taskType: 'git-summary',
      title: selectedTask.value ? `代码审查：${selectedTask.value.title}` : 'AI 代码审查',
      prompt,
      output: output.value,
      model,
      projectId: selectedProjectId.value || undefined,
      taskId: selectedTaskId.value || undefined,
      sourceType: 'code_review',
      sourceRef: selectedTaskId.value || sourceType.value
    })
  } catch (error) {
    status.value = showOperationError(error, '保存代码审查历史失败')
    statusType.value = 'error'
  }
}

async function stopReview(): Promise<void> {
  if (!activeRequestId.value) return
  await devtoolsApi.ai.cancelStream(activeRequestId.value)
}

async function copyOutput(): Promise<void> {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  showToast('代码审查结果已复制', 'success')
}

watch(selectedProjectId, async () => {
  cwd.value = selectedProject.value?.path || cwd.value
  await loadTasks()
})

onMounted(() => {
  void safeLoad('读取代码审查上下文', async () => {
    await loadConfig()
    await loadProjects()
    await loadTasks()
  })
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>代码审查</h2>
        <p>审查当前项目 diff、暂存 diff、指定文件差异或粘贴代码，并可关联项目任务。</p>
      </div>
      <div class="toolbar">
        <select v-model="selectedProjectId" class="select select-compact project-switcher">
          <option value="">默认目录</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <select v-model="selectedTaskId" class="select select-compact" :disabled="!tasks.length">
          <option value="">不关联任务</option>
          <option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
        </select>
        <span class="pill">{{ config.model }}</span>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <section class="section">
          <div class="field">
            <label for="review-cwd">工作目录</label>
            <input id="review-cwd" v-model="cwd" class="input" placeholder="默认使用当前项目路径" />
          </div>
          <div class="tabs">
            <button
              class="tab-button"
              :class="{ active: sourceType === 'unstaged' }"
              type="button"
              @click="sourceType = 'unstaged'"
            >
              未暂存 diff
            </button>
            <button
              class="tab-button"
              :class="{ active: sourceType === 'staged' }"
              type="button"
              @click="sourceType = 'staged'"
            >
              已暂存 diff
            </button>
            <button
              class="tab-button"
              :class="{ active: sourceType === 'file' }"
              type="button"
              @click="sourceType = 'file'"
            >
              指定文件
            </button>
            <button
              class="tab-button"
              :class="{ active: sourceType === 'paste' }"
              type="button"
              @click="sourceType = 'paste'"
            >
              粘贴内容
            </button>
          </div>
          <div v-if="sourceType === 'file'" class="field">
            <label for="review-file-path">文件相对路径</label>
            <input id="review-file-path" v-model="filePath" class="input" placeholder="src/example.ts" />
          </div>
          <div class="toolbar">
            <button
              class="button secondary"
              type="button"
              :disabled="sourceType === 'file' && !filePath.trim()"
              @click="loadReviewSource"
            >
              <FileDiff :size="16" />
              读取内容
            </button>
            <button class="button" type="button" :disabled="loading || !input.trim()" @click="runReview">
              <Bot :size="16" />
              {{ loading ? '审查中' : '开始审查' }}
            </button>
            <button v-if="loading" class="button secondary" type="button" @click="stopReview">
              <Square :size="16" />
              停止
            </button>
          </div>
          <textarea v-model="input" class="textarea ai-pane-fixed" spellcheck="false" />
        </section>

        <section class="section">
          <div class="meta-row">
            <strong>审查结果</strong>
            <button class="button secondary compact-button" type="button" :disabled="!output" @click="copyOutput">
              <Clipboard :size="14" />
              复制
            </button>
          </div>
          <div
            v-if="output"
            class="output-box markdown-output ai-output-scroll ai-pane-fixed"
            v-html="renderedOutput"
          ></div>
          <div v-else class="empty-state ai-pane-fixed">代码审查输出会显示在这里</div>
        </section>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
