<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FolderOpen, Plus, RefreshCw, Save, Trash2 } from 'lucide-vue-next'
import type {
  AiConnectionResponse,
  AiPromptTemplate,
  AiTaskType,
  AppSettings,
  DatabaseInfo,
  DatabaseMaintenanceCleanupRequest,
  WorkspaceProject
} from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { isAiConnectionError } from '../ipcGuards'
import { extractPromptVariables, renderPromptTemplate } from '../promptTemplates'
import { safeLoadAll } from '../safeLoad'
import { showToast } from '../toast'
import { showOperationError } from '../dbFeedback'

const taskOptions: Array<{ value: AiTaskType; label: string }> = [
  { value: 'explain-code', label: '代码解释' },
  { value: 'generate-code', label: '代码生成' },
  { value: 'api-debug', label: 'API 分析' },
  { value: 'git-summary', label: 'Git 变更说明' },
  { value: 'commit-message', label: 'Commit Message' }
]

const settings = ref<AppSettings>({
  openaiModel: 'Qwen/Qwen2.5-7B-Instruct',
  openaiBaseURL: 'https://api.siliconflow.com/v1',
  apiKeySource: 'none',
  hasOpenaiApiKey: false,
  defaultWorkspace: '',
  apiTimeoutMs: 30000,
  autoFormatJsonResponse: true
})
const apiKey = ref('')
const testingAi = ref(false)
const connectionResult = ref<AiConnectionResponse | null>(null)
const activeSettingsTab = ref<'base' | 'templates' | 'database'>('base')
const databaseInfo = ref<DatabaseInfo | null>(null)
const databaseCleanup = ref<Required<DatabaseMaintenanceCleanupRequest>>({
  aiHistory: true,
  apiHistory: false,
  apiSavedRequests: false,
  geoAnalysisHistory: false,
  customPromptTemplates: false
})
const selectedTaskType = ref<AiTaskType>('explain-code')
const templates = ref<AiPromptTemplate[]>([])
const projects = ref<WorkspaceProject[]>([])
const selectedTemplateId = ref('')
const defaultProjectId = ref('')
const defaultTemplateId = ref('')
const templateName = ref('')
const templateDraft = ref('')
const templatePreviewVariables = ref<Record<string, string>>({})
const loadingTemplates = ref(false)
const status = ref('正在读取设置')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const selectedTemplate = computed(() => templates.value.find((item) => item.id === selectedTemplateId.value))
const templateVariables = computed(() => extractPromptVariables(templateDraft.value))
const templatePreview = computed(() => renderPromptTemplate(templateDraft.value, templatePreviewVariables.value))
const selectedTaskLabel = computed(
  () => taskOptions.find((item) => item.value === selectedTaskType.value)?.label ?? selectedTaskType.value
)
const apiKeySourceLabel = computed(() => {
  if (settings.value.apiKeySource === 'env') return '.env / 环境变量'
  if (settings.value.apiKeySource === 'settings') return '设置页 SQLite 存储'
  return '未读取到'
})
const databaseSizeLabel = computed(() => {
  const size = databaseInfo.value?.sizeBytes ?? 0
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
})

async function loadSettings(): Promise<void> {
  try {
    settings.value = await devtoolsApi.settings.get()
    status.value = settings.value.hasOpenaiApiKey ? '硅基流动 API Key 已配置' : '尚未配置硅基流动 API Key'
    statusType.value = settings.value.hasOpenaiApiKey ? 'success' : 'error'
  } catch (error) {
    status.value = error instanceof Error ? error.message : '读取设置失败'
    statusType.value = 'error'
    showToast(status.value, 'error')
  }
}

async function selectDirectory(): Promise<void> {
  try {
    const directory = await devtoolsApi.settings.selectDirectory()
    if (directory) settings.value.defaultWorkspace = directory
  } catch (error) {
    status.value = showOperationError(error, '选择默认工作目录失败')
    statusType.value = 'error'
  }
}

async function loadDatabaseInfo(): Promise<void> {
  try {
    databaseInfo.value = await devtoolsApi.settings.getDatabaseInfo()
  } catch (error) {
    status.value = showOperationError(error, '读取数据库信息失败')
    statusType.value = 'error'
  }
}

