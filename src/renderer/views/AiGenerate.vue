<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Clipboard, Eye, History, RefreshCw, Sparkles, Square, Trash2 } from 'lucide-vue-next'
import type { AiConfigResponse, AiHistoryItem, AiPromptTemplate, AiTaskType, ProjectTask } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { renderMarkdown } from '../markdown'
import { extractPromptVariables, renderPromptTemplate } from '../promptTemplates'
import { safeLoadAll } from '../safeLoad'
import { currentProjectId, loadProjectContext, projects as contextProjects } from '../stores/projectContext'
import { showToast } from '../toast'
import { showOperationError } from '../dbFeedback'

const taskType: AiTaskType = 'generate-code'
const router = useRouter()
const prompt = ref('生成一个 TypeScript 函数：接收 API 响应对象，校验状态码并提取错误信息。')
const output = ref('')
const status = ref('正在读取 AI 配置')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const loading = ref(false)
const activeRequestId = ref('')
const history = ref<AiHistoryItem[]>([])
const projects = contextProjects
const selectedProjectId = currentProjectId
const tasks = ref<ProjectTask[]>([])
const selectedTaskId = ref('')
const taskPromptMode = ref<'plan' | 'tests' | 'commit'>('plan')
const templates = ref<AiPromptTemplate[]>([])
const selectedTemplateId = ref('')
const templateDraft = ref('')
const templateVariables = ref<Record<string, string>>({ requiredFields: prompt.value })
const historySearch = ref('')
const selectedHistoryItem = ref<AiHistoryItem | null>(null)
const config = ref<AiConfigResponse>({ hasApiKey: false, provider: 'siliconflow', model: 'Qwen/Qwen2.5-7B-Instruct' })
const renderedOutput = computed(() => renderMarkdown(output.value))
const renderedHistoryOutput = computed(() => renderMarkdown(selectedHistoryItem.value?.output ?? ''))
const selectedTemplate = computed(() => templates.value.find((item) => item.id === selectedTemplateId.value))
const selectedProject = computed(() => projects.value.find((item) => item.id === selectedProjectId.value) ?? null)
const selectedTask = computed(() => tasks.value.find((item) => item.id === selectedTaskId.value) ?? null)
const templateVariableNames = computed(() => extractPromptVariables(templateDraft.value))
const filteredHistory = computed(() => {
  const keyword = historySearch.value.trim().toLowerCase()
  if (!keyword) return history.value
  return history.value.filter((item) => {
    return [item.title, item.prompt, item.output, item.model].some((value) => value.toLowerCase().includes(keyword))
  })
})

async function loadConfig(): Promise<void> {
  config.value = await devtoolsApi.ai.getConfig()
  status.value = config.value.hasApiKey ? `模型 ${config.value.model} 已就绪` : '未配置当前模型平台 API Key'
  statusType.value = config.value.hasApiKey ? 'success' : 'error'
}

function buildProjectTaskContext(): string {
  const project = selectedProject.value
  const task = selectedTask.value
  const sections = ['请基于以下项目和任务上下文输出结果。']
  if (project) {
    sections.push(
      `项目：${project.name}`,
      `路径：${project.path}`,
      `技术栈：${project.techStack || '未设置'}`,
      `运行命令：${project.devCommand || '未设置'}`,
      `测试命令：${project.testCommand || '未设置'}`,
      `重要目录：\n${project.importantPaths || '未设置'}`,
      `项目备注：\n${project.notes || '无'}`
    )
  }
  if (task) {
    sections.push(
      `任务：${task.title}`,
      `类型：${task.taskType}`,
      `优先级：${task.priority}`,
      `状态：${task.status}`,
      `任务描述：\n${task.description || '无'}`
    )
  }
  sections.push(
    '如果以上项目资料存在明显乱码、重复异常字符、路径或命令不可识别，请先列出异常字段并提示修正，再给出保守建议。'
  )
  return sections.join('\n')
}

