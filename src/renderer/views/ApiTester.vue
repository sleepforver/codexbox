<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bot, Clock3, Copy, Eye, History, Plus, Save, Send, Square, Trash2 } from 'lucide-vue-next'
import type { AiHistoryItem, AiPromptTemplate, AiTaskType, ApiHistoryItem, ApiMethod, ApiSavedRequest, ApiSendResponse, EnvPair, HeaderPair } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { isApiSendError } from '../ipcGuards'
import { renderMarkdown } from '../markdown'
import { renderPromptTemplate } from '../promptTemplates'
import { safeLoad } from '../safeLoad'
import { showToast } from '../toast'

const aiTaskType: AiTaskType = 'api-debug'
const methods: ApiMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
const method = ref<ApiMethod>('GET')
const url = ref('{{baseUrl}}/get')
const headers = ref<HeaderPair[]>([{ key: 'Accept', value: 'application/json' }])
const queryParams = ref<HeaderPair[]>([{ key: '', value: '' }])
const envVars = ref<EnvPair[]>([])
const body = ref('')
const authMode = ref<'none' | 'bearer' | 'basic'>('none')
const authToken = ref('')
const basicUser = ref('')
const basicPassword = ref('')
const response = ref<ApiSendResponse | null>(null)
const activeTab = ref<'body' | 'headers' | 'summary' | 'ai'>('body')
const loading = ref(false)
const aiLoading = ref(false)
const activeAiRequestId = ref('')
const history = ref<ApiHistoryItem[]>([])
const aiHistory = ref<AiHistoryItem[]>([])
const aiHistorySearch = ref('')
const selectedAiHistoryItem = ref<AiHistoryItem | null>(null)
const savedRequests = ref<ApiSavedRequest[]>([])
const requestName = ref('')
const timeoutMs = ref(30000)
const aiOutput = ref('')
const templates = ref<AiPromptTemplate[]>([])
const selectedTemplateId = ref('')
const templateDraft = ref('')
const status = ref('配置请求并点击发送')
const statusType = ref<'idle' | 'success' | 'error'>('idle')

const responseClass = computed(() => {
  if (!response.value) return ''
  if (!response.value.ok) return 'danger'
  if (response.value.status >= 500) return 'danger'
  if (response.value.status >= 400) return 'warning'
  return 'success'
})
const renderedAiOutput = computed(() => renderMarkdown(aiOutput.value || 'AI 分析结果会显示在这里'))
const renderedHistoryOutput = computed(() => renderMarkdown(selectedAiHistoryItem.value?.output ?? ''))
const selectedTemplate = computed(() => templates.value.find((item) => item.id === selectedTemplateId.value))
const filteredAiHistory = computed(() => {
  const keyword = aiHistorySearch.value.trim().toLowerCase()
  if (!keyword) return aiHistory.value
  return aiHistory.value.filter((item) => {
    return [item.title, item.prompt, item.output, item.model].some((value) => value.toLowerCase().includes(keyword))
  })
})

async function loadState(): Promise<void> {
  const [state, settings, requests, promptTemplates, apiAiHistory] = await Promise.all([
    devtoolsApi.api.getState(),
    devtoolsApi.settings.get(),
    devtoolsApi.api.getSavedRequests(),
    devtoolsApi.ai.getPromptTemplates(aiTaskType),
    devtoolsApi.ai.getHistory(aiTaskType)
  ])
  envVars.value = state.envVars.length ? state.envVars : [{ key: 'baseUrl', value: 'https://httpbin.org' }]
  history.value = state.history
  savedRequests.value = requests
  timeoutMs.value = settings.apiTimeoutMs
  templates.value = promptTemplates
  aiHistory.value = apiAiHistory
  selectedTemplateId.value = promptTemplates[0]?.id ?? ''
  templateDraft.value = promptTemplates[0]?.content ?? ''
}

