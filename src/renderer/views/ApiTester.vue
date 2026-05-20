<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bot, Clock3, Copy, Eye, History, Plus, Save, Search, Send, Square, Trash2 } from 'lucide-vue-next'
import type {
  AiHistoryItem,
  AiPromptTemplate,
  AiTaskType,
  ApiDiscoveredRequest,
  ApiDiscoveryResponse,
  ApiHistoryItem,
  ApiMethod,
  ApiSavedRequest,
  ApiSendResponse,
  EnvPair,
  HeaderPair,
  ProjectTask
} from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { isApiSendError } from '../ipcGuards'
import { renderMarkdown } from '../markdown'
import { renderPromptTemplate } from '../promptTemplates'
import { safeLoad } from '../safeLoad'
import { currentProjectId, loadProjectContext, projects as contextProjects } from '../stores/projectContext'
import { showToast } from '../toast'
import { showOperationError } from '../dbFeedback'

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
type AssertionType = 'status' | 'json-path' | 'field-exists'
interface ApiAssertion {
  type: AssertionType
  path: string
  expected: string
}
interface ApiAssertionResult {
  label: string
  passed: boolean
  message: string
}
interface SavedRequestGroup {
  name: string
  sourceType: NonNullable<ApiSavedRequest['sourceType']>
  requests: ApiSavedRequest[]
}
const assertions = ref<ApiAssertion[]>([{ type: 'status', path: '', expected: '200' }])
const activeTab = ref<'body' | 'headers' | 'summary' | 'assertions' | 'ai'>('body')
const loading = ref(false)
const aiLoading = ref(false)
const activeAiRequestId = ref('')
const history = ref<ApiHistoryItem[]>([])
const aiHistory = ref<AiHistoryItem[]>([])
const aiHistorySearch = ref('')
const selectedAiHistoryItem = ref<AiHistoryItem | null>(null)
const savedRequests = ref<ApiSavedRequest[]>([])
const projects = contextProjects
const selectedProjectId = currentProjectId
const projectTasks = ref<ProjectTask[]>([])
const selectedProjectTaskId = ref('')
const apiDiscovery = ref<ApiDiscoveryResponse | null>(null)
const scanningApis = ref(false)
const importingOpenApi = ref(false)
const importingDiscoveredApis = ref(false)
const discoveryImportMode = ref<'skip' | 'overwrite'>('skip')
const collapsedDiscoveryGroups = ref<Record<string, boolean>>({})
const collapsedSavedRequestGroups = ref<Record<string, boolean>>({})
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
const selectedProject = computed(() => projects.value.find((item) => item.id === selectedProjectId.value) ?? null)
const selectedProjectLabel = computed(() => selectedProject.value?.name ?? '全局')
const discoveredRequests = computed(() => apiDiscovery.value?.groups.flatMap((group) => group.requests) ?? [])
const savedRequestGroups = computed<SavedRequestGroup[]>(() => {
  const groups = new Map<string, SavedRequestGroup>()
  for (const request of savedRequests.value) {
    const name = request.groupName?.trim() || '手动请求'
    const sourceType = request.sourceType ?? 'manual'
    const key = `${sourceType}:${name}`
    const group = groups.get(key) ?? { name, sourceType, requests: [] }
    group.requests.push(request)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
})
const assertionResults = computed(() => evaluateAssertions())
const assertionSummary = computed(() => {
  if (!response.value?.ok || !assertionResults.value.length) return null
  const passed = assertionResults.value.filter((item) => item.passed).length
  return { passed, total: assertionResults.value.length, ok: passed === assertionResults.value.length }
})
const filteredAiHistory = computed(() => {
  const keyword = aiHistorySearch.value.trim().toLowerCase()
  if (!keyword) return aiHistory.value
  return aiHistory.value.filter((item) => {
    return [item.title, item.prompt, item.output, item.model].some((value) => value.toLowerCase().includes(keyword))
  })
})

async function loadState(): Promise<void> {
  await loadProjectContext()
  const [state, settings, requests, promptTemplates, apiAiHistory] = await Promise.all([
    devtoolsApi.api.getState(selectedProjectId.value || undefined),
    devtoolsApi.settings.get(),
    devtoolsApi.api.getSavedRequests(selectedProjectId.value || undefined),
    devtoolsApi.ai.getPromptTemplates(aiTaskType),
    devtoolsApi.ai.getHistory(aiTaskType, selectedProjectId.value || undefined)
  ])
  await loadProjectTasks()
  envVars.value = state.envVars.length ? state.envVars : [{ key: 'baseUrl', value: 'https://httpbin.org' }]
  ensureEnvVariable('token')
  history.value = state.history
  savedRequests.value = requests
  timeoutMs.value = settings.apiTimeoutMs
  templates.value = promptTemplates
  aiHistory.value = apiAiHistory
  selectedTemplateId.value = promptTemplates[0]?.id ?? ''
  await applyProjectDefaultTemplate()
  templateDraft.value = promptTemplates[0]?.content ?? ''
  if (selectedTemplate.value) templateDraft.value = selectedTemplate.value.content
}

async function applyProjectDefaultTemplate(): Promise<void> {
  if (!selectedProjectId.value) return
  const templateId = await devtoolsApi.ai.getProjectPromptDefault(selectedProjectId.value, aiTaskType)
  if (templateId && templates.value.some((item) => item.id === templateId)) selectedTemplateId.value = templateId
}

async function loadProjectTasks(): Promise<void> {
  if (!selectedProjectId.value) {
    projectTasks.value = []
    selectedProjectTaskId.value = ''
    return
  }
  projectTasks.value = await devtoolsApi.projects.listTasks({ projectId: selectedProjectId.value })
  if (selectedProjectTaskId.value && !projectTasks.value.some((item) => item.id === selectedProjectTaskId.value)) {
    selectedProjectTaskId.value = ''
  }
}

async function discoverProjectApis(): Promise<void> {
  if (!selectedProject.value) {
    status.value = '请先选择项目工作区'
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }
  scanningApis.value = true
  apiDiscovery.value = null
  status.value = '正在异步扫描项目 API'
  statusType.value = 'idle'
  try {
    apiDiscovery.value = await devtoolsApi.api.discoverRequests({
      projectId: selectedProject.value.id,
      projectPath: selectedProject.value.path
    })
    collapsedDiscoveryGroups.value = createDiscoveryCollapseState(apiDiscovery.value, true)
    status.value = `扫描完成，发现 ${discoveredRequests.value.length} 个接口`
    statusType.value = discoveredRequests.value.length ? 'success' : 'error'
    showToast(status.value, statusType.value === 'success' ? 'success' : 'error')
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'API 自动扫描失败'
    statusType.value = 'error'
    showToast(status.value, 'error')
  } finally {
    scanningApis.value = false
  }
}

async function importDiscoveredApis(): Promise<void> {
  if (!discoveredRequests.value.length) {
    status.value = '没有可导入的扫描接口'
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }
  importingDiscoveredApis.value = true
  status.value = '正在导入扫描接口'
  try {
    const requests = discoveredRequests.value.map(toPlainDiscoveredRequest)
    savedRequests.value = await devtoolsApi.api.importDiscoveredRequests(
      selectedProjectId.value || undefined,
      requests,
      discoveryImportMode.value
    )
    collapsedSavedRequestGroups.value = createSavedRequestCollapseState(true)
    status.value = '扫描接口导入完成，请在请求集合中查看'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = error instanceof Error ? error.message : '导入扫描接口失败'
    statusType.value = 'error'
    showToast(status.value, 'error')
  } finally {
    importingDiscoveredApis.value = false
  }
}

function toPlainDiscoveredRequest(request: ApiDiscoveredRequest): ApiDiscoveredRequest {
  return {
    id: request.id,
    name: request.name,
    method: request.method,
    url: withBaseUrlPlaceholder(request.url),
    headers: request.headers.map((header) => ({ key: header.key, value: header.value })),
    body: request.body,
    groupName: request.groupName,
    sourceType: request.sourceType,
    sourcePath: request.sourcePath,
    confidence: request.confidence
  }
}

async function loadOpenApiRequests(): Promise<void> {
  importingOpenApi.value = true
  status.value = '正在导入 OpenAPI / Swagger 文档'
  try {
    const result = await devtoolsApi.api.loadOpenApiRequests()
    if (!result) return
    apiDiscovery.value = result
    collapsedDiscoveryGroups.value = createDiscoveryCollapseState(result, true)
    status.value = `OpenAPI 导入完成，发现 ${discoveredRequests.value.length} 个接口`
    statusType.value = discoveredRequests.value.length ? 'success' : 'error'
    showToast(status.value, statusType.value === 'success' ? 'success' : 'error')
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'OpenAPI 导入失败'
    statusType.value = 'error'
    showToast(status.value, 'error')
  } finally {
    importingOpenApi.value = false
  }
}

async function persistState(): Promise<void> {
  try {
    const state = await devtoolsApi.api.saveState(
      {
        envVars: envVars.value,
        history: history.value
      },
      selectedProjectId.value || undefined
    )
    envVars.value = state.envVars
    history.value = state.history
  } catch (error) {
    status.value = showOperationError(error, '保存 API 环境变量或请求历史失败')
    statusType.value = 'error'
  }
}

function resolveVariables(value = ''): string {
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    return envVars.value.find((item) => item.key === key)?.value ?? ''
  })
}