function buildTaskPrompt(mode: typeof taskPromptMode.value): string {
  const context = buildProjectTaskContext()
  const instructions = {
    plan: '请生成开发方案，包含目标、涉及文件、实现步骤、风险点和验收建议。',
    tests: '请生成测试建议，包含测试范围、关键用例、边界条件、回归点和建议执行命令。',
    commit: '请生成提交说明草稿，包含背景、变更点、测试说明和风险提示。'
  }
  return `${context}\n\n${instructions[mode]}`
}

async function loadHistory(): Promise<void> {
  history.value = await devtoolsApi.ai.getHistory(
    taskType,
    selectedProjectId.value || undefined,
    selectedTaskId.value || undefined
  )
}

async function loadProjects(): Promise<void> {
  await loadProjectContext()
}

async function loadTasks(): Promise<void> {
  if (!selectedProjectId.value) {
    tasks.value = []
    selectedTaskId.value = ''
    return
  }
  tasks.value = await devtoolsApi.projects.listTasks({ projectId: selectedProjectId.value })
  if (selectedTaskId.value && !tasks.value.some((item) => item.id === selectedTaskId.value)) {
    selectedTaskId.value = ''
  }
}

function loadTaskDraftFromStorage(): void {
  const source = localStorage.getItem('codexbox:ai-generate-draft')
  if (!source) return
  localStorage.removeItem('codexbox:ai-generate-draft')
  try {
    const draft = JSON.parse(source) as {
      projectId?: string
      taskId?: string
      prompt?: string
      mode?: typeof taskPromptMode.value
    }
    selectedProjectId.value = draft.projectId || selectedProjectId.value
    selectedTaskId.value = draft.taskId || selectedTaskId.value
    if (draft.mode === 'plan' || draft.mode === 'tests' || draft.mode === 'commit') taskPromptMode.value = draft.mode
    if (draft.prompt?.trim()) {
      prompt.value = draft.prompt
      templateVariables.value = { ...templateVariables.value, requiredFields: draft.prompt }
    }
  } catch {
    status.value = '任务上下文草稿读取失败'
    statusType.value = 'error'
  }
}

async function loadTemplates(): Promise<void> {
  templates.value = await devtoolsApi.ai.getPromptTemplates(taskType)
  selectedTemplateId.value = templates.value[0]?.id ?? ''
  templateDraft.value = templates.value[0]?.content ?? ''
  await applyProjectDefaultTemplate()
  syncTemplateVariables()
}

async function applyProjectDefaultTemplate(): Promise<void> {
  if (!selectedProjectId.value) return
  const templateId = await devtoolsApi.ai.getProjectPromptDefault(selectedProjectId.value, taskType)
  if (templateId && templates.value.some((item) => item.id === templateId)) {
    selectedTemplateId.value = templateId
    templateDraft.value = selectedTemplate.value?.content ?? templateDraft.value
  }
}

function syncTemplateVariables(): void {
  const nextVariables: Record<string, string> = {}
  for (const name of templateVariableNames.value) {
    nextVariables[name] = templateVariables.value[name] ?? (name === 'requiredFields' ? prompt.value : '')
  }
  templateVariables.value = nextVariables
}

function applyTemplate(): void {
  if (!templateDraft.value.trim()) return
  syncTemplateVariables()
  prompt.value = renderPromptTemplate(templateDraft.value, templateVariables.value)
  status.value = selectedTemplate.value ? `已应用模板：${selectedTemplate.value.name}` : '已应用当前模板草稿'
  statusType.value = 'idle'
}

function applyTaskPrompt(): void {
  if (!selectedProject.value) {
    showToast('请先选择项目', 'error')
    return
  }
  prompt.value = buildTaskPrompt(taskPromptMode.value)
  templateVariables.value = { ...templateVariables.value, requiredFields: prompt.value }
  status.value = selectedTask.value ? `已载入任务上下文：${selectedTask.value.title}` : '已载入项目上下文'
  statusType.value = 'success'
}