async function saveSettings(): Promise<void> {
  status.value = '正在保存设置'
  statusType.value = 'idle'
  try {
    settings.value = await devtoolsApi.settings.update({
      openaiApiKey: apiKey.value || undefined,
      openaiModel: settings.value.openaiModel,
      defaultWorkspace: settings.value.defaultWorkspace,
      apiTimeoutMs: Number(settings.value.apiTimeoutMs),
      autoFormatJsonResponse: settings.value.autoFormatJsonResponse
    })
    apiKey.value = ''
    connectionResult.value = null
    status.value = '设置已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '保存设置失败')
    statusType.value = 'error'
  }
}

async function testAiConnection(): Promise<void> {
  testingAi.value = true
  const result = await devtoolsApi.ai.testConnection()
  connectionResult.value = result
  testingAi.value = false

  if (isAiConnectionError(result)) {
    status.value = `${result.model ?? settings.value.openaiModel} 连接失败：${result.error}`
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  status.value = `${result.model} 连接正常 · ${result.durationMs}ms`
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function loadTemplates(): Promise<void> {
  loadingTemplates.value = true
  templates.value = await devtoolsApi.ai.getPromptTemplates(selectedTaskType.value)
  selectedTemplateId.value = templates.value[0]?.id ?? ''
  applySelectedTemplate()
  await loadDefaultTemplate()
  loadingTemplates.value = false
}

async function loadProjects(): Promise<void> {
  projects.value = await devtoolsApi.projects.list()
  defaultProjectId.value = defaultProjectId.value || projects.value[0]?.id || ''
  await loadDefaultTemplate()
}

async function loadDefaultTemplate(): Promise<void> {
  defaultTemplateId.value = defaultProjectId.value
    ? await devtoolsApi.ai.getProjectPromptDefault(defaultProjectId.value, selectedTaskType.value)
    : ''
}

async function saveDefaultTemplate(): Promise<void> {
  if (!defaultProjectId.value) {
    showToast('请先选择项目', 'error')
    return
  }
  status.value = '正在保存项目默认 Prompt 模板'
  statusType.value = 'idle'
  try {
    await devtoolsApi.ai.setProjectPromptDefault({
      projectId: defaultProjectId.value,
      taskType: selectedTaskType.value,
      templateId: defaultTemplateId.value
    })
    status.value = '项目默认 Prompt 模板已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '保存项目默认 Prompt 模板失败')
    statusType.value = 'error'
  }
}

function applySelectedTemplate(): void {
  const template = selectedTemplate.value
  templateName.value = template?.isBuiltin ? '' : (template?.name ?? '')
  templateDraft.value = template?.content ?? ''
  syncTemplatePreviewVariables()
}

function createTemplate(): void {
  selectedTemplateId.value = ''
  templateName.value = `${selectedTaskLabel.value}自定义模板`
  templateDraft.value = ''
  syncTemplatePreviewVariables()
}

function syncTemplatePreviewVariables(): void {
  const nextVariables: Record<string, string> = {}
  templateVariables.value.forEach((name) => {
    nextVariables[name] = templatePreviewVariables.value[name] ?? defaultTemplateVariableValue(name)
  })
  templatePreviewVariables.value = nextVariables
}

function defaultTemplateVariableValue(name: string): string {
  const samples: Record<string, string> = {
    code: 'function validateFeature(feature) {\n  return Boolean(feature.geometry)\n}',
    requiredFields: 'featureId, datasetName, category, geometry',
    requestAndResponse:
      '{\n  "request": { "method": "GET", "url": "/resources" },\n  "response": { "status": 500, "body": "Internal Server Error" }\n}',
    diff: 'diff --git a/src/geo.ts b/src/geo.ts\n+ 增加 GeoJSON 坐标范围检查'
  }
  return samples[name] ?? `${name} 示例值`
}

async function saveTemplate(): Promise<void> {
  const name = templateName.value.trim() || `${selectedTaskLabel.value}模板`
  const content = templateDraft.value.trim()
  if (!content) {
    showToast('模板内容不能为空', 'error')
    return
  }

  const editableTemplateId =
    selectedTemplate.value && !selectedTemplate.value.isBuiltin ? selectedTemplate.value.id : undefined
  status.value = editableTemplateId ? '正在更新 Prompt 模板' : '正在保存 Prompt 模板'
  statusType.value = 'idle'
  try {
    templates.value = await devtoolsApi.ai.savePromptTemplate({
      id: editableTemplateId,
      taskType: selectedTaskType.value,
      name,
      content,
      variables: templateVariables.value
    })
    selectedTemplateId.value =
      templates.value.find((item) => item.id === editableTemplateId)?.id ??
      templates.value.find((item) => !item.isBuiltin && item.name === name && item.content === content)?.id ??
      templates.value[0]?.id ??
      ''
    applySelectedTemplate()
    status.value = editableTemplateId ? '模板已更新' : '模板已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, editableTemplateId ? '更新 Prompt 模板失败' : '保存 Prompt 模板失败')
    statusType.value = 'error'
  }
}

async function duplicateTemplate(): Promise<void> {
  if (!templateDraft.value.trim()) return
  status.value = '正在创建 Prompt 模板副本'
  statusType.value = 'idle'
  try {
    templates.value = await devtoolsApi.ai.savePromptTemplate({
      taskType: selectedTaskType.value,
      name: `${templateName.value || selectedTemplate.value?.name || selectedTaskLabel.value}（副本）`,
      content: templateDraft.value,
      variables: templateVariables.value
    })
    selectedTemplateId.value =
      templates.value.find((item) => !item.isBuiltin && item.name.endsWith('（副本）'))?.id ??
      templates.value[0]?.id ??
      ''
    applySelectedTemplate()
    status.value = '模板副本已创建'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '创建 Prompt 模板副本失败')
    statusType.value = 'error'
  }
}

async function deleteTemplate(): Promise<void> {
  if (!selectedTemplate.value || selectedTemplate.value.isBuiltin) return
  status.value = '正在删除 Prompt 模板'
  statusType.value = 'idle'
  try {
    templates.value = await devtoolsApi.ai.deletePromptTemplate(selectedTemplate.value.id, selectedTaskType.value)
    selectedTemplateId.value = templates.value[0]?.id ?? ''
    applySelectedTemplate()
    status.value = '模板已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '删除 Prompt 模板失败')
    statusType.value = 'error'
  }
}

async function resetTemplates(): Promise<void> {
  status.value = '正在重置内置 Prompt 模板'
  statusType.value = 'idle'
  try {
    templates.value = await devtoolsApi.ai.resetBuiltinPromptTemplates(selectedTaskType.value)
    selectedTemplateId.value = templates.value[0]?.id ?? ''
    applySelectedTemplate()
    status.value = `${selectedTaskLabel.value}内置模板已重置`
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '重置内置 Prompt 模板失败')
    statusType.value = 'error'
  }
}