function discoveryGroupKey(group: { sourceType: string; name: string }): string {
  return `${group.sourceType}:${group.name}`
}

function isDiscoveryGroupCollapsed(group: { sourceType: string; name: string }): boolean {
  return collapsedDiscoveryGroups.value[discoveryGroupKey(group)] ?? true
}

function toggleDiscoveryGroup(group: { sourceType: string; name: string }): void {
  const key = discoveryGroupKey(group)
  collapsedDiscoveryGroups.value = {
    ...collapsedDiscoveryGroups.value,
    [key]: !isDiscoveryGroupCollapsed(group)
  }
}

function createDiscoveryCollapseState(result: ApiDiscoveryResponse, collapsed: boolean): Record<string, boolean> {
  return Object.fromEntries(result.groups.map((group) => [discoveryGroupKey(group), collapsed]))
}

function setAllDiscoveryGroupsCollapsed(collapsed: boolean): void {
  if (!apiDiscovery.value) return
  collapsedDiscoveryGroups.value = createDiscoveryCollapseState(apiDiscovery.value, collapsed)
}

function savedRequestGroupKey(group: Pick<SavedRequestGroup, 'sourceType' | 'name'>): string {
  return `${group.sourceType}:${group.name}`
}

function isSavedRequestGroupCollapsed(group: SavedRequestGroup): boolean {
  return collapsedSavedRequestGroups.value[savedRequestGroupKey(group)] ?? true
}

