import type {
  AiHistoryItem,
  AiHistorySaveRequest,
  AiPromptTemplate,
  AiPromptTemplateSaveRequest,
  AiTaskType,
  ApiSavedRequest,
  ApiToolState,
  AppSettings,
  AppSettingsUpdate,
  DatabaseInfo,
  DatabaseMaintenanceCleanupRequest,
  DatabaseMaintenanceResponse
} from '../../../src/shared/ipc.js'
import {
  backupDatabaseToFile,
  cleanupDatabaseInDb,
  deleteAiHistoryFromDb,
  deleteAiPromptTemplateFromDb,
  deleteApiRequestFromDb,
  getAiHistoryFromDb,
  getAiPromptTemplatesFromDb,
  getApiSavedRequestsFromDb,
  getApiToolStateFromDb,
  getDatabaseInfoFromDb,
  getSetting,
  resetBuiltinPromptTemplatesInDb,
  restoreDatabaseFromFile,
  saveAiHistoryToDb,
  saveAiPromptTemplateToDb,
  saveApiRequestToDb,
  saveApiToolStateToDb,
  setSetting
} from './database.js'

const defaultModel = 'Qwen/Qwen2.5-7B-Instruct'

export async function readAppSettings(): Promise<AppSettings> {
  const [storedKey, openaiModel, defaultWorkspace, apiTimeoutMs, autoFormatJsonResponse] = await Promise.all([
    getSetting<string | undefined>('openaiApiKey', undefined),
    getSetting('openaiModel', defaultModel),
    getSetting('defaultWorkspace', ''),
    getSetting('apiTimeoutMs', 30000),
    getSetting('autoFormatJsonResponse', true)
  ])
  const envKey = process.env.SILICONFLOW_API_KEY
  const envBaseURL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.com/v1'
  const apiKeySource = envKey ? 'env' : storedKey ? 'settings' : 'none'

  return {
    openaiModel: process.env.SILICONFLOW_MODEL || openaiModel,
    openaiBaseURL: envBaseURL,
    apiKeySource,
    hasOpenaiApiKey: Boolean(envKey || storedKey),
    defaultWorkspace,
    apiTimeoutMs,
    autoFormatJsonResponse
  }
}

export async function readAiRuntimeConfig(): Promise<{
  apiKey?: string
  apiKeySource: 'env' | 'settings' | 'none'
  model: string
  baseURL: string
  timeoutMs: number
}> {
  const [storedKey, storedModel, apiTimeoutMs] = await Promise.all([
    getSetting<string | undefined>('openaiApiKey', undefined),
    getSetting('openaiModel', defaultModel),
    getSetting('apiTimeoutMs', 30000)
  ])
  const envKey = process.env.SILICONFLOW_API_KEY

  return {
    apiKey: envKey || storedKey,
    apiKeySource: envKey ? 'env' : storedKey ? 'settings' : 'none',
    model: process.env.SILICONFLOW_MODEL || storedModel || defaultModel,
    baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.com/v1',
    timeoutMs: Number(apiTimeoutMs) || 30000
  }
}

export async function updateAppSettings(update: AppSettingsUpdate): Promise<AppSettings> {
  if (update.openaiApiKey !== undefined) await setSetting('openaiApiKey', update.openaiApiKey)
  if (update.openaiModel !== undefined) await setSetting('openaiModel', update.openaiModel)
  if (update.defaultWorkspace !== undefined) await setSetting('defaultWorkspace', update.defaultWorkspace)
  if (update.apiTimeoutMs !== undefined) await setSetting('apiTimeoutMs', update.apiTimeoutMs)
  if (update.autoFormatJsonResponse !== undefined) {
    await setSetting('autoFormatJsonResponse', update.autoFormatJsonResponse)
  }

  return readAppSettings()
}

export function getApiToolState(): Promise<ApiToolState> {
  return getApiToolStateFromDb()
}

export function saveApiToolState(state: ApiToolState): Promise<ApiToolState> {
  return saveApiToolStateToDb(state)
}

export function getApiSavedRequests(): Promise<ApiSavedRequest[]> {
  return getApiSavedRequestsFromDb()
}

export function saveApiSavedRequest(
  request: Omit<ApiSavedRequest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<ApiSavedRequest[]> {
  return saveApiRequestToDb(request)
}

export function deleteApiSavedRequest(id: string): Promise<ApiSavedRequest[]> {
  return deleteApiRequestFromDb(id)
}

export function getAiHistory(taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  return getAiHistoryFromDb(taskType)
}

export function saveAiHistory(request: AiHistorySaveRequest): Promise<AiHistoryItem[]> {
  return saveAiHistoryToDb(request)
}

export function deleteAiHistory(id: string, taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  return deleteAiHistoryFromDb(id, taskType)
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
