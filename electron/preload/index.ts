import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiConfigResponse,
  AiConnectionResponse,
  AiContextFileResponse,
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
  ApiDiscoveredRequest,
  ApiDiscoveryRequest,
  ApiDiscoveryResponse,
  ApiSavedRequest,
  ApiToolState,
  AppSettings,
  AppSettingsUpdate,
  DatabaseInfo,
  DatabaseMaintenanceCleanupRequest,
  DatabaseMaintenanceResponse,
  AgentWorkflowPlanRequest,
  AgentWorkflowRun,
  AgentWorkflowRunSaveRequest,
  WorkspaceProject,
  WorkspaceProjectSaveRequest,
  DataTransferResponse,
  DevtoolsApi,
  GitCommandRequest,
  GitCommandResponse,
  GitAction,
  GitActionResponse,
  GitCommitResponse,
  JsonQueryRequest,
  JsonQueryResponse,
  JsonTransformRequest,
  JsonTransformResponse,
  ProjectDashboardSummary,
  ProjectAgent,
  ProjectAgentSaveRequest,
  ProjectKnowledgeFilters,
  ProjectKnowledgeItem,
  ProjectKnowledgeSaveRequest,
  ProjectSearchFilters,
  ProjectSearchResult,
  ProjectPackageImportMode,
  ProjectPackageImportPreview,
  ProjectPromptTemplateDefault,
  ProjectProfileDraft,
  ProjectTask,
  ProjectTaskFile,
  ProjectTaskFilters,
  ProjectTaskSaveRequest,
  UpdateCheckResponse,
  UpdateInfo
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
    getState: (projectId?: string) => ipcRenderer.invoke('api:getState', projectId) as Promise<ApiToolState>,
    saveState: (state: ApiToolState, projectId?: string) =>
      ipcRenderer.invoke('api:saveState', state, projectId) as Promise<ApiToolState>,
    getSavedRequests: (projectId?: string) =>
      ipcRenderer.invoke('api:getSavedRequests', projectId) as Promise<ApiSavedRequest[]>,
    saveRequest: (request) => ipcRenderer.invoke('api:saveRequest', request) as Promise<ApiSavedRequest[]>,
    deleteRequest: (id: string) => ipcRenderer.invoke('api:deleteRequest', id) as Promise<ApiSavedRequest[]>,
    discoverRequests: (request: ApiDiscoveryRequest) =>
      ipcRenderer.invoke('api:discoverRequests', request) as Promise<ApiDiscoveryResponse>,
    loadOpenApiRequests: () => ipcRenderer.invoke('api:loadOpenApiRequests') as Promise<ApiDiscoveryResponse | null>,
    importDiscoveredRequests: (
      projectId: string | undefined,
      requests: ApiDiscoveredRequest[],
      mode: 'skip' | 'overwrite'
    ) => ipcRenderer.invoke('api:importDiscoveredRequests', projectId, requests, mode) as Promise<ApiSavedRequest[]>
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
    loadContextFile: () => ipcRenderer.invoke('ai:loadContextFile') as Promise<AiContextFileResponse | null>,
    getHistory: (taskType?: AiTaskType, projectId?: string, taskId?: string) =>
      ipcRenderer.invoke('ai:getHistory', taskType, projectId, taskId) as Promise<AiHistoryItem[]>,
    saveHistory: (request: AiHistorySaveRequest) =>
      ipcRenderer.invoke('ai:saveHistory', request) as Promise<AiHistoryItem[]>,
    deleteHistory: (id: string, taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:deleteHistory', id, taskType) as Promise<AiHistoryItem[]>,
    clearHistory: (taskType?: AiTaskType, projectId?: string) =>
      ipcRenderer.invoke('ai:clearHistory', taskType, projectId) as Promise<AiHistoryItem[]>,
    toggleHistoryFavorite: (id: string, favorite: boolean) =>
      ipcRenderer.invoke('ai:toggleHistoryFavorite', id, favorite) as Promise<AiHistoryItem[]>,
    getPromptTemplates: (taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:getPromptTemplates', taskType) as Promise<AiPromptTemplate[]>,
    savePromptTemplate: (request: AiPromptTemplateSaveRequest) =>
      ipcRenderer.invoke('ai:savePromptTemplate', request) as Promise<AiPromptTemplate[]>,
    deletePromptTemplate: (id: string, taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:deletePromptTemplate', id, taskType) as Promise<AiPromptTemplate[]>,
    resetBuiltinPromptTemplates: (taskType?: AiTaskType) =>
      ipcRenderer.invoke('ai:resetBuiltinPromptTemplates', taskType) as Promise<AiPromptTemplate[]>,
    getProjectPromptDefault: (projectId: string, taskType: AiTaskType) =>
      ipcRenderer.invoke('ai:getProjectPromptDefault', projectId, taskType) as Promise<string>,
    setProjectPromptDefault: (defaultValue: ProjectPromptTemplateDefault) =>
      ipcRenderer.invoke('ai:setProjectPromptDefault', defaultValue) as Promise<string>
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    update: (update: AppSettingsUpdate) => ipcRenderer.invoke('settings:update', update) as Promise<AppSettings>,
    selectDirectory: () => ipcRenderer.invoke('settings:selectDirectory') as Promise<string | null>,
    getDatabaseInfo: () => ipcRenderer.invoke('settings:getDatabaseInfo') as Promise<DatabaseInfo>,
    backupDatabase: () => ipcRenderer.invoke('settings:backupDatabase') as Promise<DatabaseMaintenanceResponse>,
    restoreDatabase: () =>
      ipcRenderer.invoke('settings:restoreDatabase') as Promise<DatabaseMaintenanceResponse | null>,
    cleanupDatabase: (request: DatabaseMaintenanceCleanupRequest) =>
      ipcRenderer.invoke('settings:cleanupDatabase', request) as Promise<DatabaseMaintenanceResponse>,
    exportDiagnostics: () => ipcRenderer.invoke('settings:exportDiagnostics') as Promise<DataTransferResponse | null>,
    exportAiHistory: (format: 'json' | 'markdown') =>
      ipcRenderer.invoke('settings:exportAiHistory', format) as Promise<DataTransferResponse | null>,
    exportPromptTemplates: () =>
      ipcRenderer.invoke('settings:exportPromptTemplates') as Promise<DataTransferResponse | null>,
    importPromptTemplates: () =>
      ipcRenderer.invoke('settings:importPromptTemplates') as Promise<DataTransferResponse | null>,
    exportApiRequests: () => ipcRenderer.invoke('settings:exportApiRequests') as Promise<DataTransferResponse | null>,
    importApiRequests: () => ipcRenderer.invoke('settings:importApiRequests') as Promise<DataTransferResponse | null>,
    exportWorkspaceProjects: () =>
      ipcRenderer.invoke('settings:exportWorkspaceProjects') as Promise<DataTransferResponse | null>,
    importWorkspaceProjects: () =>
      ipcRenderer.invoke('settings:importWorkspaceProjects') as Promise<DataTransferResponse | null>,
    exportProjectPackage: (projectId: string) =>
      ipcRenderer.invoke('settings:exportProjectPackage', projectId) as Promise<DataTransferResponse | null>,
    previewProjectPackageImport: () =>
      ipcRenderer.invoke('settings:previewProjectPackageImport') as Promise<ProjectPackageImportPreview | null>,
    importProjectPackage: (path: string, mode: ProjectPackageImportMode) =>
      ipcRenderer.invoke('settings:importProjectPackage', path, mode) as Promise<DataTransferResponse | null>
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<WorkspaceProject[]>,
    save: (request: WorkspaceProjectSaveRequest) =>
      ipcRenderer.invoke('projects:save', request) as Promise<WorkspaceProject[]>,
    scanProfile: (projectPath: string) =>
      ipcRenderer.invoke('projects:scanProfile', projectPath) as Promise<ProjectProfileDraft>,
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id) as Promise<WorkspaceProject[]>,
    markOpened: (id: string) => ipcRenderer.invoke('projects:markOpened', id) as Promise<WorkspaceProject[]>,
    getDashboard: (projectId?: string) =>
      ipcRenderer.invoke('projects:getDashboard', projectId) as Promise<ProjectDashboardSummary>,
    listTasks: (filters: ProjectTaskFilters) =>
      ipcRenderer.invoke('projects:listTasks', filters) as Promise<ProjectTask[]>,
    saveTask: (request: ProjectTaskSaveRequest) =>
      ipcRenderer.invoke('projects:saveTask', request) as Promise<ProjectTask[]>,
    deleteTask: (id: string, projectId: string) =>
      ipcRenderer.invoke('projects:deleteTask', id, projectId) as Promise<ProjectTask[]>,
    listTaskFiles: (taskId: string) =>
      ipcRenderer.invoke('projects:listTaskFiles', taskId) as Promise<ProjectTaskFile[]>,
    attachTaskFile: (projectId: string, taskId: string) =>
      ipcRenderer.invoke('projects:attachTaskFile', projectId, taskId) as Promise<ProjectTaskFile[]>,
    deleteTaskFile: (id: string, taskId: string) =>
      ipcRenderer.invoke('projects:deleteTaskFile', id, taskId) as Promise<ProjectTaskFile[]>,
    listAgents: (projectId: string) => ipcRenderer.invoke('projects:listAgents', projectId) as Promise<ProjectAgent[]>,
    saveAgent: (request: ProjectAgentSaveRequest) =>
      ipcRenderer.invoke('projects:saveAgent', request) as Promise<ProjectAgent[]>,
    deleteAgent: (id: string, projectId: string) =>
      ipcRenderer.invoke('projects:deleteAgent', id, projectId) as Promise<ProjectAgent[]>,
    listAgentRuns: (projectId: string, taskId?: string) =>
      ipcRenderer.invoke('projects:listAgentRuns', projectId, taskId) as Promise<AgentWorkflowRun[]>,
    createAgentWorkflowPlan: (request: AgentWorkflowPlanRequest) =>
      ipcRenderer.invoke('projects:createAgentWorkflowPlan', request) as Promise<AgentWorkflowRun>,
    saveAgentRun: (request: AgentWorkflowRunSaveRequest) =>
      ipcRenderer.invoke('projects:saveAgentRun', request) as Promise<AgentWorkflowRun[]>,
    deleteAgentRun: (id: string, projectId: string) =>
      ipcRenderer.invoke('projects:deleteAgentRun', id, projectId) as Promise<AgentWorkflowRun[]>,
    listKnowledge: (filters: ProjectKnowledgeFilters) =>
      ipcRenderer.invoke('projects:listKnowledge', filters) as Promise<ProjectKnowledgeItem[]>,
    search: (filters: ProjectSearchFilters) =>
      ipcRenderer.invoke('projects:search', filters) as Promise<ProjectSearchResult[]>,
    saveKnowledge: (request: ProjectKnowledgeSaveRequest) =>
      ipcRenderer.invoke('projects:saveKnowledge', request) as Promise<ProjectKnowledgeItem[]>,
    deleteKnowledge: (id: string, projectId: string) =>
      ipcRenderer.invoke('projects:deleteKnowledge', id, projectId) as Promise<ProjectKnowledgeItem[]>,
    toggleKnowledgeFavorite: (id: string, projectId: string, favorite: boolean) =>
      ipcRenderer.invoke('projects:toggleKnowledgeFavorite', id, projectId, favorite) as Promise<ProjectKnowledgeItem[]>
  },
  updates: {
    getInfo: () => ipcRenderer.invoke('updates:getInfo') as Promise<UpdateInfo>,
    check: () => ipcRenderer.invoke('updates:check') as Promise<UpdateCheckResponse>,
    openDownloadPage: () => ipcRenderer.invoke('updates:openDownloadPage') as Promise<{ ok: true }>
  }
}

contextBridge.exposeInMainWorld('devtoolsApi', devtoolsApi)