function toggleSavedRequestGroup(group: SavedRequestGroup): void {
  const key = savedRequestGroupKey(group)
  collapsedSavedRequestGroups.value = {
    ...collapsedSavedRequestGroups.value,
    [key]: !isSavedRequestGroupCollapsed(group)
  }
}

function createSavedRequestCollapseState(collapsed: boolean): Record<string, boolean> {
  return Object.fromEntries(savedRequestGroups.value.map((group) => [savedRequestGroupKey(group), collapsed]))
}

function setAllSavedRequestGroupsCollapsed(collapsed: boolean): void {
  collapsedSavedRequestGroups.value = createSavedRequestCollapseState(collapsed)
}

function ensureEnvVariable(key: string, value = ''): void {
  const name = key.trim()
  if (!name) return
  if (envVars.value.some((item) => item.key === name)) return
  envVars.value.push({ key: name, value })
}

function extractTemplateVariables(value = ''): string[] {
  const result = new Set<string>()
  for (const match of value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    result.add(match[1])
  }
  return [...result]
}

function splitDiscoveredUrl(value: string): { path: string; params: HeaderPair[] } {
  const [path, query = ''] = value.split('?')
  const params = query
    .split('&')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [rawKey, ...rawValue] = item.split('=')
      return {
        key: decodeURIComponent(rawKey || ''),
        value: decodeURIComponent(rawValue.join('=') || '')
      }
    })
    .filter((item) => item.key)
  return { path: path || '/', params }
}

