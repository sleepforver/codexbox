import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiConfigResponse,
  AiConnectionResponse,
  AiGenerateTextRequest,
  AiGenerateTextResponse,
  AiHistoryItem,
  AiHistorySaveRequest,
  AiPromptTemplate,
  AiPromptTemplateSaveRequest,
  AiTaskType,
  AiStreamEvent,
  AiStreamStartResponse,
  ApiSendRequest,
  ApiSendResponse,
  ApiSavedRequest,
  ApiToolState,
  AppSettings,
  AppSettingsUpdate,
  DatabaseInfo,
  DatabaseMaintenanceCleanupRequest,
  DatabaseMaintenanceResponse,
  WorkspaceProject,
  WorkspaceProjectSaveRequest,
  DataTransferResponse,
  DevtoolsApi,
  GitCommandRequest,
  GitCommandResponse,
  GitAction,
  GitActionResponse,
  GitCommitResponse,
  GeoAnalyzeRequest,
  GeoAnalyzeResponse,
  JsonQueryRequest,
  JsonQueryResponse,
  JsonTransformRequest,
  JsonTransformResponse
} from '../../src/shared/ipc.js'

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const devtoolsApi: DevtoolsApi = {
  json: {
    transform: (request: JsonTransformRequest) =>
      ipcRenderer.invoke('json:transform', request) as Promise<JsonTransformResponse>,
    query: (request: JsonQueryRequest) => ipcRenderer.invoke('json:query', request) as Promise<JsonQueryResponse>
  },
  api: {
    send: (request: ApiSendRequest) => ipcRenderer.invoke('api:send', request) as Promise<ApiSendResponse>,
    getState: () => ipcRenderer.invoke('api:getState') as Promise<ApiToolState>,
    saveState: (state: ApiToolState) => ipcRenderer.invoke('api:saveState', state) as Promise<ApiToolState>,
    getSavedRequests: (projectId?: string) => ipcRenderer.invoke('api:getSavedRequests', projectId) as Promise<ApiSavedRequest[]>,
    saveRequest: (request) => ipcRenderer.invoke('api:saveRequest', request) as Promise<ApiSavedRequest[]>,
    deleteRequest: (id: string) => ipcRenderer.invoke('api:deleteRequest', id) as Promise<ApiSavedRequest[]>
  },
  git: {
    run: (request: GitCommandRequest) => ipcRenderer.invoke('git:run', request) as Promise<GitCommandResponse>,
    action: (request: { action: GitAction; cwd?: string; path: string }) =>
      ipcRenderer.invoke('git:action', request) as Promise<GitActionResponse>,
    commit: (request: { cwd?: string; message: string }) =>
      ipcRenderer.invoke('git:commit', request) as Promise<GitCommitResponse>
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig') as Promise<AiConfigResponse>,
    generateText: (request: AiGenerateTextRequest) =>
      ipcRenderer.invoke('ai:generateText', request) as Promise<AiGenerateTextResponse>,
    generateTextStream: async (request: AiGenerateTextRequest, onEvent: (event: AiStreamEvent) => void) => {
      const requestId = createRequestId()
      const channel = `ai:stream:${requestId}`
      const listener = (_event: Electron.IpcRendererEvent, streamEvent: AiStreamEvent): void => {
        onEvent(streamEvent)
        if (streamEvent.type === 'done' || streamEvent.type === 'error' || streamEvent.type === 'canceled') {
          ipcRenderer.removeListener(channel, listener)
        }
      }

      ipcRenderer.on(channel, listener)
      void ipcRenderer.invoke('ai:generateTextStream', { ...request, requestId }).catch((error) => {
        ipcRenderer.removeListener(channel, listener)
        onEvent({
          type: 'error',
          requestId,
          error: error instanceof Error ? error.message : 'AI 流式请求启动失败'
        })
      })
      return { requestId } as AiStreamStartResponse
    },
    cancelStream: (requestId: string) => ipcRenderer.invoke('ai:cancelStream', requestId) as Promise<void>,
    testConnection: () => ipcRenderer.invoke('ai:testConnection') as Promise<AiConnectionResponse>,
    getHistory: (taskType?: AiTaskType, projectId?: string) =>
      ipcRenderer.invoke('ai:getHistory', taskType, projectId) as Promise<AiHistoryItem[]>,
    saveHistory: (request: AiHistorySaveRequest) =>
      ipcRenderer.invoke('ai:saveHistory', request) as Promise<AiHistoryItem[]>,
    deleteHistory: (id: string, taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:deleteHistory', id, taskType) as Promise<AiHistoryItem[]>,
    clearHistory: (taskType?: AiTaskType, projectId?: string) =>
      ipcRenderer.invoke('ai:clearHistory', taskType, projectId) as Promise<AiHistoryItem[]>,
    getPromptTemplates: (taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:getPromptTemplates', taskType) as Promise<AiPromptTemplate[]>,
    savePromptTemplate: (request: AiPromptTemplateSaveRequest) =>
      ipcRenderer.invoke('ai:savePromptTemplate', request) as Promise<AiPromptTemplate[]>,
    deletePromptTemplate: (id: string, taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:deletePromptTemplate', id, taskType) as Promise<AiPromptTemplate[]>,
    resetBuiltinPromptTemplates: (taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:resetBuiltinPromptTemplates', taskType) as Promise<AiPromptTemplate[]>
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    update: (update: AppSettingsUpdate) => ipcRenderer.invoke('settings:update', update) as Promise<AppSettings>,
    selectDirectory: () => ipcRenderer.invoke('settings:selectDirectory') as Promise<string | null>,
    getDatabaseInfo: () => ipcRenderer.invoke('settings:getDatabaseInfo') as Promise<DatabaseInfo>,
    backupDatabase: () => ipcRenderer.invoke('settings:backupDatabase') as Promise<DatabaseMaintenanceResponse>,
    restoreDatabase: () => ipcRenderer.invoke('settings:restoreDatabase') as Promise<DatabaseMaintenanceResponse | null>,
    cleanupDatabase: (request: DatabaseMaintenanceCleanupRequest) =>
      ipcRenderer.invoke('settings:cleanupDatabase', request) as Promise<DatabaseMaintenanceResponse>,
    exportAiHistory: (format: 'json' | 'markdown') =>
      ipcRenderer.invoke('settings:exportAiHistory', format) as Promise<DataTransferResponse | null>,
    exportPromptTemplates: () => ipcRenderer.invoke('settings:exportPromptTemplates') as Promise<DataTransferResponse | null>,
    importPromptTemplates: () => ipcRenderer.invoke('settings:importPromptTemplates') as Promise<DataTransferResponse | null>,
    exportApiRequests: () => ipcRenderer.invoke('settings:exportApiRequests') as Promise<DataTransferResponse | null>,
    importApiRequests: () => ipcRenderer.invoke('settings:importApiRequests') as Promise<DataTransferResponse | null>
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<WorkspaceProject[]>,
    save: (request: WorkspaceProjectSaveRequest) => ipcRenderer.invoke('projects:save', request) as Promise<WorkspaceProject[]>,
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id) as Promise<WorkspaceProject[]>,
    markOpened: (id: string) => ipcRenderer.invoke('projects:markOpened', id) as Promise<WorkspaceProject[]>
  },
  geo: {
    analyze: (request: GeoAnalyzeRequest) => ipcRenderer.invoke('geo:analyze', request) as Promise<GeoAnalyzeResponse>
  }
}

contextBridge.exposeInMainWorld('devtoolsApi', devtoolsApi)
