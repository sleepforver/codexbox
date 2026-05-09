<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Bot,
  Clipboard,
  Eye,
  FileDiff,
  GitBranch,
  History,
  ListTree,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2
} from 'lucide-vue-next'
import type {
  AiHistoryItem,
  AiPromptTemplate,
  AiTaskType,
  GitCommand,
  GitCommandResponse,
  WorkspaceProject
} from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { isGitActionError, isGitCommandError, isGitCommitError } from '../ipcGuards'
import { renderMarkdown } from '../markdown'
import { renderPromptTemplate } from '../promptTemplates'
import { safeLoad } from '../safeLoad'
import { showToast } from '../toast'
import { showOperationError } from '../dbFeedback'

const cwd = ref('')
const projects = ref<WorkspaceProject[]>([])
const selectedProjectId = ref('')
const command = ref<Exclude<GitCommand, 'file-diff'>>('status')
const commands: Array<{
  value: Exclude<GitCommand, 'file-diff'>
  label: string
}> = [
  { value: 'status', label: '工作区状态' },
  { value: 'log', label: '最近提交' },
  { value: 'diff', label: '差异摘要' }
]
const selectedPath = ref('')
const selectedChangePaths = ref<string[]>([])
const fileDiff = ref('')
const aiOutput = ref('')
const commitMessage = ref('')
const result = ref<GitCommandResponse | null>(null)
const loading = ref(false)
const aiLoading = ref(false)
const activeAiRequestId = ref('')
const gitAiTaskType = ref<Extract<AiTaskType, 'git-summary' | 'commit-message'>>('git-summary')
const templates = ref<AiPromptTemplate[]>([])
const selectedTemplateId = ref('')
const templateDraft = ref('')
const aiHistory = ref<AiHistoryItem[]>([])
const aiHistorySearch = ref('')
const selectedAiHistoryItem = ref<AiHistoryItem | null>(null)

const statusText = computed(() => {
  if (loading.value) return 'Git 命令执行中'
  if (!result.value) return '仅允许只读查看和文件级暂存操作'
  if (isGitCommandError(result.value)) return result.value.error
  return `git ${result.value.command} 执行完成`
})

const statusType = computed(() => {
  if (!result.value) return 'idle'
  return result.value.ok ? 'success' : 'error'
})
const renderedAiOutput = computed(() => renderMarkdown(aiOutput.value))
const renderedHistoryOutput = computed(() => renderMarkdown(selectedAiHistoryItem.value?.output ?? ''))
const taskTemplates = computed(() => templates.value.filter((item) => item.taskType === gitAiTaskType.value))
const selectedTemplate = computed(() => taskTemplates.value.find((item) => item.id === selectedTemplateId.value))
const filteredAiHistory = computed(() => {
  const keyword = aiHistorySearch.value.trim().toLowerCase()
  const taskHistory = aiHistory.value.filter((item) => item.taskType === gitAiTaskType.value)
  if (!keyword) return taskHistory
  return taskHistory.filter((item) => {
    return [item.title, item.prompt, item.output, item.model].some((value) => value.toLowerCase().includes(keyword))
  })
})
const selectedChanges = computed(() => {
  if (!result.value?.ok || result.value.command !== 'status') return []
  const selected = new Set(selectedChangePaths.value)
  return result.value.status.changes.filter((item) => selected.has(item.path))
})

function syncTemplateSelection(): void {
  if (selectedTemplate.value) {
    templateDraft.value = selectedTemplate.value.content
    return
  }
  selectedTemplateId.value = taskTemplates.value[0]?.id ?? ''
  templateDraft.value = taskTemplates.value[0]?.content ?? ''
}

async function loadTemplates(): Promise<void> {
  templates.value = await devtoolsApi.ai.getPromptTemplates()
  await applyProjectDefaultTemplate()
  syncTemplateSelection()
}

async function applyProjectDefaultTemplate(): Promise<void> {
  if (!selectedProjectId.value) return
  const templateId = await devtoolsApi.ai.getProjectPromptDefault(selectedProjectId.value, gitAiTaskType.value)
  if (templateId && templates.value.some((item) => item.id === templateId)) selectedTemplateId.value = templateId
}

function applySelectedTemplate(): void {
  if (!selectedTemplate.value) return
  templateDraft.value = selectedTemplate.value.content
  showToast(`已应用模板：${selectedTemplate.value.name}`, 'success')
}