function withBaseUrlPlaceholder(value: string): string {
  const text = value.trim()
  if (!text) return '{{baseUrl}}'
  if (/^(https?:)?\/\//i.test(text) || text.startsWith('{{')) return text
  return `{{baseUrl}}${text.startsWith('/') ? text : `/${text}`}`
}

function syncVariablesFromRequest(item: ApiDiscoveredRequest, params: HeaderPair[]): void {
  for (const key of extractTemplateVariables(item.url)) ensureEnvVariable(key)
  for (const key of extractTemplateVariables(item.body)) ensureEnvVariable(key)
  for (const param of params) {
    for (const key of extractTemplateVariables(param.value)) ensureEnvVariable(key)
  }
  for (const header of item.headers) {
    for (const key of extractTemplateVariables(header.key)) ensureEnvVariable(key)
    for (const key of extractTemplateVariables(header.value)) ensureEnvVariable(key)
  }
  if (item.headers.some((header) => header.key.toLowerCase() === 'authorization' && /token/i.test(header.value))) {
    authMode.value = 'bearer'
    authToken.value = '{{token}}'
    ensureEnvVariable('token')
  }
}

function applyTokenVariable(): void {
  ensureEnvVariable('token')
  authMode.value = 'bearer'
  authToken.value = '{{token}}'
  void persistState()
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

function readPathValue(source: unknown, path: string): { matched: boolean; value: unknown } {
  const normalized = path.trim().replace(/^\$\.?/, '')
  if (!normalized) return { matched: true, value: source }

  const segments = normalized
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let current = source
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { matched: false, value: undefined }
      current = current[index]
      continue
    }
    if (current !== null && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment]
      continue
    }
    return { matched: false, value: undefined }
  }

  return { matched: true, value: current }
}

function normalizeAssertionValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function evaluateAssertions(): ApiAssertionResult[] {
  if (!response.value?.ok) return []
  let parsedBody: unknown = null
  let jsonParsed = false

  if (response.value.metadata.isJson && response.value.body.trim()) {
    try {
      parsedBody = JSON.parse(response.value.body)
      jsonParsed = true
    } catch {
      jsonParsed = false
    }
  }

  return assertions.value
    .filter((item) => item.expected.trim() || item.path.trim())
    .map((item) => {
      if (item.type === 'status') {
        const expectedStatus = Number(item.expected.trim())
        const passed = Boolean(
          Number.isInteger(expectedStatus) && response.value?.ok && response.value.status === expectedStatus
        )
        return {
          label: '状态码',
          passed,
          message: passed
            ? `状态码等于 ${expectedStatus}`
            : `期望 ${item.expected || '未填写'}，实际 ${response.value?.ok ? response.value.status : '请求失败'}`
        }
      }

      if (!jsonParsed) {
        return { label: item.path || 'JSONPath', passed: false, message: '响应 Body 不是可解析的 JSON' }
      }

      const pathResult = readPathValue(parsedBody, item.path)
      if (item.type === 'field-exists') {
        return {
          label: item.path || '字段存在',
          passed: pathResult.matched,
          message: pathResult.matched ? '字段存在' : '未匹配到字段'
        }
      }

      const actual = normalizeAssertionValue(pathResult.value)
      const expected = item.expected.trim()
      return {
        label: item.path || 'JSONPath',
        passed: pathResult.matched && actual === expected,
        message: pathResult.matched ? `期望 ${expected || '空'}，实际 ${actual}` : '未匹配到路径'
      }
    })
}

function addAssertion(): void {
  assertions.value.push({ type: 'json-path', path: '', expected: '' })
}

function removeAssertion(index: number): void {
  assertions.value.splice(index, 1)
}

function applySelectedTemplate(): void {
  if (!selectedTemplate.value) return
  templateDraft.value = selectedTemplate.value.content
  status.value = `已应用模板：${selectedTemplate.value.name}`
  statusType.value = 'idle'
}

async function saveHistory(item: ApiHistoryItem): Promise<void> {
  history.value = [
    item,
    ...history.value.filter((entry) => entry.method !== item.method || entry.url !== item.url)
  ].slice(0, 8)
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
  url.value = withBaseUrlPlaceholder(item.url)
}