async function saveCurrentHistory(model: string): Promise<void> {
  if (!output.value.trim()) return
  try {
    history.value = await devtoolsApi.ai.saveHistory({
      taskType,
      title: prompt.value.trim().split(/\r?\n/)[0]?.slice(0, 60) || '代码生成',
      prompt: prompt.value,
      output: output.value,
      model,
      projectId: selectedProjectId.value || undefined,
      taskId: selectedTaskId.value || undefined,
      sourceType: selectedTaskId.value ? 'task' : selectedProjectId.value ? 'project' : 'manual',
      sourceRef: selectedTaskId.value || selectedProjectId.value || undefined
    })
  } catch (error) {
    status.value = showOperationError(error, '保存代码生成历史失败')
    statusType.value = 'error'
  }
}

async function generateCode(): Promise<void> {
  if (!config.value.hasApiKey) {
    status.value = '请先在设置页配置当前模型平台 API Key，再执行 AI 生成'
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  loading.value = true
  output.value = ''
  status.value = '生成中'
  statusType.value = 'idle'

  const stream = await devtoolsApi.ai.generateTextStream(
    {
      taskType: 'generate-code',
      prompt: prompt.value
    },
    (event) => {
      if (event.type === 'chunk') {
        output.value += event.text
        return
      }

      if (event.type === 'done') {
        loading.value = false
        activeRequestId.value = ''
        status.value = `生成完成 · ${event.model}`
        statusType.value = 'success'
        showToast(status.value, 'success')
        void saveCurrentHistory(event.model)
        return
      }

      if (event.type === 'canceled') {
        loading.value = false
        activeRequestId.value = ''
        status.value = '已停止生成'
        statusType.value = 'idle'
        showToast(status.value, 'info')
        return
      }

      loading.value = false
      activeRequestId.value = ''
      output.value = event.error
      status.value = event.error
      statusType.value = 'error'
      showToast(status.value, 'error')
    }
  )

  activeRequestId.value = stream.requestId
}

async function stopGeneration(): Promise<void> {
  if (!activeRequestId.value) return
  await devtoolsApi.ai.cancelStream(activeRequestId.value)
}

async function copyOutput(): Promise<void> {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  showToast('AI 输出已复制', 'success')
}

async function copyFirstCodeBlock(): Promise<void> {
  const match = output.value.match(/```(?:[\w-]+)?\s*([\s\S]*?)```/)
  const codeBlock = match?.[1]?.trim()
  if (!codeBlock) {
    showToast('未找到可复制的代码块', 'info')
    return
  }
  await navigator.clipboard.writeText(codeBlock)
  showToast('首个代码块已复制', 'success')
}

async function loadContextFile(): Promise<void> {
  const file = await devtoolsApi.ai.loadContextFile()
  if (!file) return
  prompt.value = `${prompt.value.trim() ? `${prompt.value}\n\n` : ''}上下文文件：${file.path}\n\n${file.content}`
  templateVariables.value = { ...templateVariables.value, requiredFields: prompt.value }
  status.value = `已导入上下文文件：${file.path}`
  statusType.value = 'success'
}

async function openSettings(): Promise<void> {
  await router.push('/settings')
}

async function copyHistoryPrompt(): Promise<void> {
  if (!selectedHistoryItem.value) return
  await navigator.clipboard.writeText(selectedHistoryItem.value.prompt)
  showToast('历史 Prompt 已复制', 'success')
}

async function copyHistoryOutput(): Promise<void> {
  if (!selectedHistoryItem.value) return
  await navigator.clipboard.writeText(selectedHistoryItem.value.output)
  showToast('历史输出已复制', 'success')
}

function loadHistoryItem(item: AiHistoryItem): void {
  prompt.value = item.prompt
  templateVariables.value = { ...templateVariables.value, requiredFields: item.prompt }
  output.value = item.output
  status.value = `已载入历史 · ${item.model}`
  statusType.value = 'success'
}

function viewHistoryItem(item: AiHistoryItem): void {
  selectedHistoryItem.value = item
}

async function rerunHistoryItem(item: AiHistoryItem): Promise<void> {
  loadHistoryItem(item)
  await generateCode()
}

async function deleteHistoryItem(id: string): Promise<void> {
  try {
    await devtoolsApi.ai.deleteHistory(id, taskType)
    await loadHistory()
    status.value = '历史记录已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '删除历史记录失败')
    statusType.value = 'error'
  }
}

async function clearHistory(): Promise<void> {
  if (!history.value.length) return
  if (!window.confirm('确认清空代码生成历史？')) return
  try {
    history.value = await devtoolsApi.ai.clearHistory(taskType, selectedProjectId.value || undefined)
    status.value = '历史记录已清空'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '清空历史记录失败')
    statusType.value = 'error'
  }
}