async function selectGitAiTask(taskType: Extract<AiTaskType, 'git-summary' | 'commit-message'>): Promise<void> {
  gitAiTaskType.value = taskType
  await applyProjectDefaultTemplate()
  syncTemplateSelection()
}

async function runGit(nextCommand = command.value): Promise<void> {
  command.value = nextCommand
  loading.value = true
  fileDiff.value = ''
  aiOutput.value = ''
  if (nextCommand === 'status') selectedChangePaths.value = []
  result.value = await devtoolsApi.git.run({
    command: command.value,
    cwd: cwd.value || undefined
  })
  loading.value = false
  if (!result.value.ok) showToast(result.value.error, 'error')
}

async function showFileDiff(path: string): Promise<void> {
  selectedPath.value = path
  loading.value = true
  const response = await devtoolsApi.git.run({
    command: 'file-diff',
    cwd: cwd.value || undefined,
    path
  })
  loading.value = false
  result.value = response
  fileDiff.value = response.ok && response.command === 'file-diff' ? response.diff.raw : ''
}

async function runGitAction(action: 'stage-file' | 'unstage-file', path: string): Promise<void> {
  const label = action === 'stage-file' ? '暂存' : '取消暂存'
  if (!window.confirm(`确认${label}文件？\n${path}`)) return
  const response = await devtoolsApi.git.action({
    action,
    cwd: cwd.value || undefined,
    path
  })
  if (isGitActionError(response)) {
    result.value = {
      ok: false,
      command: 'status',
      output: response.output,
      error: response.error
    }
    showToast(response.error, 'error')
    return
  }
  showToast(`${label}完成`, 'success')
  await runGit('status')
}

function toggleChangeSelection(path: string, checked: boolean): void {
  selectedChangePaths.value = checked
    ? [...new Set([...selectedChangePaths.value, path])]
    : selectedChangePaths.value.filter((item) => item !== path)
}

function selectAllChanges(): void {
  if (!result.value?.ok || result.value.command !== 'status') return
  selectedChangePaths.value = result.value.status.changes.map((item) => item.path)
}

function clearChangeSelection(): void {
  selectedChangePaths.value = []
}

async function runBatchGitAction(action: 'stage-file' | 'unstage-file'): Promise<void> {
  if (!selectedChanges.value.length) {
    showToast('请先选择文件', 'info')
    return
  }
  const label = action === 'stage-file' ? '批量暂存' : '批量取消暂存'
  if (!window.confirm(`确认${label} ${selectedChanges.value.length} 个文件？`)) return

  loading.value = true
  for (const change of selectedChanges.value) {
    const response = await devtoolsApi.git.action({
      action,
      cwd: cwd.value || undefined,
      path: change.path
    })
    if (isGitActionError(response)) {
      loading.value = false
      result.value = {
        ok: false,
        command: 'status',
        output: response.output,
        error: response.error
      }
      showToast(response.error, 'error')
      return
    }
  }
  loading.value = false
  selectedChangePaths.value = []
  showToast(`${label}完成`, 'success')
  await runGit('status')
}

function buildChangeMarkdown(): string {
  const status = result.value?.ok && result.value.command === 'status' ? result.value.status : null
  const changes = selectedChanges.value.length ? selectedChanges.value : (status?.changes ?? [])
  const lines = [
    '# Git 变更说明',
    '',
    `工作目录：${cwd.value || '默认目录'}`,
    status ? `分支：${status.branch}` : '',
    ''
  ].filter(Boolean)

  if (!changes.length) {
    lines.push('当前没有未提交变更。')
    return lines.join('\n')
  }

  lines.push('## 文件变更', '')
  changes.forEach((change) => {
    lines.push(`- \`${change.status}\` ${change.path}`)
  })

  if (result.value?.ok && result.value.command === 'diff') {
    lines.push('', '## Diff 摘要', '', '```text', result.value.diff.summary, '```')
  }

  return lines.join('\n')
}

async function copyChangeMarkdown(): Promise<void> {
  await navigator.clipboard.writeText(buildChangeMarkdown())
  showToast('变更说明 Markdown 已复制', 'success')
}