async function backupDatabase(): Promise<void> {
  status.value = '正在备份数据库'
  statusType.value = 'idle'
  try {
    const result = await devtoolsApi.settings.backupDatabase()
    databaseInfo.value = result.info
    status.value = result.message
    statusType.value = 'success'
    showToast('数据库已备份', 'success')
  } catch (error) {
    status.value = showOperationError(error, '备份数据库失败')
    statusType.value = 'error'
  }
}

async function restoreDatabase(): Promise<void> {
  if (!window.confirm('恢复数据库会覆盖当前数据，确认继续？')) return
  status.value = '正在恢复数据库'
  statusType.value = 'idle'
  try {
    const result = await devtoolsApi.settings.restoreDatabase()
    if (!result) {
      status.value = '已取消恢复数据库'
      statusType.value = 'idle'
      return
    }
    databaseInfo.value = result.info
    status.value = result.message
    statusType.value = 'success'
    showToast('数据库已恢复，请重启应用以刷新所有页面状态', 'success')
  } catch (error) {
    status.value = showOperationError(error, '恢复数据库失败')
    statusType.value = 'error'
  }
}

async function cleanupDatabase(): Promise<void> {
  if (!Object.values(databaseCleanup.value).some(Boolean)) {
    showToast('请至少选择一个清理项', 'error')
    return
  }
  if (!window.confirm('确认清理所选数据库数据？此操作不可撤销，建议先备份。')) return
  status.value = '正在清理数据库'
  statusType.value = 'idle'
  try {
    const result = await devtoolsApi.settings.cleanupDatabase(databaseCleanup.value)
    databaseInfo.value = result.info
    status.value = result.message
    statusType.value = 'success'
    showToast('数据库清理完成', 'success')
  } catch (error) {
    status.value = showOperationError(error, '清理数据库失败')
    statusType.value = 'error'
  }
}

async function handleDataTransfer(action: () => Promise<{ message: string; count: number } | null>): Promise<void> {
  try {
    const result = await action()
    if (!result) return
    status.value = result.message
    statusType.value = 'success'
    showToast(`${result.message}（${result.count} 条）`, 'success')
    await safeLoadAll([
      { label: '刷新 Prompt 模板', work: loadTemplates },
      { label: '刷新数据库信息', work: loadDatabaseInfo }
    ])
  } catch (error) {
    status.value = error instanceof Error ? error.message : '数据导入导出失败'
    statusType.value = 'error'
    showToast(status.value, 'error')
  }
}