function loadSavedRequest(item: ApiSavedRequest): void {
  requestName.value = item.name
  method.value = item.method
  url.value = withBaseUrlPlaceholder(item.url)
  headers.value = item.headers.length ? item.headers : [{ key: 'Accept', value: 'application/json' }]
  body.value = item.body
  selectedProjectTaskId.value = item.taskId ?? ''
  status.value = `已载入请求：${item.name}`
  statusType.value = 'success'
  showToast(status.value, 'success')
}

function loadDiscoveredRequest(item: ApiDiscoveredRequest): void {
  const requestUrl = withBaseUrlPlaceholder(item.url)
  const parsedUrl = splitDiscoveredUrl(requestUrl)
  requestName.value = item.name
  method.value = item.method
  url.value = parsedUrl.path
  queryParams.value = parsedUrl.params.length ? parsedUrl.params : [{ key: '', value: '' }]
  headers.value = item.headers.length ? item.headers : [{ key: 'Accept', value: 'application/json' }]
  body.value = item.body
  syncVariablesFromRequest(item, parsedUrl.params)
  for (const key of extractTemplateVariables(requestUrl)) ensureEnvVariable(key)
  void persistState()
  status.value = `已载入扫描接口：${item.name}`
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function saveCurrentRequest(): Promise<void> {
  status.value = '正在保存 API 请求'
  statusType.value = 'idle'
  try {
    savedRequests.value = await devtoolsApi.api.saveRequest({
      name: requestName.value || `${method.value} ${url.value}`,
      method: method.value,
      url: url.value,
      headers: headers.value,
      body: body.value,
      projectId: selectedProjectId.value || undefined,
      taskId: selectedProjectTaskId.value || undefined
    })
    status.value = 'API 请求已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '保存 API 请求失败')
    statusType.value = 'error'
  }
}

async function deleteSavedRequest(id: string): Promise<void> {
  status.value = '正在删除 API 请求'
  statusType.value = 'idle'
  try {
    await devtoolsApi.api.deleteRequest(id)
    savedRequests.value = await devtoolsApi.api.getSavedRequests(selectedProjectId.value || undefined)
    status.value = 'API 请求已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '删除 API 请求失败')
    statusType.value = 'error'
  }
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
      request: {
        method: method.value,
        url: requestUrl,
        headers: resolvedHeaders(),
        body: resolveVariables(body.value)
      },
      response: response.value
    },
    null,
    2
  )
  const aiPrompt = templateDraft.value.trim()
    ? renderPromptTemplate(templateDraft.value, { requestAndResponse })
    : requestAndResponse
  const stream = await devtoolsApi.ai.generateTextStream(
    {
      taskType: aiTaskType,
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
    }
  )

  activeAiRequestId.value = stream.requestId
}

async function saveAiHistory(promptText: string, model: string): Promise<void> {
  if (!aiOutput.value.trim()) return
  try {
    aiHistory.value = await devtoolsApi.ai.saveHistory({
      taskType: aiTaskType,
      title: `${method.value} ${url.value}`.slice(0, 60),
      prompt: promptText,
      output: aiOutput.value,
      model,
      projectId: selectedProjectId.value || undefined,
      taskId: selectedProjectTaskId.value || undefined,
      sourceType: selectedProjectTaskId.value ? 'task' : 'api_response',
      sourceRef: selectedProjectTaskId.value || `${method.value} ${url.value}`
    })
  } catch (error) {
    status.value = showOperationError(error, '保存 API AI 分析历史失败')
    statusType.value = 'error'
  }
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
  try {
    await devtoolsApi.ai.deleteHistory(id, aiTaskType)
    aiHistory.value = await devtoolsApi.ai.getHistory(aiTaskType, selectedProjectId.value || undefined)
    status.value = 'AI 历史已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '删除 AI 历史失败')
    statusType.value = 'error'
  }
}