async function generateGitAi(taskType: 'git-summary' | 'commit-message'): Promise<void> {
  gitAiTaskType.value = taskType
  syncTemplateSelection()
  const diffText =
    result.value?.ok && result.value.command === 'file-diff'
      ? result.value.diff.raw
      : result.value?.ok && result.value.command === 'diff'
        ? result.value.diff.raw
        : fileDiff.value
  if (!diffText) {
    showToast('请先查看差异摘要或文件 diff', 'info')
    return
  }
  aiLoading.value = true
  aiOutput.value = ''

  const aiPrompt = templateDraft.value.trim() ? renderPromptTemplate(templateDraft.value, { diff: diffText }) : diffText
  const stream = await devtoolsApi.ai.generateTextStream(
    {
      taskType,
      prompt: aiPrompt
    },
    (event) => {
      if (event.type === 'chunk') {
        aiOutput.value += event.text
        return
      }

      if (event.type === 'done') {
        aiLoading.value = false
        activeAiRequestId.value = ''
        showToast(`AI 生成完成 · ${event.model}`, 'success')
        void saveAiHistory(taskType, aiPrompt, event.model)
        return
      }

      if (event.type === 'canceled') {
        aiLoading.value = false
        activeAiRequestId.value = ''
        showToast('已停止 AI 生成', 'info')
        return
      }

      aiLoading.value = false
      activeAiRequestId.value = ''
      aiOutput.value = event.error
      showToast(event.error, 'error')
    }
  )

  activeAiRequestId.value = stream.requestId
}

async function reviewBeforeCommit(): Promise<void> {
  gitAiTaskType.value = 'git-summary'
  const diffText =
    result.value?.ok && result.value.command === 'diff'
      ? result.value.diff.raw
      : result.value?.ok && result.value.command === 'file-diff'
        ? result.value.diff.raw
        : fileDiff.value
  if (!diffText) {
    await runGit('diff')
  }
  const latestDiff = result.value?.ok && result.value.command === 'diff' ? result.value.diff.raw : diffText
  if (!latestDiff) {
    showToast('没有可审查的 diff', 'info')
    return
  }
  aiLoading.value = true
  aiOutput.value = ''
  const promptText = `请在提交前审查以下 Git diff，按“高风险问题、遗漏测试、边界条件、建议修改”输出。只列实际风险，不要泛泛而谈。\n\n${latestDiff}`
  const stream = await devtoolsApi.ai.generateTextStream({ taskType: 'git-summary', prompt: promptText }, (event) => {
    if (event.type === 'chunk') {
      aiOutput.value += event.text
      return
    }
    aiLoading.value = false
    activeAiRequestId.value = ''
    if (event.type === 'done') {
      showToast(`提交前审查完成 · ${event.model}`, 'success')
      void saveAiHistory('git-summary', promptText, event.model)
    } else if (event.type === 'error') {
      aiOutput.value = event.error
      showToast(event.error, 'error')
    }
  })
  activeAiRequestId.value = stream.requestId
}

async function saveAiHistory(
  taskType: Extract<AiTaskType, 'git-summary' | 'commit-message'>,
  promptText: string,
  model: string
): Promise<void> {
  if (!aiOutput.value.trim()) return
  try {
    aiHistory.value = await devtoolsApi.ai.saveHistory({
      taskType,
      title: taskType === 'git-summary' ? 'Git 变更说明' : 'Commit Message',
      prompt: promptText,
      output: aiOutput.value,
      model,
      projectId: selectedProjectId.value || undefined
    })
  } catch (error) {
    showOperationError(error, '保存 Git AI 历史失败')
  }
}

function loadAiHistoryItem(item: AiHistoryItem): void {
  gitAiTaskType.value = item.taskType as Extract<AiTaskType, 'git-summary' | 'commit-message'>
  syncTemplateSelection()
  aiOutput.value = item.output
  showToast(`已载入 AI 历史 · ${item.model}`, 'success')
}

function viewAiHistoryItem(item: AiHistoryItem): void {
  selectedAiHistoryItem.value = item
}

async function copyHistoryPrompt(): Promise<void> {
  if (!selectedAiHistoryItem.value) return
  await navigator.clipboard.writeText(selectedAiHistoryItem.value.prompt)
  showToast('历史 Prompt 已复制', 'success')
}

async function copyHistoryOutput(): Promise<void> {
  if (!selectedAiHistoryItem.value) return
  await navigator.clipboard.writeText(selectedAiHistoryItem.value.output)
  showToast('历史输出已复制', 'success')
}