async function persistState(): Promise<void> {
  const state = await devtoolsApi.api.saveState({
    envVars: envVars.value,
    history: history.value
  })
  envVars.value = state.envVars
  history.value = state.history
}

function resolveVariables(value = ''): string {
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    return envVars.value.find((item) => item.key === key)?.value ?? ''
  })
}

function resolvedHeaders(): HeaderPair[] {
  const items = headers.value.map((header) => ({
    key: resolveVariables(header.key),
    value: resolveVariables(header.value)
  }))

  if (authMode.value === 'bearer' && authToken.value.trim()) {
    items.push({ key: 'Authorization', value: `Bearer ${resolveVariables(authToken.value.trim())}` })
  }

  if (authMode.value === 'basic' && basicUser.value.trim()) {
    const token = btoa(`${resolveVariables(basicUser.value)}:${resolveVariables(basicPassword.value)}`)
    items.push({ key: 'Authorization', value: `Basic ${token}` })
  }

  return items
}

function resolveUrl(): string {
  const resolved = resolveVariables(url.value)
  const params = queryParams.value
    .map((item) => ({ key: resolveVariables(item.key).trim(), value: resolveVariables(item.value) }))
    .filter((item) => item.key)

  if (!params.length) return resolved

  const parsed = new URL(resolved)
  params.forEach((item) => parsed.searchParams.set(item.key, item.value))
  return parsed.toString()
}

function buildCurl(): string {
  const parts = [`curl -X ${method.value}`, `"${resolveUrl()}"`]
  for (const header of resolvedHeaders().filter((item) => item.key.trim())) {
    parts.push(`-H "${header.key}: ${header.value}"`)
  }
  if (!['GET', 'HEAD'].includes(method.value) && body.value.trim()) {
    parts.push(`--data '${resolveVariables(body.value).replace(/'/g, "'\\''")}'`)
  }
  return parts.join(' \\\n  ')
}

function applySelectedTemplate(): void {
  if (!selectedTemplate.value) return
  templateDraft.value = selectedTemplate.value.content
  status.value = `已应用模板：${selectedTemplate.value.name}`
  statusType.value = 'idle'
}

async function saveHistory(item: ApiHistoryItem): Promise<void> {
  history.value = [item, ...history.value.filter((entry) => entry.method !== item.method || entry.url !== item.url)].slice(0, 8)
  await persistState()
}

function addHeader(): void {
  headers.value.push({ key: '', value: '' })
}

function removeHeader(index: number): void {
  headers.value.splice(index, 1)
}

function addQueryParam(): void {
  queryParams.value.push({ key: '', value: '' })
}

function removeQueryParam(index: number): void {
  queryParams.value.splice(index, 1)
}

function addEnv(): void {
  envVars.value.push({ key: '', value: '' })
}

function removeEnv(index: number): void {
  envVars.value.splice(index, 1)
  void persistState()
}

function applyHistory(item: ApiHistoryItem): void {
  method.value = item.method
  url.value = item.url
}