function exportAiHistoryJson(): Promise<void> {
  return handleDataTransfer(() => devtoolsApi.settings.exportAiHistory('json'))
}

function exportAiHistoryMarkdown(): Promise<void> {
  return handleDataTransfer(() => devtoolsApi.settings.exportAiHistory('markdown'))
}

function exportPromptTemplates(): Promise<void> {
  return handleDataTransfer(() => devtoolsApi.settings.exportPromptTemplates())
}

function importPromptTemplates(): Promise<void> {
  return handleDataTransfer(() => devtoolsApi.settings.importPromptTemplates())
}

function exportApiRequests(): Promise<void> {
  return handleDataTransfer(() => devtoolsApi.settings.exportApiRequests())
}

function importApiRequests(): Promise<void> {
  return handleDataTransfer(() => devtoolsApi.settings.importApiRequests())
}

watch(selectedTaskType, () => {
  void loadTemplates()
})

watch(defaultProjectId, () => {
  void loadDefaultTemplate()
})

watch(templateDraft, () => {
  syncTemplatePreviewVariables()
})

onMounted(async () => {
  await safeLoadAll([
    { label: '读取设置', work: loadSettings },
    { label: '读取 Prompt 模板', work: loadTemplates },
    { label: '读取项目工作区', work: loadProjects },
    { label: '读取数据库信息', work: loadDatabaseInfo }
  ])
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>设置</h2>
        <p>配置硅基流动模型、本地工作目录和 API 请求超时。</p>
      </div>
      <button class="button" type="button" @click="saveSettings">
        <Save :size="16" />
        保存
      </button>
    </header>

    <div class="tool-body">
      <div class="tabs settings-tabs">
        <button
          class="tab-button"
          :class="{ active: activeSettingsTab === 'base' }"
          type="button"
          @click="activeSettingsTab = 'base'"
        >
          基础配置
        </button>
        <button
          class="tab-button"
          :class="{ active: activeSettingsTab === 'templates' }"
          type="button"
          @click="activeSettingsTab = 'templates'"
        >
          Prompt 模板
        </button>
        <button
          class="tab-button"
          :class="{ active: activeSettingsTab === 'database' }"
          type="button"
          @click="activeSettingsTab = 'database'"
        >
          数据维护
        </button>
      </div>

      <div v-show="activeSettingsTab === 'base'" class="split-grid settings-tab-panel">
        <div class="section">
          <div class="field">
            <label for="siliconflow-key">硅基流动 API Key</label>
            <input
              id="siliconflow-key"
              v-model="apiKey"
              class="input"
              type="password"
              placeholder="留空表示不修改现有密钥"
            />
          </div>

          <div class="field">
            <label for="model">模型</label>
            <select id="model" v-model="settings.openaiModel" class="select">
              <option value="Qwen/Qwen2.5-7B-Instruct">Qwen/Qwen2.5-7B-Instruct</option>
              <option value="Qwen/Qwen2.5-Coder-7B-Instruct">Qwen/Qwen2.5-Coder-7B-Instruct</option>
              <option value="Qwen/Qwen2.5-14B-Instruct">Qwen/Qwen2.5-14B-Instruct</option>
              <option value="deepseek-ai/DeepSeek-V3">deepseek-ai/DeepSeek-V3</option>
            </select>
          </div>

          <div class="field">
            <label for="timeout">API 请求超时</label>
            <input
              id="timeout"
              v-model.number="settings.apiTimeoutMs"
              class="input"
              type="number"
              min="1000"
              step="1000"
            />
          </div>
        </div>

        <div class="section">
          <div class="field">
            <label for="workspace">默认工作目录</label>
            <div class="inline-row">
              <input id="workspace" v-model="settings.defaultWorkspace" class="input" placeholder="选择本地项目目录" />
              <button class="button secondary" type="button" @click="selectDirectory">
                <FolderOpen :size="16" />
                选择
              </button>
            </div>
          </div>

          <label class="toggle-row">
            <input v-model="settings.autoFormatJsonResponse" type="checkbox" />
            <span>自动格式化 JSON 响应</span>
          </label>

          <div class="code-box">
            Provider: SiliconFlow Base URL: {{ settings.openaiBaseURL }} Model: {{ settings.openaiModel }} API Key:
            {{ settings.hasOpenaiApiKey ? `已读取（${apiKeySourceLabel}）` : '未读取到' }} Timeout:
            {{ settings.apiTimeoutMs }}ms
          </div>

          <button class="button secondary" type="button" :disabled="testingAi" @click="testAiConnection">
            {{ testingAi ? '测试中' : '测试模型连接' }}
          </button>

          <div
            v-if="connectionResult"
            class="code-box connection-diagnostics"
            :class="{ 'diagnostic-error': !connectionResult.ok }"
          >
            Result: {{ connectionResult.ok ? 'OK' : 'FAILED' }} Model:
            {{ connectionResult.model || settings.openaiModel }} Base URL:
            {{ connectionResult.baseURL || settings.openaiBaseURL }} Duration: {{ connectionResult.durationMs ?? 0 }}ms
            {{ connectionResult.ok ? `Message: ${connectionResult.text}` : `Error: ${connectionResult.error}` }}
          </div>
        </div>
      </div>

      <div v-show="activeSettingsTab === 'templates'" class="section settings-tab-panel">
        <div class="meta-row">
          <h3>Prompt 模板管理</h3>
          <span class="badge">{{ selectedTaskLabel }}</span>
          <span v-if="selectedTemplate?.isBuiltin" class="badge">内置模板</span>
          <span v-else-if="selectedTemplate" class="badge success">自定义模板</span>
        </div>

        <div class="template-manager-grid">
          <div class="section">
            <div class="field">
              <label for="template-task-type">任务类型</label>
              <select id="template-task-type" v-model="selectedTaskType" class="select" :disabled="loadingTemplates">
                <option v-for="item in taskOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>

            <div class="field">
              <label for="template-list">模板</label>
              <select
                id="template-list"
                v-model="selectedTemplateId"
                class="select"
                :disabled="loadingTemplates"
                @change="applySelectedTemplate"
              >
                <option value="">新建自定义模板</option>
                <option v-for="item in templates" :key="item.id" :value="item.id">
                  {{ item.isBuiltin ? '内置 · ' : '自定义 · ' }}{{ item.name }}
                </option>
              </select>
            </div>

            <div class="field">
              <label for="default-template">项目默认模板</label>
              <div class="inline-row">
                <select v-model="defaultProjectId" class="select">
                  <option value="">选择项目</option>
                  <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
                </select>
                <select id="default-template" v-model="defaultTemplateId" class="select">
                  <option value="">不设置</option>
                  <option v-for="item in templates" :key="item.id" :value="item.id">
                    {{ item.isBuiltin ? '内置 · ' : '自定义 · ' }}{{ item.name }}
                  </option>
                </select>
              </div>
              <button class="button secondary" type="button" :disabled="!defaultProjectId" @click="saveDefaultTemplate">
                保存项目默认模板
              </button>
            </div>

            <div class="toolbar">
              <button class="button secondary" type="button" @click="createTemplate">
                <Plus :size="16" />
                新建
              </button>
              <button
                class="button secondary"
                type="button"
                :disabled="!templateDraft.trim()"
                @click="duplicateTemplate"
              >
                另存为副本
              </button>
              <button
                class="button secondary"
                type="button"
                :disabled="!selectedTemplate || selectedTemplate.isBuiltin"
                @click="deleteTemplate"
              >
                <Trash2 :size="16" />
                删除
              </button>
              <button class="button secondary" type="button" @click="resetTemplates">
                <RefreshCw :size="16" />
                重置内置
              </button>
            </div>

            <div class="code-box template-help">
              使用 <code v-pre>{{ 变量名 }}</code> 定义模板变量。各工具页面会根据变量渲染最终 Prompt，例如代码解释使用
              <code v-pre>{{ code }}</code
              >，API 分析使用 <code v-pre>{{ requestAndResponse }}</code
              >。
            </div>
          </div>

          <div class="section">
            <div class="field">
              <label for="template-name">模板名称</label>
              <input id="template-name" v-model="templateName" class="input" placeholder="自定义模板名称" />
            </div>

            <div class="field">
              <label for="template-content">模板内容</label>
              <textarea
                id="template-content"
                v-model="templateDraft"
                class="textarea prompt-template-editor template-editor-large"
                spellcheck="false"
              />
            </div>

            <div class="meta-row">
              <span class="badge">变量</span>
              <span v-for="name in templateVariables" :key="name" class="badge">{{ name }}</span>
              <span v-if="!templateVariables.length" class="badge">无变量</span>
            </div>

            <div v-if="templateVariables.length" class="section template-preview-section">
              <div class="meta-row">
                <strong>预览变量</strong>
              </div>
              <div v-for="name in templateVariables" :key="name" class="field">
                <label :for="`preview-var-${name}`">{{ name }}</label>
                <textarea
                  v-if="['code', 'requestAndResponse', 'diff'].includes(name)"
                  :id="`preview-var-${name}`"
                  v-model="templatePreviewVariables[name]"
                  class="textarea prompt-template-editor"
                  spellcheck="false"
                />
                <input v-else :id="`preview-var-${name}`" v-model="templatePreviewVariables[name]" class="input" />
              </div>
            </div>

            <div class="section template-preview-section">
              <div class="meta-row">
                <strong>渲染预览</strong>
              </div>
              <pre class="output-box template-preview-box">{{ templatePreview || '模板预览会显示在这里' }}</pre>
            </div>

            <div class="toolbar">
              <button class="button" type="button" :disabled="!templateDraft.trim()" @click="saveTemplate">
                <Save :size="16" />
                {{ selectedTemplate && !selectedTemplate.isBuiltin ? '保存修改' : '保存为自定义模板' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeSettingsTab === 'database'" class="section settings-tab-panel">
        <div class="meta-row">
          <h3>SQLite 数据维护</h3>
          <span class="badge">{{ databaseInfo?.exists ? '已初始化' : '未生成' }}</span>
          <span class="badge">{{ databaseSizeLabel }}</span>
        </div>

        <div class="template-manager-grid">
          <div class="section">
            <div class="code-box database-path">
              Path: {{ databaseInfo?.path || '正在读取' }} Version:
              {{ databaseInfo?.schemaVersion ?? '正在读取' }} Updated:
              {{ databaseInfo?.updatedAt ? new Date(databaseInfo.updatedAt).toLocaleString() : '暂无' }}
            </div>

            <div class="toolbar">
              <button class="button secondary" type="button" @click="loadDatabaseInfo">
                <RefreshCw :size="16" />
                刷新状态
              </button>
              <button class="button secondary" type="button" @click="backupDatabase">备份</button>
              <button class="button secondary" type="button" @click="restoreDatabase">恢复</button>
            </div>

            <div class="field">
              <label>清理数据</label>
              <label class="toggle-row">
                <input v-model="databaseCleanup.aiHistory" type="checkbox" />
                <span>AI 历史</span>
              </label>
              <label class="toggle-row">
                <input v-model="databaseCleanup.apiHistory" type="checkbox" />
                <span>API 请求历史</span>
              </label>
              <label class="toggle-row">
                <input v-model="databaseCleanup.apiSavedRequests" type="checkbox" />
                <span>API 请求集合</span>
              </label>
              <label class="toggle-row">
                <input v-model="databaseCleanup.geoAnalysisHistory" type="checkbox" />
                <span>地理体检历史</span>
              </label>
              <label class="toggle-row">
                <input v-model="databaseCleanup.customPromptTemplates" type="checkbox" />
                <span>自定义 Prompt 模板</span>
              </label>
              <button class="button secondary" type="button" @click="cleanupDatabase">执行清理</button>
            </div>

            <div class="field">
              <label>导入导出</label>
              <div class="toolbar">
                <button class="button secondary" type="button" @click="exportAiHistoryJson">导出 AI 历史 JSON</button>
                <button class="button secondary" type="button" @click="exportAiHistoryMarkdown">
                  导出 AI 历史 Markdown
                </button>
              </div>
              <div class="toolbar">
                <button class="button secondary" type="button" @click="exportPromptTemplates">导出模板</button>
                <button class="button secondary" type="button" @click="importPromptTemplates">导入模板</button>
              </div>
              <div class="toolbar">
                <button class="button secondary" type="button" @click="exportApiRequests">导出 API 请求集合</button>
                <button class="button secondary" type="button" @click="importApiRequests">导入 API 请求集合</button>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="history-list">
              <div v-for="item in databaseInfo?.tables ?? []" :key="item.table" class="list-item action-item">
                <div>
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.table }}</small>
                </div>
                <span class="badge">{{ item.rows }}</span>
              </div>
            </div>
            <div v-if="!databaseInfo" class="empty-state compact-empty">正在读取数据库状态</div>
          </div>
        </div>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