async function deleteAiHistoryItem(id: string): Promise<void> {
  try {
    await devtoolsApi.ai.deleteHistory(id)
    aiHistory.value = (await devtoolsApi.ai.getHistory(undefined, selectedProjectId.value || undefined)).filter(
      (item) => item.taskType === 'git-summary' || item.taskType === 'commit-message'
    )
    showToast('AI 历史已删除', 'success')
  } catch (error) {
    showOperationError(error, '删除 Git AI 历史失败')
  }
}

async function clearAiHistory(): Promise<void> {
  const currentItems = aiHistory.value.filter((item) => item.taskType === gitAiTaskType.value)
  if (!currentItems.length) return
  if (!window.confirm('确认清空当前 Git AI 历史？')) return
  try {
    await devtoolsApi.ai.clearHistory(gitAiTaskType.value, selectedProjectId.value || undefined)
    aiHistory.value = (await devtoolsApi.ai.getHistory(undefined, selectedProjectId.value || undefined)).filter(
      (item) => item.taskType === 'git-summary' || item.taskType === 'commit-message'
    )
    showToast('AI 历史已清空', 'success')
  } catch (error) {
    showOperationError(error, '清空 Git AI 历史失败')
  }
}

async function stopGitAi(): Promise<void> {
  if (!activeAiRequestId.value) return
  await devtoolsApi.ai.cancelStream(activeAiRequestId.value)
}

async function copyAiOutput(): Promise<void> {
  if (!aiOutput.value) return
  await navigator.clipboard.writeText(aiOutput.value)
  showToast('AI 输出已复制', 'success')
}

function fillCommitMessageFromAi(): void {
  const message = aiOutput.value.replace(/```(?:[\w-]+)?\s*([\s\S]*?)```/g, '$1').trim()
  if (!message) {
    showToast('没有可填入的 Commit Message', 'info')
    return
  }
  commitMessage.value = message
  showToast('已填入提交信息', 'success')
}

async function commitStagedChanges(): Promise<void> {
  if (!commitMessage.value.trim()) {
    showToast('请先填写提交信息', 'error')
    return
  }
  if (!window.confirm(`确认提交已暂存变更？\n\n${commitMessage.value}`)) return

  loading.value = true
  const response = await devtoolsApi.git.commit({
    cwd: cwd.value || undefined,
    message: commitMessage.value
  })
  loading.value = false

  if (isGitCommitError(response)) {
    result.value = {
      ok: false,
      command: 'status',
      output: response.output,
      error: response.error
    }
    showToast(response.error, 'error')
    return
  }

  showToast('提交完成', 'success')
  commitMessage.value = ''
  await runGit('status')
}

function isStaged(status: string): boolean {
  return status.length > 0 && status[0] !== '?' && status[0] !== ' '
}

onMounted(async () => {
  await safeLoad('读取 Git 助手状态', async () => {
    const [settings, projectItems, historyItems] = await Promise.all([
      devtoolsApi.settings.get(),
      devtoolsApi.projects.list(),
      devtoolsApi.ai.getHistory(),
      loadTemplates()
    ])
    cwd.value = settings.defaultWorkspace
    projects.value = projectItems
    selectedProjectId.value = selectedProjectId.value || projects.value[0]?.id || ''
    if (selectedProjectId.value) {
      cwd.value = projects.value.find((item) => item.id === selectedProjectId.value)?.path ?? cwd.value
    }
    aiHistory.value = historyItems.filter(
      (item) => item.taskType === 'git-summary' || item.taskType === 'commit-message'
    )
  })
})

