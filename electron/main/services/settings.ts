import type {
  AiHistoryItem,
  AiHistorySaveRequest,
  AiPromptTemplate,
  AiPromptTemplateSaveRequest,
  AiProvider,
  AiTaskType,
  ApiSavedRequest,
  ApiToolState,
  AppSettings,
  AppSettingsUpdate,
  DatabaseInfo,
  DatabaseMaintenanceCleanupRequest,
  DatabaseMaintenanceResponse,
  WorkspaceProject,
  WorkspaceProjectSaveRequest
} from '../../../src/shared/ipc.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  backupDatabaseToFile,
  clearAiHistoryFromDb,
  cleanupDatabaseInDb,
  deleteAiHistoryFromDb,
  deleteAiPromptTemplateFromDb,
  deleteApiRequestFromDb,
  deleteWorkspaceProjectFromDb,
  getAiHistoryFromDb,
  getAiPromptTemplatesFromDb,
  getApiSavedRequestsFromDb,
  getApiToolStateFromDb,
  getDatabaseInfoFromDb,
  getSetting,
  importAiHistoryToDb,
  toggleAiHistoryFavoriteInDb,
  listWorkspaceProjectsFromDb,
  markWorkspaceProjectOpenedInDb,
  resetBuiltinPromptTemplatesInDb,
  restoreDatabaseFromFile,
  saveAiHistoryToDb,
  saveAiPromptTemplateToDb,
  saveApiRequestToDb,
  saveApiToolStateToDb,
  saveWorkspaceProjectToDb,
  setSetting
} from './database.js'

interface AiProviderConfig {
  baseURL: string
  model: string
  apiKeyEnv: string
  baseUrlEnv: string
}

const providerConfigs: Record<AiProvider, AiProviderConfig> = {
  siliconflow: {
    baseURL: 'https://api.siliconflow.com/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    baseUrlEnv: 'SILICONFLOW_BASE_URL'
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL'
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL'
  },
  custom: {
    baseURL: 'https://api.example.com/v1',
    model: 'custom-model',
    apiKeyEnv: 'OPENAI_COMPATIBLE_API_KEY',
    baseUrlEnv: 'OPENAI_COMPATIBLE_BASE_URL'
  }
}

const defaultProvider: AiProvider = 'siliconflow'

function normalizeAiProvider(value: unknown): AiProvider {
  return value === 'openai' || value === 'deepseek' || value === 'custom' || value === 'siliconflow'
    ? value
    : defaultProvider
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function envFilePath(): string {
  return resolve(process.cwd(), '.env')
}

function writeEnvValues(updates: Record<string, string>): void {
  const path = envFilePath()
  const source = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const lines = source ? source.split(/\r?\n/) : []
  const remaining = new Map(Object.entries(updates))
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (!match) return line
    const key = match[1]
    const value = remaining.get(key)
    if (value === undefined) return line
    remaining.delete(key)
    return `${key}=${value}`
  })

  for (const [key, value] of remaining) {
    nextLines.push(`${key}=${value}`)
  }

  writeFileSync(path, `${nextLines.join('\n').replace(/\n+$/, '')}\n`, 'utf8')
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value
  }
}

export async function readAppSettings(): Promise<AppSettings> {
  const [storedProvider, storedModel, storedBaseURL, defaultWorkspace, apiTimeoutMs, autoFormatJsonResponse] =
    await Promise.all([
      getSetting<AiProvider | undefined>('aiProvider', undefined),
      getSetting<string | undefined>('openaiModel', undefined),
      getSetting<string | undefined>('openaiBaseURL', undefined),
      getSetting('defaultWorkspace', ''),
      getSetting('apiTimeoutMs', 30000),
      getSetting('autoFormatJsonResponse', true)
    ])
  const aiProvider = normalizeAiProvider(storedProvider)
  const providerConfig = providerConfigs[aiProvider]
  const envKey = readEnv(providerConfig.apiKeyEnv)
  const envBaseURL = readEnv(providerConfig.baseUrlEnv)
  const apiKeySource = envKey ? 'env' : 'none'

  return {
    aiProvider,
    openaiModel: storedModel || providerConfig.model,
    openaiBaseURL: storedBaseURL || envBaseURL || providerConfig.baseURL,
    apiKeySource,
    hasOpenaiApiKey: Boolean(envKey),
    defaultWorkspace,
    apiTimeoutMs,
    autoFormatJsonResponse
  }
}

export async function readAiRuntimeConfig(): Promise<{
  provider: AiProvider
  apiKey?: string
  apiKeySource: 'env' | 'none'
  model: string
  baseURL: string
  timeoutMs: number
}> {
  const [storedProvider, storedModel, storedBaseURL, apiTimeoutMs] = await Promise.all([
    getSetting<AiProvider | undefined>('aiProvider', undefined),
    getSetting<string | undefined>('openaiModel', undefined),
    getSetting<string | undefined>('openaiBaseURL', undefined),
    getSetting('apiTimeoutMs', 30000)
  ])
  const aiProvider = normalizeAiProvider(storedProvider)
  const providerConfig = providerConfigs[aiProvider]
  const envKey = readEnv(providerConfig.apiKeyEnv)
  const envBaseURL = readEnv(providerConfig.baseUrlEnv)

  return {
    provider: aiProvider,
    apiKey: envKey,
    apiKeySource: envKey ? 'env' : 'none',
    model: storedModel || providerConfig.model,
    baseURL: storedBaseURL || envBaseURL || providerConfig.baseURL,
    timeoutMs: Number(apiTimeoutMs) || 30000
  }
}