async function clearAiHistory(): Promise<void> {
  if (!aiHistory.value.length) return
  if (!window.confirm('确认清空 API AI 分析历史？')) return
  try {
    aiHistory.value = await devtoolsApi.ai.clearHistory(aiTaskType, selectedProjectId.value || undefined)
    status.value = 'AI 历史已清空'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '清空 AI 历史失败')
    statusType.value = 'error'
  }
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
  if (assertions.value.some((item) => item.expected.trim() || item.path.trim())) {
    activeTab.value = 'assertions'
  }
  showToast(status.value, 'success')
  await saveHistory({ method: method.value, url: url.value, at: new Date().toLocaleString() })
}

watch(method, (value) => {
  if (['GET', 'HEAD'].includes(value)) body.value = ''
})

watch(selectedProjectId, () => {
  void safeLoad('切换项目数据', async () => {
    const [requests, apiState, historyItems] = await Promise.all([
      devtoolsApi.api.getSavedRequests(selectedProjectId.value || undefined),
      devtoolsApi.api.getState(selectedProjectId.value || undefined),
      devtoolsApi.ai.getHistory(aiTaskType, selectedProjectId.value || undefined)
    ])
    await loadProjectTasks()
    savedRequests.value = requests
    envVars.value = apiState.envVars
    ensureEnvVariable('token')
    aiHistory.value = historyItems
    await applyProjectDefaultTemplate()
    templateDraft.value = selectedTemplate.value?.content ?? templateDraft.value
  })
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
        <select v-model="selectedProjectId" class="select select-compact" aria-label="项目工作区">
          <option value="">全部项目</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <select
          v-model="selectedProjectTaskId"
          class="select select-compact"
          aria-label="关联项目任务"
          :disabled="!projectTasks.length"
        >
          <option value="">不关联任务</option>
          <option v-for="task in projectTasks" :key="task.id" :value="task.id">{{ task.title }}</option>
        </select>
        <button class="button secondary" type="button" @click="copyCurl">
          <Copy :size="16" />
          cURL
        </button>
        <button
          class="button secondary"
          type="button"
          :disabled="scanningApis || !selectedProject"
          @click="discoverProjectApis"
        >
          <Search :size="16" />
          {{ scanningApis ? '扫描中' : '扫描 API' }}
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

          <div class="request-row">
            <label class="select-field">
              <span>方法</span>
              <select v-model="method" class="select">
                <option v-for="item in methods" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
            <input v-model="url" class="input" type="url" placeholder="{{baseUrl}}/resource" />
            <button class="button secondary" type="button" :disabled="loading || !url" @click="sendRequest">
              发送
            </button>
          </div>

          <div class="field">
            <div class="meta-row">
              <label for="request-name">请求集合</label>
              <span class="badge">{{ savedRequests.length }}</span>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!savedRequestGroups.length"
                @click="setAllSavedRequestGroupsCollapsed(false)"
              >
                展开分组
              </button>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!savedRequestGroups.length"
                @click="setAllSavedRequestGroupsCollapsed(true)"
              >
                收起分组
              </button>
            </div>
            <div class="inline-row">
              <input id="request-name" v-model="requestName" class="input" placeholder="请求名称" />
              <button class="button secondary" type="button" @click="saveCurrentRequest">
                <Save :size="16" />
                保存
              </button>
            </div>
            <div class="history-list api-request-list">
              <div
                v-for="group in savedRequestGroups"
                :key="savedRequestGroupKey(group)"
                class="list-item discovery-group"
              >
                <button
                  class="plain-list-button discovery-group-header"
                  type="button"
                  @click="toggleSavedRequestGroup(group)"
                >
                  <span>
                    <strong>{{ group.name }}</strong>
                    <small>{{ group.sourceType }} · {{ group.requests.length }} 个接口</small>
                  </span>
                  <span class="badge">{{ isSavedRequestGroupCollapsed(group) ? '展开' : '收起' }}</span>
                </button>
                <div v-if="!isSavedRequestGroupCollapsed(group)" class="stack discovery-group-list">
                  <div v-for="item in group.requests" :key="item.id" class="action-item api-request-item">
                    <button
                      class="plain-list-button discovered-api-button"
                      type="button"
                      @click="loadSavedRequest(item)"
                    >
                      <span class="method-badge">{{ item.method }}</span>
                      <span class="discovered-api-text">
                        <strong>{{ item.name }}</strong>
                        <small>{{ withBaseUrlPlaceholder(item.url) }}</small>
                      </span>
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      aria-label="删除请求"
                      @click="deleteSavedRequest(item.id)"
                    >
                      <Trash2 :size="16" />
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="!savedRequests.length" class="empty-state compact-empty">暂无保存的请求</div>
            </div>
          </div>

          <div class="field">
            <div class="meta-row">
              <label>环境变量</label>
              <span class="badge">{{ selectedProjectLabel }}</span>
            </div>
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
            <label for="auth-mode">认证模式</label>
            <div class="inline-row">
              <select id="auth-mode" v-model="authMode" class="select">
                <option value="none">无认证</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
              </select>
              <button class="button secondary compact-button" type="button" @click="applyTokenVariable">
                使用 token 变量
              </button>
            </div>
            <input
              v-if="authMode === 'bearer'"
              v-model="authToken"
              class="input"
              type="password"
              placeholder="{{token}} ? Bearer token"
            />
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
                <input v-model="header.value" class="input" placeholder="Value ? {{token}}" />
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
            <textarea
              id="api-body"
              v-model="body"
              class="textarea"
              spellcheck="false"
              :disabled="['GET', 'HEAD'].includes(method)"
            />
          </div>

          <div class="field">
            <div class="meta-row">
              <label>响应断言</label>
              <span v-if="assertionSummary" class="badge" :class="assertionSummary.ok ? 'success' : 'danger'">
                {{ assertionSummary.passed }}/{{ assertionSummary.total }}
              </span>
            </div>
            <div class="assertion-list">
              <div v-for="(item, index) in assertions" :key="index" class="assertion-row">
                <select v-model="item.type" class="select">
                  <option value="status">状态码</option>
                  <option value="json-path">JSONPath 等于</option>
                  <option value="field-exists">字段存在</option>
                </select>
                <input
                  v-model="item.path"
                  class="input"
                  :disabled="item.type === 'status'"
                  placeholder="data.items[0].id"
                />
                <input
                  v-model="item.expected"
                  class="input"
                  :disabled="item.type === 'field-exists'"
                  :placeholder="item.type === 'status' ? '200' : '期望值'"
                />
                <button class="icon-button" type="button" aria-label="删除断言" @click="removeAssertion(index)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
            <button class="button secondary" type="button" @click="addAssertion">
              <Plus :size="16" />
              添加断言
            </button>
          </div>

          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              最近请求
            </div>
            <div class="history-list">
              <button
                v-for="item in history"
                :key="`${item.method}:${item.url}`"
                class="list-item"
                type="button"
                @click="applyHistory(item)"
              >
                <strong>{{ item.method }} {{ item.url }}</strong>
                <small>{{ item.at }}</small>
              </button>
            </div>
          </div>

          <div class="section">
            <div class="meta-row">
              <History :size="16" />
              AI 分析历史
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!aiHistory.length"
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
          <div class="api-discovery-panel">
            <div class="meta-row">
              <Search :size="16" />
              <strong>API 自动发现</strong>
              <span v-if="apiDiscovery" class="badge"
                >{{ apiDiscovery.projectType }} · {{ discoveredRequests.length }}</span
              >
            </div>
            <div class="toolbar api-discovery-toolbar">
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="scanningApis || !selectedProject"
                @click="discoverProjectApis"
              >
                {{ scanningApis ? '扫描中' : '扫描当前项目' }}
              </button>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="importingOpenApi"
                @click="loadOpenApiRequests"
              >
                {{ importingOpenApi ? '导入中' : '导入 OpenAPI' }}
              </button>
              <select v-model="discoveryImportMode" class="select select-compact">
                <option value="skip">跳过重复</option>
                <option value="overwrite">覆盖重复</option>
              </select>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!apiDiscovery"
                @click="setAllDiscoveryGroupsCollapsed(false)"
              >
                展开分组
              </button>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!apiDiscovery"
                @click="setAllDiscoveryGroupsCollapsed(true)"
              >
                收起分组
              </button>
              <button
                class="button compact-button"
                type="button"
                :disabled="importingDiscoveredApis || !discoveredRequests.length"
                @click="importDiscoveredApis"
              >
                {{ importingDiscoveredApis ? '导入中' : '导入扫描结果' }}
              </button>
            </div>
            <div v-if="apiDiscovery" class="history-list api-discovery-list">
              <div
                v-for="group in apiDiscovery.groups"
                :key="discoveryGroupKey(group)"
                class="list-item discovery-group"
              >
                <button
                  class="plain-list-button discovery-group-header"
                  type="button"
                  @click="toggleDiscoveryGroup(group)"
                >
                  <span>
                    <strong>{{ group.name }}</strong>
                    <small>{{ group.sourceType }} · {{ group.requests.length }} 个接口</small>
                  </span>
                  <span class="badge">{{ isDiscoveryGroupCollapsed(group) ? '展开' : '收起' }}</span>
                </button>
                <div v-if="!isDiscoveryGroupCollapsed(group)" class="stack discovery-group-list">
                  <button
                    v-for="item in group.requests"
                    :key="item.id"
                    class="plain-list-button discovered-api-button"
                    type="button"
                    @click="loadDiscoveredRequest(item)"
                  >
                    <span class="method-badge">{{ item.method }}</span>
                    <span class="discovered-api-text">
                      <strong>{{ item.url }}</strong>
                      <small>{{ item.sourcePath }} · 置信度 {{ item.confidence }}%</small>
                    </span>
                  </button>
                </div>
              </div>
              <div v-for="warning in apiDiscovery.warnings" :key="warning" class="badge warning">{{ warning }}</div>
            </div>
            <div v-else class="empty-state compact-empty">选择项目后扫描 Controller、fetch 或 axios 调用</div>
          </div>

          <div class="toolbar">
            <span v-if="response?.ok" class="badge" :class="responseClass"
              >{{ response.status }} {{ response.statusText }}</span
            >
            <span v-else-if="response" class="badge danger">请求失败</span>
            <span v-else class="badge">等待请求</span>
            <span v-if="assertionSummary" class="badge" :class="assertionSummary.ok ? 'success' : 'danger'">
              断言 {{ assertionSummary.passed }}/{{ assertionSummary.total }}
            </span>
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
            <button
              class="tab-button"
              :class="{ active: activeTab === 'body' }"
              type="button"
              @click="activeTab = 'body'"
            >
              Body
            </button>
            <button
              class="tab-button"
              :class="{ active: activeTab === 'headers' }"
              type="button"
              @click="activeTab = 'headers'"
            >
              Headers
            </button>
            <button
              class="tab-button"
              :class="{ active: activeTab === 'summary' }"
              type="button"
              @click="activeTab = 'summary'"
            >
              摘要
            </button>
            <button
              class="tab-button"
              :class="{ active: activeTab === 'assertions' }"
              type="button"
              @click="activeTab = 'assertions'"
            >
              断言
            </button>
            <button class="tab-button" :class="{ active: activeTab === 'ai' }" type="button" @click="activeTab = 'ai'">
              AI
            </button>
          </div>

          <pre v-if="response?.ok && activeTab === 'body'" class="output-box">{{ response.body }}</pre>
          <pre v-else-if="response?.ok && activeTab === 'headers'" class="output-box">{{
            JSON.stringify(response.headers, null, 2)
          }}</pre>
          <pre v-else-if="response?.ok && activeTab === 'summary'" class="output-box">{{
            JSON.stringify(response.metadata, null, 2)
          }}</pre>
          <div v-else-if="activeTab === 'assertions'" class="output-box assertion-output">
            <div v-if="assertionResults.length" class="history-list">
              <div
                v-for="item in assertionResults"
                :key="`${item.label}:${item.message}`"
                class="list-item assertion-result"
              >
                <span class="badge" :class="item.passed ? 'success' : 'danger'">{{
                  item.passed ? '通过' : '失败'
                }}</span>
                <strong>{{ item.label }}</strong>
                <small>{{ item.message }}</small>
              </div>
            </div>
            <div v-else class="empty-state compact-empty">发送请求后显示断言结果</div>
          </div>
          <div
            v-else-if="activeTab === 'ai'"
            class="output-box ai-output-scroll markdown-output"
            v-html="renderedAiOutput"
          ></div>
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

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