watch(selectedProjectId, async (id) => {
  const project = projects.value.find((item) => item.id === id)
  if (project) cwd.value = project.path
  await applyProjectDefaultTemplate()
  syncTemplateSelection()
  aiHistory.value = (await devtoolsApi.ai.getHistory(undefined, id || undefined)).filter(
    (item) => item.taskType === 'git-summary' || item.taskType === 'commit-message'
  )
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>Git 助手</h2>
        <p>查看仓库状态、文件 diff，并安全执行文件级暂存或取消暂存。</p>
      </div>
      <div class="toolbar">
        <select v-model="selectedProjectId" class="select select-compact" aria-label="项目工作区">
          <option value="">默认目录</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </select>
        <button class="button" type="button" :disabled="loading" @click="runGit()">
          <RefreshCw :size="16" />
          刷新
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <div class="section">
          <div class="field">
            <label for="git-cwd">工作目录</label>
            <input id="git-cwd" v-model="cwd" class="input" placeholder="留空时使用应用启动目录" />
          </div>

          <label class="select-field">
            <span>只读命令</span>
            <select v-model="command" class="select" :disabled="loading" @change="runGit(command)">
              <option v-for="item in commands" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>

          <div class="tabs">
            <button
              v-for="item in commands"
              :key="item.value"
              class="tab-button"
              :class="{
                active: command === item.value && result?.command !== 'file-diff'
              }"
              type="button"
              :disabled="loading"
              @click="runGit(item.value)"
            >
              {{ item.label }}
            </button>
          </div>

          <div class="field">
            <label for="git-ai-template">Git AI 模板</label>
            <div class="tabs">
              <button
                class="tab-button"
                :class="{ active: gitAiTaskType === 'git-summary' }"
                type="button"
                @click="selectGitAiTask('git-summary')"
              >
                变更说明
              </button>
              <button
                class="tab-button"
                :class="{ active: gitAiTaskType === 'commit-message' }"
                type="button"
                @click="selectGitAiTask('commit-message')"
              >
                Commit Message
              </button>
            </div>
            <div class="inline-row">
              <select id="git-ai-template" v-model="selectedTemplateId" class="select" @change="applySelectedTemplate">
                <option v-for="item in taskTemplates" :key="item.id" :value="item.id">
                  {{ item.isBuiltin ? '内置 · ' : '自定义 · ' }}{{ item.name }}
                </option>
              </select>
              <button
                class="button secondary"
                type="button"
                :disabled="!selectedTemplate"
                @click="applySelectedTemplate"
              >
                应用
              </button>
            </div>
          </div>

          <div class="toolbar">
            <button class="button secondary" type="button" :disabled="aiLoading" @click="generateGitAi('git-summary')">
              <Bot :size="16" />
              变更说明
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="aiLoading"
              @click="generateGitAi('commit-message')"
            >
              <Bot :size="16" />
              Commit Message
            </button>
            <button class="button secondary" type="button" :disabled="aiLoading" @click="reviewBeforeCommit">
              <Bot :size="16" />
              提交前审查
            </button>
            <button class="button secondary" type="button" :disabled="!aiOutput || aiLoading" @click="copyAiOutput">
              <Clipboard :size="16" />
              复制
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="!aiOutput || gitAiTaskType !== 'commit-message'"
              @click="fillCommitMessageFromAi"
            >
              填入提交信息
            </button>
            <button v-if="aiLoading" class="button secondary" type="button" @click="stopGitAi">
              <Square :size="16" />
              停止
            </button>
          </div>

          <div class="field">
            <label for="commit-message">提交信息</label>
            <div class="inline-row">
              <input
                id="commit-message"
                v-model="commitMessage"
                class="input"
                placeholder="例如：feat: 增加 GeoJSON 数据体检"
              />
              <button
                class="button"
                type="button"
                :disabled="loading || !commitMessage.trim()"
                @click="commitStagedChanges"
              >
                提交
              </button>
            </div>
          </div>

          <div class="code-box">
            git
            {{ result?.command === 'file-diff' ? `diff -- ${selectedPath}` : command }}
          </div>
          <div
            v-if="aiOutput"
            class="code-box ai-output-scroll markdown-output git-ai-output"
            v-html="renderedAiOutput"
          ></div>

          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              <strong>Git AI 历史</strong>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!filteredAiHistory.length"
                @click="clearAiHistory"
              >
                清空
              </button>
            </div>
            <input v-model="aiHistorySearch" class="input" placeholder="搜索 AI 历史" />
            <div class="history-list compact-history">
              <div v-for="item in filteredAiHistory" :key="item.id" class="list-item action-item">
                <button class="plain-list-button" type="button" @click="loadAiHistoryItem(item)">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.model }} · {{ new Date(item.createdAt).toLocaleString() }}</small>
                </button>
                <div class="toolbar">
                  <button class="icon-button" type="button" aria-label="查看详情" @click="viewAiHistoryItem(item)">
                    <Eye :size="16" />
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    aria-label="删除 AI 历史"
                    @click="deleteAiHistoryItem(item.id)"
                  >
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
              <div v-if="!filteredAiHistory.length" class="empty-state compact-empty">暂无 AI 历史</div>
            </div>
          </div>
        </div>

        <div class="section">
          <template v-if="result?.ok && result.command === 'status'">
            <div class="meta-row">
              <GitBranch :size="16" />
              <strong>{{ result.status.branch }}</strong>
              <span class="badge">{{ selectedChangePaths.length }}/{{ result.status.changes.length }} 已选择</span>
            </div>
            <div v-if="result.status.changes.length" class="toolbar">
              <button class="button secondary compact-button" type="button" @click="selectAllChanges">全选</button>
              <button class="button secondary compact-button" type="button" @click="clearChangeSelection">
                清空选择
              </button>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="loading || !selectedChangePaths.length"
                @click="runBatchGitAction('stage-file')"
              >
                批量暂存
              </button>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="loading || !selectedChangePaths.length"
                @click="runBatchGitAction('unstage-file')"
              >
                批量取消暂存
              </button>
              <button class="button secondary compact-button" type="button" @click="copyChangeMarkdown">
                复制变更说明
              </button>
            </div>
            <div v-if="result.status.changes.length" class="change-list">
              <div
                v-for="change in result.status.changes"
                :key="`${change.status}:${change.path}`"
                class="list-item action-item git-change-item"
              >
                <input
                  class="check-input"
                  type="checkbox"
                  :checked="selectedChangePaths.includes(change.path)"
                  :aria-label="`选择 ${change.path}`"
                  @change="toggleChangeSelection(change.path, ($event.target as HTMLInputElement).checked)"
                />
                <button class="plain-list-button" type="button" @click="showFileDiff(change.path)">
                  <span class="badge warning">{{ change.status }}</span>
                  <strong>{{ change.path }}</strong>
                  <small>点击查看文件 diff</small>
                </button>
                <button
                  v-if="isStaged(change.status)"
                  class="icon-button"
                  type="button"
                  aria-label="取消暂存"
                  @click="runGitAction('unstage-file', change.path)"
                >
                  <RotateCcw :size="16" />
                </button>
                <button
                  v-else
                  class="icon-button"
                  type="button"
                  aria-label="暂存"
                  @click="runGitAction('stage-file', change.path)"
                >
                  <Plus :size="16" />
                </button>
              </div>
            </div>
            <div v-else class="empty-state">工作区干净</div>
          </template>

          <template v-else-if="result?.ok && result.command === 'log'">
            <div v-if="result.log.commits.length" class="commit-list">
              <div v-for="commit in result.log.commits" :key="commit.hash" class="list-item">
                <span class="badge">{{ commit.hash }}</span>
                <strong>{{ commit.subject }}</strong>
                <small>{{ commit.author }} · {{ commit.date }}</small>
              </div>
            </div>
            <div v-else class="empty-state">没有提交记录</div>
          </template>

          <template v-else-if="result?.ok && result.command === 'diff'">
            <pre class="output-box">{{ result.diff.summary }}</pre>
          </template>

          <template v-else-if="result?.ok && result.command === 'file-diff'">
            <div class="meta-row">
              <FileDiff :size="16" />
              <strong>{{ result.path }}</strong>
            </div>
            <pre class="output-box">{{ fileDiff || result.diff.raw }}</pre>
          </template>

          <pre v-else-if="result && !result.ok" class="output-box"
            >{{ result.error }}{{ result.output ? `\n${result.output}` : '' }}</pre
          >
          <div v-else class="empty-state">
            <div>
              <ListTree :size="30" />
              <p>点击左侧命令查看 Git 输出</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedAiHistoryItem" class="modal-backdrop" @click.self="selectedAiHistoryItem = null">
      <section class="history-detail">
        <header class="modal-header">
          <div>
            <h3>{{ selectedAiHistoryItem.title }}</h3>
            <p>
              {{ selectedAiHistoryItem.model }} ·
              {{ new Date(selectedAiHistoryItem.createdAt).toLocaleString() }}
            </p>
          </div>
          <button class="button secondary" type="button" @click="selectedAiHistoryItem = null">关闭</button>
        </header>
        <div class="history-detail-grid">
          <div class="section">
            <div class="meta-row">
              <strong>Prompt</strong>
              <button class="button secondary compact-button" type="button" @click="copyHistoryPrompt">复制</button>
            </div>
            <pre class="output-box history-detail-box">{{ selectedAiHistoryItem.prompt }}</pre>
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

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">
      {{ statusText }}
    </footer>
  </section>
</template>
