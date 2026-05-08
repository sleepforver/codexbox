<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Clipboard, Eye, History, RefreshCw, Sparkles, Square, Trash2 } from 'lucide-vue-next'
import type { AiConfigResponse, AiHistoryItem, AiPromptTemplate, AiTaskType, WorkspaceProject } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { renderMarkdown } from '../markdown'
import { extractPromptVariables, renderPromptTemplate } from '../promptTemplates'
import { safeLoadAll } from '../safeLoad'
import { showToast } from '../toast'

const taskType: AiTaskType = 'generate-code'
const prompt = ref('生成一个 TypeScript 函数：接收 GeoJSON FeatureCollection，统计每种 geometry type 的数量。')
const output = ref('')
const status = ref('正在读取 AI 配置')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const loading = ref(false)
const activeRequestId = ref('')
const history = ref<AiHistoryItem[]>([])
const projects = ref<WorkspaceProject[]>([])
const selectedProjectId = ref('')
const templates = ref<AiPromptTemplate[]>([])
const selectedTemplateId = ref('')
const templateDraft = ref('')
const templateVariables = ref<Record<string, string>>({ requiredFields: prompt.value })
const historySearch = ref('')
const selectedHistoryItem = ref<AiHistoryItem | null>(null)
const config = ref<AiConfigResponse>({ hasApiKey: false, model: 'Qwen/Qwen2.5-7B-Instruct' })
const renderedOutput = computed(() => renderMarkdown(output.value))
const renderedHistoryOutput = computed(() => renderMarkdown(selectedHistoryItem.value?.output ?? ''))
const selectedTemplate = computed(() => templates.value.find((item) => item.id === selectedTemplateId.value))
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
  status.value = config.value.hasApiKey ? `硅基流动模型 ${config.value.model} 已就绪` : '未配置 SILICONFLOW_API_KEY'
  statusType.value = config.value.hasApiKey ? 'success' : 'error'
}

async function loadHistory(): Promise<void> {
  history.value = await devtoolsApi.ai.getHistory(taskType, selectedProjectId.value || undefined)
}

async function loadProjects(): Promise<void> {
  projects.value = await devtoolsApi.projects.list()
  selectedProjectId.value = selectedProjectId.value || projects.value[0]?.id || ''
}

async function loadTemplates(): Promise<void> {
  templates.value = await devtoolsApi.ai.getPromptTemplates(taskType)
  selectedTemplateId.value = templates.value[0]?.id ?? ''
  templateDraft.value = templates.value[0]?.content ?? ''
  syncTemplateVariables()
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

async function saveCurrentHistory(model: string): Promise<void> {
  if (!output.value.trim()) return
  history.value = await devtoolsApi.ai.saveHistory({
    taskType,
    title: prompt.value.trim().split(/\r?\n/)[0]?.slice(0, 60) || '代码生成',
    prompt: prompt.value,
    output: output.value,
    model,
    projectId: selectedProjectId.value || undefined
  })
}

async function generateCode(): Promise<void> {
  loading.value = true
  output.value = ''
  status.value = '生成中'
  statusType.value = 'idle'

  const stream = await devtoolsApi.ai.generateTextStream({
    taskType: 'generate-code',
    prompt: prompt.value
  }, (event) => {
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
  })

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
  await devtoolsApi.ai.deleteHistory(id, taskType)
  await loadHistory()
  showToast('历史记录已删除', 'success')
}

async function clearHistory(): Promise<void> {
  if (!history.value.length) return
  if (!window.confirm('确认清空代码生成历史？')) return
  history.value = await devtoolsApi.ai.clearHistory(taskType, selectedProjectId.value || undefined)
  showToast('历史记录已清空', 'success')
}

onMounted(async () => {
  await safeLoadAll([
    { label: '读取 AI 配置', work: loadConfig },
    { label: '读取项目工作区', work: loadProjects },
    { label: '读取 AI 历史', work: loadHistory },
    { label: '读取 Prompt 模板', work: loadTemplates }
  ])
})

watch(selectedTemplateId, () => {
  templateDraft.value = selectedTemplate.value?.content ?? templateDraft.value
  syncTemplateVariables()
})

watch(templateDraft, () => {
  syncTemplateVariables()
})

watch(selectedProjectId, () => {
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
        <span class="pill">{{ config.model }}</span>
        <button class="button secondary" type="button" :disabled="!output" @click="copyOutput">
          <Clipboard :size="16" />
          复制
        </button>
        <button class="button secondary" type="button" :disabled="!output" @click="copyFirstCodeBlock">
          <Clipboard :size="16" />
          复制代码块
        </button>
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
              <button class="button secondary" type="button" :disabled="!templateDraft.trim()" @click="applyTemplate">应用</button>
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
          <textarea id="generate-prompt" v-model="prompt" class="textarea ai-pane-fixed" spellcheck="false" />
          <button class="button secondary" type="button" @click="loadConfig">
            <RefreshCw :size="16" />
            刷新配置
          </button>
          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              <strong>生成历史</strong>
              <button class="button secondary compact-button" type="button" :disabled="!history.length" @click="clearHistory">清空</button>
            </div>
            <input v-model="historySearch" class="input" placeholder="搜索历史" />
            <div class="history-list compact-history">
              <div v-for="item in filteredHistory" :key="item.id" class="list-item action-item">
                <button class="plain-list-button" type="button" @click="loadHistoryItem(item)">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.model }} · {{ new Date(item.createdAt).toLocaleString() }}</small>
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
          <div v-if="output" class="output-box ai-output-scroll markdown-output ai-pane-fixed" v-html="renderedOutput"></div>
          <div v-else class="empty-state ai-pane-fixed">{{ config.hasApiKey ? '生成结果会显示在这里' : '请先在 .env 或设置页配置硅基流动 API Key' }}</div>
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

    <footer class="status-bar" :class="statusType">{{ status }}</footer>
  </section>
</template>
