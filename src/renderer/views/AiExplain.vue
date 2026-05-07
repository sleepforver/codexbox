<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bot, Clipboard, Eye, History, RefreshCw, Square, Trash2 } from 'lucide-vue-next'
import type { AiConfigResponse, AiHistoryItem, AiPromptTemplate, AiTaskType } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { renderMarkdown } from '../markdown'
import { extractPromptVariables, renderPromptTemplate } from '../promptTemplates'
import { showToast } from '../toast'

const taskType: AiTaskType = 'explain-code'
const code = ref('function add(a: number, b: number) {\n  return a + b\n}')
const output = ref('')
const status = ref('正在读取 AI 配置')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const loading = ref(false)
const activeRequestId = ref('')
const history = ref<AiHistoryItem[]>([])
const templates = ref<AiPromptTemplate[]>([])
const selectedTemplateId = ref('')
const templateDraft = ref('')
const templateVariables = ref<Record<string, string>>({ code: code.value })
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
  history.value = await devtoolsApi.ai.getHistory(taskType)
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
    nextVariables[name] = templateVariables.value[name] ?? (name === 'code' ? code.value : '')
  }
  templateVariables.value = nextVariables
}

function applyTemplate(): void {
  if (!templateDraft.value.trim()) return
  syncTemplateVariables()
  code.value = renderPromptTemplate(templateDraft.value, templateVariables.value)
  status.value = selectedTemplate.value ? `已应用模板：${selectedTemplate.value.name}` : '已应用当前模板草稿'
  statusType.value = 'idle'
}

async function saveCurrentHistory(model: string): Promise<void> {
  if (!output.value.trim()) return
  history.value = await devtoolsApi.ai.saveHistory({
    taskType,
    title: code.value.trim().split(/\r?\n/)[0]?.slice(0, 60) || '代码解释',
    prompt: code.value,
    output: output.value,
    model
  })
}

async function explainCode(): Promise<void> {
  loading.value = true
  output.value = ''
  status.value = '解释中'
  statusType.value = 'idle'

  const stream = await devtoolsApi.ai.generateTextStream({
    taskType: 'explain-code',
    prompt: code.value
  }, (event) => {
    if (event.type === 'chunk') {
      output.value += event.text
      return
    }

    if (event.type === 'done') {
      loading.value = false
      activeRequestId.value = ''
      status.value = `解释完成 · ${event.model}`
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
  code.value = item.prompt
  templateVariables.value = { ...templateVariables.value, code: item.prompt }
  output.value = item.output
  status.value = `已载入历史 · ${item.model}`
  statusType.value = 'success'
}

function viewHistoryItem(item: AiHistoryItem): void {
  selectedHistoryItem.value = item
}

async function rerunHistoryItem(item: AiHistoryItem): Promise<void> {
  loadHistoryItem(item)
  await explainCode()
}

async function deleteHistoryItem(id: string): Promise<void> {
  history.value = await devtoolsApi.ai.deleteHistory(id, taskType)
  showToast('历史记录已删除', 'success')
}

async function clearHistory(): Promise<void> {
  if (!history.value.length) return
  if (!window.confirm('确认清空代码解释历史？')) return
  for (const item of history.value) {
    history.value = await devtoolsApi.ai.deleteHistory(item.id, taskType)
  }
  showToast('历史记录已清空', 'success')
}

onMounted(async () => {
  await Promise.all([loadConfig(), loadHistory(), loadTemplates()])
})

watch(selectedTemplateId, () => {
  templateDraft.value = selectedTemplate.value?.content ?? templateDraft.value
  syncTemplateVariables()
})

watch(templateDraft, () => {
  syncTemplateVariables()
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>AI 解释代码</h2>
        <p>从意图、流程、风险和改进建议四个角度分析代码。</p>
      </div>
      <div class="toolbar">
        <span class="pill">{{ config.model }}</span>
        <button class="button secondary" type="button" :disabled="!output" @click="copyOutput">
          <Clipboard :size="16" />
          复制
        </button>
        <button v-if="loading" class="button secondary" type="button" @click="stopGeneration">
          <Square :size="16" />
          停止
        </button>
        <button class="button" type="button" :disabled="loading || !code" @click="explainCode">
          <Bot :size="16" />
          {{ loading ? '解释中' : '解释' }}
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <div class="section">
          <div class="field">
            <label for="explain-template">Prompt 模板</label>
            <div class="inline-row">
              <select id="explain-template" v-model="selectedTemplateId" class="select">
                <option v-for="item in templates" :key="item.id" :value="item.id">
                  {{ item.isBuiltin ? '内置 · ' : '自定义 · ' }}{{ item.name }}
                </option>
              </select>
              <button class="button secondary" type="button" :disabled="!templateDraft.trim()" @click="applyTemplate">应用</button>
            </div>
            <div v-if="templateVariableNames.length" class="field">
              <label>模板变量</label>
              <div v-for="name in templateVariableNames" :key="name" class="field">
                <label :for="`explain-var-${name}`">{{ name }}</label>
                <textarea
                  v-if="name === 'code'"
                  :id="`explain-var-${name}`"
                  v-model="templateVariables[name]"
                  class="textarea prompt-template-editor"
                  spellcheck="false"
                />
                <input v-else :id="`explain-var-${name}`" v-model="templateVariables[name]" class="input" />
              </div>
            </div>
          </div>
          <label class="badge" for="explain-code">最终代码输入</label>
          <textarea id="explain-code" v-model="code" class="textarea ai-pane-fixed" spellcheck="false" />
          <button class="button secondary" type="button" @click="loadConfig">
            <RefreshCw :size="16" />
            刷新配置
          </button>
          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              <strong>解释历史</strong>
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
                    <Bot :size="16" />
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
          <span class="badge">AI 输出</span>
          <div v-if="output" class="output-box ai-output-scroll markdown-output ai-pane-fixed" v-html="renderedOutput"></div>
          <div v-else class="empty-state ai-pane-fixed">{{ config.hasApiKey ? '解释结果会显示在这里' : '请先在 .env 或设置页配置硅基流动 API Key' }}</div>
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
