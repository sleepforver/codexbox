export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

export interface HeaderPair {
  key: string
  value: string
}

export interface EnvPair {
  key: string
  value: string
}

export type JsonTransformMode = 'format' | 'minify' | 'validate'
export type JsonIndent = 2 | 4 | 'tab'

export interface JsonTransformRequest {
  source: string
  mode: JsonTransformMode
  indent: JsonIndent
}

export interface JsonMetadata {
  rootType: 'object' | 'array' | 'primitive'
  characters: number
  lines: number
  topLevelKeys: number
}

export type JsonTransformResponse =
  | { ok: true; output: string; metadata: JsonMetadata }
  | { ok: false; error: string; line?: number; column?: number }

export interface JsonQueryRequest {
  source: string
  path: string
}

export type JsonQueryResponse =
  | { ok: true; output: string; matched: boolean }
  | { ok: false; error: string }

export interface ApiSendRequest {
  method: ApiMethod
  url: string
  headers: HeaderPair[]
  body?: string
  timeoutMs?: number
}

export interface ApiResponseMetadata {
  contentType: string
  sizeBytes: number
  isJson: boolean
}

export type ApiSendResponse =
  | {
      ok: true
      requestId: string
      status: number
      statusText: string
      durationMs: number
      headers: Record<string, string>
      body: string
      metadata: ApiResponseMetadata
    }
  | {
      ok: false
      requestId: string
      durationMs: number
      error: string
    }

export interface ApiHistoryItem {
  method: ApiMethod
  url: string
  at: string
}

export interface ApiSavedRequest {
  id: string
  name: string
  method: ApiMethod
  url: string
  headers: HeaderPair[]
  body: string
  projectId?: string
  createdAt: string
  updatedAt: string
}

export interface ApiToolState {
  envVars: EnvPair[]
  history: ApiHistoryItem[]
}

export type GitCommand = 'status' | 'log' | 'diff' | 'file-diff'
export type GitAction = 'stage-file' | 'unstage-file'

export interface GitCommandRequest {
  command: GitCommand
  cwd?: string
  path?: string
}

export interface GitFileChange {
  path: string
  status: string
}

export interface GitCommit {
  hash: string
  subject: string
  author?: string
  date?: string
}

export interface GitStatusResponse {
  branch: string
  changes: GitFileChange[]
  raw: string
}

export interface GitLogResponse {
  commits: GitCommit[]
  raw: string
}

export interface GitDiffResponse {
  summary: string
  raw: string
}

export type GitCommandResponse =
  | {
      ok: true
      command: 'status'
      status: GitStatusResponse
    }
  | {
      ok: true
      command: 'log'
      log: GitLogResponse
    }
  | {
      ok: true
      command: 'diff'
      diff: GitDiffResponse
    }
  | {
      ok: true
      command: 'file-diff'
      diff: GitDiffResponse
      path: string
    }
  | { ok: false; command: GitCommand; output: string; error: string }

export type GitActionResponse =
  | { ok: true; action: GitAction; path: string; output: string }
  | { ok: false; action: GitAction; path: string; output: string; error: string }

export type GitCommitResponse =
  | { ok: true; output: string }
  | { ok: false; output: string; error: string }

export type AiTaskType = 'explain-code' | 'generate-code' | 'git-summary' | 'commit-message' | 'api-debug'

export interface AiHistoryItem {
  id: string
  taskType: AiTaskType
  title: string
  prompt: string
  output: string
  model: string
  projectId?: string
  createdAt: string
}

export interface AiHistorySaveRequest {
  taskType: AiTaskType
  title: string
  prompt: string
  output: string
  model: string
  projectId?: string
}

export interface AiPromptTemplate {
  id: string
  taskType: AiTaskType
  name: string
  content: string
  variables: string[]
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
}

export interface AiPromptTemplateSaveRequest {
  id?: string
  taskType: AiTaskType
  name: string
  content: string
  variables: string[]
}

export interface AiGenerateTextRequest {
  taskType: AiTaskType
  prompt: string
}

export interface AiGenerateTextStreamRequest extends AiGenerateTextRequest {
  requestId: string
}

export type AiGenerateTextResponse =
  | { ok: true; text: string; model: string }
  | { ok: false; text: string; error: string; model?: string }

export interface AiConfigResponse {
  hasApiKey: boolean
  model: string
}

export type AiConnectionResponse =
  | { ok: true; model: string; baseURL: string; durationMs: number; text: string }
  | { ok: false; model?: string; baseURL?: string; durationMs?: number; error: string }

export type AiStreamEvent =
  | { type: 'chunk'; requestId: string; text: string }
  | { type: 'done'; requestId: string; model: string }
  | { type: 'error'; requestId: string; error: string; model?: string }
  | { type: 'canceled'; requestId: string }

export interface AiStreamStartResponse {
  requestId: string
}

export interface AppSettings {
  openaiModel: string
  openaiBaseURL: string
  apiKeySource: 'env' | 'settings' | 'none'
  hasOpenaiApiKey: boolean
  defaultWorkspace: string
  apiTimeoutMs: number
  autoFormatJsonResponse: boolean
}

export interface AppSettingsUpdate {
  openaiApiKey?: string
  openaiModel?: string
  defaultWorkspace?: string
  apiTimeoutMs?: number
  autoFormatJsonResponse?: boolean
}

export interface WorkspaceProject {
  id: string
  name: string
  path: string
  description: string
  tags: string[]
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
}

export interface WorkspaceProjectSaveRequest {
  id?: string
  name: string
  path: string
  description: string
  tags: string[]
}

export interface DatabaseTableStat {
  table: string
  label: string
  rows: number
}