function loadSavedRequest(item: ApiSavedRequest): void {
  requestName.value = item.name
  method.value = item.method
  url.value = item.url
  headers.value = item.headers.length ? item.headers : [{ key: 'Accept', value: 'application/json' }]
  body.value = item.body
  status.value = `已载入请求：${item.name}`
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function saveCurrentRequest(): Promise<void> {
  savedRequests.value = await devtoolsApi.api.saveRequest({
    name: requestName.value || `${method.value} ${url.value}`,
    method: method.value,
    url: url.value,
    headers: headers.value,
    body: body.value
  })
  status.value = '请求已保存'
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function deleteSavedRequest(id: string): Promise<void> {
  savedRequests.value = await devtoolsApi.api.deleteRequest(id)
  status.value = '请求已删除'
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function copyCurl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(buildCurl())
    status.value = 'cURL 已复制'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = error instanceof Error ? error.message : '生成 cURL 失败'
    statusType.value = 'error'
    showToast(status.value, 'error')
  }
}

async function analyzeResponse(): Promise<void> {
  if (!response.value) return
  aiLoading.value = true
  activeTab.value = 'ai'
  let requestUrl = ''
  try {
    requestUrl = resolveUrl()
  } catch (error) {
    aiLoading.value = false
    status.value = error instanceof Error ? error.message : 'URL 格式不正确'
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }
  aiOutput.value = ''
  status.value = 'AI 分析中'
  statusType.value = 'idle'

  const requestAndResponse = JSON.stringify(
    {
      request: { method: method.value, url: requestUrl, headers: resolvedHeaders(), body: resolveVariables(body.value) },
      response: response.value
    },
    null,
    2
  )
  const aiPrompt = templateDraft.value.trim()
    ? renderPromptTemplate(templateDraft.value, { requestAndResponse })
    : requestAndResponse
  const stream = await devtoolsApi.ai.generateTextStream({
    taskType: aiTaskType,
    prompt: aiPrompt
  }, (event) => {
    if (event.type === 'chunk') {
      aiOutput.value += event.text
      return
    }

    if (event.type === 'done') {
      aiLoading.value = false
      activeAiRequestId.value = ''
      status.value = `AI 分析完成 · ${event.model}`
      statusType.value = 'success'
      showToast(status.value, 'success')
      void saveAiHistory(aiPrompt, event.model)
      return
    }

    if (event.type === 'canceled') {
      aiLoading.value = false
      activeAiRequestId.value = ''
      status.value = '已停止 AI 分析'
      statusType.value = 'idle'
      showToast(status.value, 'info')
      return
    }

    aiLoading.value = false
    activeAiRequestId.value = ''
    aiOutput.value = event.error
    status.value = event.error
    statusType.value = 'error'
    showToast(status.value, 'error')
  })

  activeAiRequestId.value = stream.requestId
}

async function saveAiHistory(promptText: string, model: string): Promise<void> {
  if (!aiOutput.value.trim()) return
  aiHistory.value = await devtoolsApi.ai.saveHistory({
    taskType: aiTaskType,
    title: `${method.value} ${url.value}`.slice(0, 60),
    prompt: promptText,
    output: aiOutput.value,
    model
  })
}

function loadAiHistoryItem(item: AiHistoryItem): void {
  aiOutput.value = item.output
  activeTab.value = 'ai'
  status.value = `已载入 AI 历史 · ${item.model}`
  statusType.value = 'success'
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
  aiHistory.value = await devtoolsApi.ai.deleteHistory(id, aiTaskType)
  showToast('AI 历史已删除', 'success')
}

async function clearAiHistory(): Promise<void> {
  if (!aiHistory.value.length) return
  if (!window.confirm('确认清空 API AI 分析历史？')) return
  aiHistory.value = await devtoolsApi.ai.clearHistory(aiTaskType)
  showToast('AI 历史已清空', 'success')
}

async function stopAiAnalysis(): Promise<void> {
  if (!activeAiRequestId.value) return
  await devtoolsApi.ai.cancelStream(activeAiRequestId.value)
}

async function sendRequest(): Promise<void> {
  loading.value = true
  response.value = null
  aiOutput.value = ''
  await persistState()
  let requestUrl = ''

  try {
    requestUrl = resolveUrl()
  } catch (error) {
    loading.value = false
    status.value = error instanceof Error ? error.message : 'URL 格式不正确'
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  const result = await devtoolsApi.api.send({
    method: method.value,
    url: requestUrl,
    headers: resolvedHeaders(),
    body: resolveVariables(body.value),
    timeoutMs: timeoutMs.value
  })

  response.value = result
  loading.value = false

  if (isApiSendError(result)) {
    status.value = result.error
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  status.value = '请求完成'
  statusType.value = 'success'
  showToast(status.value, 'success')
  await saveHistory({ method: method.value, url: url.value, at: new Date().toLocaleString() })
}

watch(method, (value) => {
  if (['GET', 'HEAD'].includes(value)) body.value = ''
})

onMounted(() => {
  void safeLoad('读取 API 测试器状态', loadState)
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>API 测试</h2>
        <p>支持请求集合、本地变量、请求历史、cURL 复制和 AI 错误分析。</p>
      </div>
      <div class="toolbar">
        <button class="button secondary" type="button" @click="copyCurl">
          <Copy :size="16" />
          cURL
        </button>
        <button class="button" type="button" :disabled="loading || !url" @click="sendRequest">
          <Send :size="16" />
          {{ loading ? '发送中' : '发送' }}
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <div class="section">
          <div class="field">
            <label for="api-ai-template">AI 分析模板</label>
            <div class="inline-row">
              <select id="api-ai-template" v-model="selectedTemplateId" class="select" @change="applySelectedTemplate">
                <option v-for="item in templates" :key="item.id" :value="item.id">
                  {{ item.isBuiltin ? '内置 · ' : '自定义 · ' }}{{ item.name }}
                </option>
              </select>
              <button class="button secondary" type="button" :disabled="!selectedTemplate" @click="applySelectedTemplate">应用</button>
            </div>
          </div>

          <div class="request-row">
            <label class="select-field">
              <span>方法</span>
              <select v-model="method" class="select">
                <option v-for="item in methods" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <input v-model="url" class="input" type="url" placeholder="{{baseUrl}}/resource" />
            <button class="button secondary" type="button" :disabled="loading || !url" @click="sendRequest">发送</button>
          </div>

          <div class="field">
            <label for="request-name">请求集合</label>
            <div class="inline-row">
              <input id="request-name" v-model="requestName" class="input" placeholder="请求名称" />
              <button class="button secondary" type="button" @click="saveCurrentRequest">
                <Save :size="16" />
                保存
              </button>
            </div>
            <div class="history-list">
              <div v-for="item in savedRequests" :key="item.id" class="list-item action-item">
                <button class="plain-list-button" type="button" @click="loadSavedRequest(item)">
                  <strong>{{ item.name }}</strong>
                  <small>{{ item.method }} {{ item.url }}</small>
                </button>
                <button class="icon-button" type="button" aria-label="删除请求" @click="deleteSavedRequest(item.id)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
          </div>

          <div class="field">
            <label>环境变量</label>
            <div class="header-list">
              <div v-for="(item, index) in envVars" :key="index" class="header-row">
                <input v-model="item.key" class="input" placeholder="baseUrl" @blur="persistState" />
                <input v-model="item.value" class="input" placeholder="https://httpbin.org" @blur="persistState" />
                <button class="icon-button" type="button" aria-label="删除变量" @click="removeEnv(index)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
            <button class="button secondary" type="button" @click="addEnv">
              <Plus :size="16" />
              添加变量
            </button>
          </div>

          <div class="field">
            <label>Query 参数</label>
            <div class="header-list">
              <div v-for="(item, index) in queryParams" :key="index" class="header-row">
                <input v-model="item.key" class="input" placeholder="Key" />
                <input v-model="item.value" class="input" placeholder="Value 或 {{变量}}" />
                <button class="icon-button" type="button" aria-label="删除 Query 参数" @click="removeQueryParam(index)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
            <button class="button secondary" type="button" @click="addQueryParam">
              <Plus :size="16" />
              添加 Query
            </button>
          </div>

          <div class="field">
            <label for="auth-mode">认证模板</label>
            <select id="auth-mode" v-model="authMode" class="select">
              <option value="none">无认证</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
            </select>
            <input v-if="authMode === 'bearer'" v-model="authToken" class="input" type="password" placeholder="{{token}} 或 Bearer token" />
            <div v-else-if="authMode === 'basic'" class="inline-row">
              <input v-model="basicUser" class="input" placeholder="用户名" />
              <input v-model="basicPassword" class="input" type="password" placeholder="密码" />
            </div>
          </div>

          <div class="field">
            <label>Headers</label>
            <div class="header-list">
              <div v-for="(header, index) in headers" :key="index" class="header-row">
                <input v-model="header.key" class="input" placeholder="Key" />
                <input v-model="header.value" class="input" placeholder="Value 或 {{token}}" />
                <button class="icon-button" type="button" aria-label="删除请求头" @click="removeHeader(index)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
            <button class="button secondary" type="button" @click="addHeader">
              <Plus :size="16" />
              添加 Header
            </button>
          </div>

          <div class="field">
            <label for="api-body">Body</label>
            <textarea id="api-body" v-model="body" class="textarea" spellcheck="false" :disabled="['GET', 'HEAD'].includes(method)" />
          </div>

          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              最近请求
            </div>
            <div class="history-list">
              <button v-for="item in history" :key="`${item.method}:${item.url}`" class="list-item" type="button" @click="applyHistory(item)">
                <strong>{{ item.method }} {{ item.url }}</strong>
                <small>{{ item.at }}</small>
              </button>
            </div>
          </div>

          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              AI 分析历史
              <button class="button secondary compact-button" type="button" :disabled="!aiHistory.length" @click="clearAiHistory">清空</button>
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
                  <button class="icon-button" type="button" aria-label="删除 AI 历史" @click="deleteAiHistoryItem(item.id)">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
              <div v-if="!filteredAiHistory.length" class="empty-state compact-empty">暂无 AI 历史</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="toolbar">
            <span v-if="response?.ok" class="badge" :class="responseClass">{{ response.status }} {{ response.statusText }}</span>
            <span v-else-if="response" class="badge danger">请求失败</span>
            <span v-else class="badge">等待请求</span>
            <span v-if="response" class="meta-row"><Clock3 :size="15" />{{ response.durationMs }}ms</span>
            <button class="button secondary" type="button" :disabled="!response || aiLoading" @click="analyzeResponse">
              <Bot :size="16" />
              {{ aiLoading ? '分析中' : 'AI 分析' }}
            </button>
            <button v-if="aiLoading" class="button secondary" type="button" @click="stopAiAnalysis">
              <Square :size="16" />
              停止
            </button>
          </div>

          <div class="tabs">
            <button class="tab-button" :class="{ active: activeTab === 'body' }" type="button" @click="activeTab = 'body'">Body</button>
            <button class="tab-button" :class="{ active: activeTab === 'headers' }" type="button" @click="activeTab = 'headers'">Headers</button>
            <button class="tab-button" :class="{ active: activeTab === 'summary' }" type="button" @click="activeTab = 'summary'">摘要</button>
            <button class="tab-button" :class="{ active: activeTab === 'ai' }" type="button" @click="activeTab = 'ai'">AI</button>
          </div>

          <pre v-if="response?.ok && activeTab === 'body'" class="output-box">{{ response.body }}</pre>
          <pre v-else-if="response?.ok && activeTab === 'headers'" class="output-box">{{ JSON.stringify(response.headers, null, 2) }}</pre>
          <pre v-else-if="response?.ok && activeTab === 'summary'" class="output-box">{{ JSON.stringify(response.metadata, null, 2) }}</pre>
          <div v-else-if="activeTab === 'ai'" class="output-box ai-output-scroll markdown-output" v-html="renderedAiOutput"></div>
          <pre v-else-if="response && !response.ok" class="output-box">{{ response.error }}</pre>
          <div v-else class="empty-state">响应结果会显示在这里</div>
        </div>
      </div>
    </div>

    <div v-if="selectedAiHistoryItem" class="modal-backdrop" @click.self="selectedAiHistoryItem = null">
      <section class="history-detail">
        <header class="modal-header">
          <div>
            <h3>{{ selectedAiHistoryItem.title }}</h3>
            <p>{{ selectedAiHistoryItem.model }} · {{ new Date(selectedAiHistoryItem.createdAt).toLocaleString() }}</p>
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

    <footer class="status-bar" :class="statusType">{{ status }}</footer>
  </section>
</template>
