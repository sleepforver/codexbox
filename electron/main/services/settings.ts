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
  DatabaseMaintenanceResponse,
  WorkspaceProject,
  WorkspaceProjectSaveRequest
} from '../../../src/shared/ipc.js'
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