onMounted(async () => {
  await safeLoadAll([
    { label: '读取 AI 配置', work: loadConfig },
    { label: '读取项目工作区', work: loadProjects },
    { label: '读取项目任务', work: loadTasks },
    { label: '读取 AI 历史', work: loadHistory },
    { label: '读取 Prompt 模板', work: loadTemplates }
  ])
  loadTaskDraftFromStorage()
  await loadTasks()
  await loadHistory()
})

watch(selectedTemplateId, () => {
  templateDraft.value = selectedTemplate.value?.content ?? templateDraft.value
  syncTemplateVariables()
})

watch(templateDraft, () => {
  syncTemplateVariables()
})

watch(selectedProjectId, async () => {
  await loadTasks()
  void loadHistory()
  void applyProjectDefaultTemplate()
})

watch(selectedTaskId, () => {
  void loadHistory()
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>AI 生成代码</h2>
        <p>根据需求生成 TypeScript 实现草稿、使用说明和注意事项。</p>
      </div>
      <div class="toolbar">
        <select v-model="selectedProjectId" class="select select-compact" aria-label="项目工作区">
          <option value="">全部项目</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <select v-model="selectedTaskId" class="select select-compact" aria-label="项目任务" :disabled="!tasks.length">
          <option value="">项目级输出</option>
          <option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
        </select>
        <span class="pill">{{ config.model }}</span>
        <button class="button secondary" type="button" :disabled="!output" @click="copyOutput">
          <Clipboard :size="16" />
          复制
        </button>
        <button class="button secondary" type="button" :disabled="!output" @click="copyFirstCodeBlock">
          <Clipboard :size="16" />
          复制代码
        </button>
        <button class="button secondary" type="button" @click="loadContextFile">导入上下文</button>
        <button v-if="loading" class="button secondary" type="button" @click="stopGeneration">
          <Square :size="16" />
          停止
        </button>
        <button class="button" type="button" :disabled="loading || !prompt" @click="generateCode">
          <Sparkles :size="16" />
          {{ loading ? '生成中' : '生成' }}
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <div class="section">
          <div class="field">
            <label for="generate-template">Prompt 模板</label>
            <div class="inline-row">
              <select id="generate-template" v-model="selectedTemplateId" class="select">
                <option v-for="item in templates" :key="item.id" :value="item.id">
                  {{ item.isBuiltin ? '内置 · ' : '自定义 · ' }}{{ item.name }}
                </option>
              </select>
              <button class="button secondary" type="button" :disabled="!templateDraft.trim()" @click="applyTemplate">
                应用
              </button>
            </div>
            <div v-if="templateVariableNames.length" class="field">
              <label>模板变量</label>
              <div v-for="name in templateVariableNames" :key="name" class="field">
                <label :for="`generate-var-${name}`">{{ name }}</label>
                <textarea
                  v-if="name === 'requiredFields'"
                  :id="`generate-var-${name}`"
                  v-model="templateVariables[name]"
                  class="textarea prompt-template-editor"
                  spellcheck="false"
                />
                <input v-else :id="`generate-var-${name}`" v-model="templateVariables[name]" class="input" />
              </div>
            </div>
          </div>
          <label class="badge" for="generate-prompt">最终需求输入</label>
          <div class="task-context-toolbar">
            <select v-model="taskPromptMode" class="select select-compact" aria-label="任务 Prompt 类型">
              <option value="plan">开发方案</option>
              <option value="tests">测试建议</option>
              <option value="commit">提交说明</option>
            </select>
            <button class="button secondary compact-button" type="button" @click="applyTaskPrompt">
              载入任务上下文
            </button>
            <span v-if="selectedTask" class="badge">当前任务：{{ selectedTask.title }}</span>
          </div>
          <textarea id="generate-prompt" v-model="prompt" class="textarea ai-pane-fixed" spellcheck="false" />
          <button class="button secondary" type="button" @click="loadConfig">
            <RefreshCw :size="16" />
            刷新配置
          </button>
          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              <strong>生成历史</strong>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!history.length"
                @click="clearHistory"
              >
                清空
              </button>
            </div>
            <input v-model="historySearch" class="input" placeholder="搜索历史" />
            <div class="history-list compact-history">
              <div v-for="item in filteredHistory" :key="item.id" class="list-item action-item">
                <button class="plain-list-button" type="button" @click="loadHistoryItem(item)">
                  <strong>{{ item.title }}</strong>
                  <small>
                    {{ item.model }} · {{ item.taskId ? '任务级' : '项目级' }} ·
                    {{ new Date(item.createdAt).toLocaleString() }}
                  </small>
                </button>
                <div class="toolbar">
                  <button class="icon-button" type="button" aria-label="再次执行" @click="rerunHistoryItem(item)">
                    <Sparkles :size="16" />
                  </button>
                  <button class="icon-button" type="button" aria-label="查看详情" @click="viewHistoryItem(item)">
                    <Eye :size="16" />
                  </button>
                  <button class="icon-button" type="button" aria-label="删除历史" @click="deleteHistoryItem(item.id)">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
              <div v-if="!filteredHistory.length" class="empty-state compact-empty">暂无历史记录</div>
            </div>
          </div>
        </div>
        <div class="section">
          <span class="badge">生成结果</span>
          <div
            v-if="output"
            class="output-box ai-output-scroll markdown-output ai-pane-fixed"
            v-html="renderedOutput"
          ></div>
          <div v-else class="empty-state ai-pane-fixed">
            <div class="empty-action">
              <strong>{{ config.hasApiKey ? '生成结果会显示在这里' : '尚未配置模型平台 API Key' }}</strong>
              <span v-if="!config.hasApiKey"
                >可以先继续使用 JSON、API、Git 等非 AI 功能；需要生成代码时请完成模型配置。</span
              >
              <button
                v-if="!config.hasApiKey"
                class="button secondary compact-button"
                type="button"
                @click="openSettings"
              >
                去设置配置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedHistoryItem" class="modal-backdrop" @click.self="selectedHistoryItem = null">
      <section class="history-detail">
        <header class="modal-header">
          <div>
            <h3>{{ selectedHistoryItem.title }}</h3>
            <p>{{ selectedHistoryItem.model }} · {{ new Date(selectedHistoryItem.createdAt).toLocaleString() }}</p>
          </div>
          <button class="button secondary" type="button" @click="selectedHistoryItem = null">关闭</button>
        </header>
        <div class="history-detail-grid">
          <div class="section">
            <div class="meta-row">
              <strong>Prompt</strong>
              <button class="button secondary compact-button" type="button" @click="copyHistoryPrompt">复制</button>
            </div>
            <pre class="output-box history-detail-box">{{ selectedHistoryItem.prompt }}</pre>
          </div>
          <div class="section">
            <div class="meta-row">
              <strong>输出</strong>
              <button class="button secondary compact-button" type="button" @click="copyHistoryOutput">复制</button>
            </div>
            <div class="output-box markdown-output history-detail-box" v-html="renderedHistoryOutput"></div>
          </div>
        </div>
      </section>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