export interface DatabaseInfo {
  path: string
  exists: boolean
  sizeBytes: number
  updatedAt: string | null
  schemaVersion: number
  tables: DatabaseTableStat[]
}

export interface DatabaseMaintenanceCleanupRequest {
  aiHistory?: boolean
  apiHistory?: boolean
  apiSavedRequests?: boolean
  geoAnalysisHistory?: boolean
  customPromptTemplates?: boolean
}

export interface DatabaseMaintenanceResponse {
  ok: true
  message: string
  info: DatabaseInfo
}

export interface DataTransferResponse {
  ok: true
  message: string
  count: number
}

export interface ProjectDataPackage {
  project: WorkspaceProject
  aiHistory: AiHistoryItem[]
  apiRequests: ApiSavedRequest[]
  geoAnalysisHistory: GeoAnalyzeHistoryItem[]
  exportedAt: string
}

export interface GeoFeatureTypeCount {
  type: string
  count: number
}

export interface GeoBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface GeoValidationIssue {
  level: 'warning' | 'error'
  path: string
  message: string
}

export interface GeoAnalyzeRequest {
  source: string
  requiredProperties: string[]
  projectId?: string
  title?: string
}

export type GeoAnalyzeResponse =
  | {
      ok: true
      historyId?: string
      featureCount: number
      geometryTypes: GeoFeatureTypeCount[]
      bounds: GeoBounds | null
      issues: GeoValidationIssue[]
    }
  | { ok: false; error: string }

export interface GeoAnalyzeHistoryItem {
  id: string
  projectId?: string
  title: string
  source: string
  requiredProperties: string[]
  result: Extract<GeoAnalyzeResponse, { ok: true }>
  featureCount: number
  issueCount: number
  createdAt: string
}

export interface DevtoolsApi {
  json: {
    transform(request: JsonTransformRequest): Promise<JsonTransformResponse>
    query(request: JsonQueryRequest): Promise<JsonQueryResponse>
  }
  api: {
    send(request: ApiSendRequest): Promise<ApiSendResponse>
    getState(): Promise<ApiToolState>
    saveState(state: ApiToolState): Promise<ApiToolState>
    getSavedRequests(projectId?: string): Promise<ApiSavedRequest[]>
    saveRequest(request: Omit<ApiSavedRequest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ApiSavedRequest[]>
    deleteRequest(id: string): Promise<ApiSavedRequest[]>
  }
  git: {
    run(request: GitCommandRequest): Promise<GitCommandResponse>
    action(request: { action: GitAction; cwd?: string; path: string }): Promise<GitActionResponse>
    commit(request: { cwd?: string; message: string }): Promise<GitCommitResponse>
  }
  ai: {
    getConfig(): Promise<AiConfigResponse>
    generateText(request: AiGenerateTextRequest): Promise<AiGenerateTextResponse>
    generateTextStream(
      request: AiGenerateTextRequest,
      onEvent: (event: AiStreamEvent) => void
    ): Promise<AiStreamStartResponse>
    cancelStream(requestId: string): Promise<void>
    testConnection(): Promise<AiConnectionResponse>
    getHistory(taskType?: AiTaskType, projectId?: string): Promise<AiHistoryItem[]>
    saveHistory(request: AiHistorySaveRequest): Promise<AiHistoryItem[]>
    deleteHistory(id: string, taskType?: AiTaskType): Promise<AiHistoryItem[]>
    clearHistory(taskType?: AiTaskType, projectId?: string): Promise<AiHistoryItem[]>
    getPromptTemplates(taskType?: AiTaskType): Promise<AiPromptTemplate[]>
    savePromptTemplate(request: AiPromptTemplateSaveRequest): Promise<AiPromptTemplate[]>
    deletePromptTemplate(id: string, taskType?: AiTaskType): Promise<AiPromptTemplate[]>
    resetBuiltinPromptTemplates(taskType?: AiTaskType): Promise<AiPromptTemplate[]>
  }
  settings: {
    get(): Promise<AppSettings>
    update(update: AppSettingsUpdate): Promise<AppSettings>
    selectDirectory(): Promise<string | null>
    getDatabaseInfo(): Promise<DatabaseInfo>
    backupDatabase(): Promise<DatabaseMaintenanceResponse>
    restoreDatabase(): Promise<DatabaseMaintenanceResponse | null>
    cleanupDatabase(request: DatabaseMaintenanceCleanupRequest): Promise<DatabaseMaintenanceResponse>
    exportAiHistory(format: 'json' | 'markdown'): Promise<DataTransferResponse | null>
    exportPromptTemplates(): Promise<DataTransferResponse | null>
    importPromptTemplates(): Promise<DataTransferResponse | null>
    exportApiRequests(): Promise<DataTransferResponse | null>
    importApiRequests(): Promise<DataTransferResponse | null>
    exportWorkspaceProjects(): Promise<DataTransferResponse | null>
    importWorkspaceProjects(): Promise<DataTransferResponse | null>
    exportProjectPackage(projectId: string): Promise<DataTransferResponse | null>
    importProjectPackage(): Promise<DataTransferResponse | null>
  }
  projects: {
    list(): Promise<WorkspaceProject[]>
    save(request: WorkspaceProjectSaveRequest): Promise<WorkspaceProject[]>
    delete(id: string): Promise<WorkspaceProject[]>
    markOpened(id: string): Promise<WorkspaceProject[]>
  }
  geo: {
    analyze(request: GeoAnalyzeRequest): Promise<GeoAnalyzeResponse>
    getHistory(projectId?: string): Promise<GeoAnalyzeHistoryItem[]>
    deleteHistory(id: string): Promise<GeoAnalyzeHistoryItem[]>
    clearHistory(projectId?: string): Promise<GeoAnalyzeHistoryItem[]>
  }
}