export async function updateAppSettings(update: AppSettingsUpdate): Promise<AppSettings> {
  const activeProvider = normalizeAiProvider(
    update.aiProvider ?? (await getSetting<AiProvider | undefined>('aiProvider', undefined))
  )
  const providerConfig = providerConfigs[activeProvider]
  if (update.aiProvider !== undefined) await setSetting('aiProvider', update.aiProvider)
  if (update.openaiApiKey !== undefined) {
    writeEnvValues({ [providerConfig.apiKeyEnv]: update.openaiApiKey.trim() })
  }
  if (update.openaiModel !== undefined) {
    const model = update.openaiModel.trim() || providerConfigs[activeProvider].model
    await setSetting('openaiModel', model)
  }
  if (update.openaiBaseURL !== undefined) await setSetting('openaiBaseURL', update.openaiBaseURL)
  if (update.defaultWorkspace !== undefined) await setSetting('defaultWorkspace', update.defaultWorkspace)
  if (update.apiTimeoutMs !== undefined) await setSetting('apiTimeoutMs', update.apiTimeoutMs)
  if (update.autoFormatJsonResponse !== undefined) {
    await setSetting('autoFormatJsonResponse', update.autoFormatJsonResponse)
  }

  return readAppSettings()
}

export function getApiToolState(projectId?: string): Promise<ApiToolState> {
  return getApiToolStateFromDb(projectId)
}

export function saveApiToolState(state: ApiToolState, projectId?: string): Promise<ApiToolState> {
  return saveApiToolStateToDb(state, projectId)
}

export function getApiSavedRequests(projectId?: string): Promise<ApiSavedRequest[]> {
  return getApiSavedRequestsFromDb(projectId)
}

export function saveApiSavedRequest(
  request: Omit<ApiSavedRequest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<ApiSavedRequest[]> {
  return saveApiRequestToDb(request)
}

export function deleteApiSavedRequest(id: string): Promise<ApiSavedRequest[]> {
  return deleteApiRequestFromDb(id)
}

export function getAiHistory(taskType?: AiTaskType, projectId?: string): Promise<AiHistoryItem[]> {
  return getAiHistoryFromDb(taskType, projectId)
}

export function saveAiHistory(request: AiHistorySaveRequest): Promise<AiHistoryItem[]> {
  return saveAiHistoryToDb(request)
}

export function importAiHistory(
  item: AiHistorySaveRequest & { id?: string; createdAt?: string },
  projectId?: string
): Promise<void> {
  return importAiHistoryToDb(item, projectId)
}

export function deleteAiHistory(id: string, taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  return deleteAiHistoryFromDb(id, taskType)
}

export function clearAiHistory(taskType?: AiTaskType, projectId?: string): Promise<AiHistoryItem[]> {
  return clearAiHistoryFromDb(taskType, projectId)
}

export function toggleAiHistoryFavorite(id: string, favorite: boolean): Promise<AiHistoryItem[]> {
  return toggleAiHistoryFavoriteInDb(id, favorite)
}

export function getAiPromptTemplates(taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  return getAiPromptTemplatesFromDb(taskType)
}

export function saveAiPromptTemplate(request: AiPromptTemplateSaveRequest): Promise<AiPromptTemplate[]> {
  return saveAiPromptTemplateToDb(request)
}

export function deleteAiPromptTemplate(id: string, taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  return deleteAiPromptTemplateFromDb(id, taskType)
}

export function resetBuiltinPromptTemplates(taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  return resetBuiltinPromptTemplatesInDb(taskType)
}

function projectPromptDefaultsKey(projectId: string): string {
  return `projectPromptDefaults:${projectId}`
}

export async function getProjectPromptDefault(projectId: string, taskType: AiTaskType): Promise<string> {
  if (!projectId) return ''
  const defaults = await getSetting<Record<string, string>>(projectPromptDefaultsKey(projectId), {})
  return defaults[taskType] ?? ''
}

export async function setProjectPromptDefault(
  projectId: string,
  taskType: AiTaskType,
  templateId: string
): Promise<string> {
  if (!projectId) throw new Error('项目不能为空')
  const defaults = await getSetting<Record<string, string>>(projectPromptDefaultsKey(projectId), {})
  defaults[taskType] = templateId
  await setSetting(projectPromptDefaultsKey(projectId), defaults)
  return templateId
}

export function getDatabaseInfo(): Promise<DatabaseInfo> {
  return getDatabaseInfoFromDb()
}

export function backupDatabase(): Promise<DatabaseMaintenanceResponse> {
  return backupDatabaseToFile()
}

export function restoreDatabase(path: string): Promise<DatabaseMaintenanceResponse> {
  return restoreDatabaseFromFile(path)
}

export function cleanupDatabase(request: DatabaseMaintenanceCleanupRequest): Promise<DatabaseMaintenanceResponse> {
  return cleanupDatabaseInDb(request)
}

export function listWorkspaceProjects(): Promise<WorkspaceProject[]> {
  return listWorkspaceProjectsFromDb()
}

export function saveWorkspaceProject(request: WorkspaceProjectSaveRequest): Promise<WorkspaceProject[]> {
  return saveWorkspaceProjectToDb(request)
}

export function deleteWorkspaceProject(id: string): Promise<WorkspaceProject[]> {
  return deleteWorkspaceProjectFromDb(id)
}

export function markWorkspaceProjectOpened(id: string): Promise<WorkspaceProject[]> {
  return markWorkspaceProjectOpenedInDb(id)
}
