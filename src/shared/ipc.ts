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

export type JsonQueryResponse = { ok: true; output: string; matched: boolean } | { ok: false; error: string }

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
  taskId?: string
  groupName?: string
  sourceType?: 'spring-controller' | 'frontend-call' | 'openapi' | 'manual'
  sourcePath?: string
  confidence?: number
  createdAt: string
  updatedAt: string
}

export interface ApiToolState {
  envVars: EnvPair[]
  history: ApiHistoryItem[]
}

export interface ApiDiscoveryRequest {
  projectId?: string
  projectPath: string
}

export interface ApiDiscoveredRequest {
  id: string
  name: string
  method: ApiMethod
  url: string
  headers: HeaderPair[]
  body: string
  groupName: string
  sourceType: 'spring-controller' | 'frontend-call' | 'openapi'
  sourcePath: string
  confidence: number
}

export interface ApiDiscoveryGroup {
  name: string
  sourceType: ApiDiscoveredRequest['sourceType']
  requests: ApiDiscoveredRequest[]
}

export interface ApiDiscoveryResponse {
  ok: true
  projectType: 'spring' | 'frontend' | 'mixed' | 'unknown'
  scannedFiles: number
  skippedFiles: number
  groups: ApiDiscoveryGroup[]
  warnings: string[]
}

export type GitCommand = 'status' | 'log' | 'diff' | 'raw-diff' | 'staged-diff' | 'file-diff'
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
      command: 'diff' | 'raw-diff' | 'staged-diff'
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

export type GitCommitResponse = { ok: true; output: string } | { ok: false; output: string; error: string }

export type AiTaskType = 'explain-code' | 'generate-code' | 'git-summary' | 'commit-message' | 'api-debug'
export type AiProvider = 'siliconflow' | 'openai' | 'deepseek' | 'custom'
export type AiHistorySourceType = 'manual' | 'project' | 'task' | 'git_diff' | 'api_response' | 'code_review'

export interface AiHistoryItem {
  id: string
  taskType: AiTaskType
  title: string
  prompt: string
  output: string
  model: string
  isFavorite: boolean
  projectId?: string
  taskId?: string
  sourceType?: AiHistorySourceType
  sourceRef?: string
  createdAt: string
}

export interface AiHistorySaveRequest {
  taskType: AiTaskType
  title: string
  prompt: string
  output: string
  model: string
  projectId?: string
  taskId?: string
  sourceType?: AiHistorySourceType
  sourceRef?: string
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
  provider: AiProvider
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
  aiProvider: AiProvider
  openaiModel: string
  openaiBaseURL: string
  apiKeySource: 'env' | 'none'
  hasOpenaiApiKey: boolean
  defaultWorkspace: string
  apiTimeoutMs: number
  autoFormatJsonResponse: boolean
}

export interface AppSettingsUpdate {
  aiProvider?: AiProvider
  openaiApiKey?: string
  openaiModel?: string
  openaiBaseURL?: string
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
  projectType: string
  techStack: string
  installCommand: string
  devCommand: string
  testCommand: string
  buildCommand: string
  importantPaths: string
  notes: string
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
  projectType?: string
  techStack?: string
  installCommand?: string
  devCommand?: string
  testCommand?: string
  buildCommand?: string
  importantPaths?: string
  notes?: string
}

export interface ProjectProfileDraft {
  projectType: string
  techStack: string
  installCommand: string
  devCommand: string
  testCommand: string
  buildCommand: string
  importantPaths: string
  notes: string
  tags: string[]
}

export type ProjectTaskStatus = 'todo' | 'in_progress' | 'pending_validation' | 'done' | 'archived'
export type ProjectTaskType = 'requirement' | 'bug' | 'improvement' | 'refactor' | 'documentation' | 'release'
export type ProjectTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ProjectAgentRole = 'pm' | 'architect' | 'developer' | 'tester' | 'reviewer' | 'release'
export type ProjectAgentStatus = 'active' | 'paused'
export type AgentWorkflowStatus = 'draft' | 'running' | 'blocked' | 'done'

export interface ProjectTask {
  id: string
  projectId: string
  title: string
  description: string
  taskType: ProjectTaskType
  priority: ProjectTaskPriority
  status: ProjectTaskStatus
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ProjectTaskFile {
  id: string
  projectId: string
  taskId: string
  name: string
  path: string
  content: string
  sizeBytes: number
  createdAt: string
}

export interface ProjectTaskSaveRequest {
  id?: string
  projectId: string
  title: string
  description: string
  taskType: ProjectTaskType
  priority: ProjectTaskPriority
  status: ProjectTaskStatus
}

export interface ProjectTaskFilters {
  projectId: string
  status?: ProjectTaskStatus | 'all'
  taskType?: ProjectTaskType | 'all'
  keyword?: string
}

export interface ProjectAgent {
  id: string
  projectId: string
  name: string
  role: ProjectAgentRole
  provider: AiProvider
  model: string
  systemPrompt: string
  responsibilities: string
  status: ProjectAgentStatus
  createdAt: string
  updatedAt: string
}

export interface ProjectAgentSaveRequest {
  id?: string
  projectId: string
  name: string
  role: ProjectAgentRole
  provider: AiProvider
  model: string
  systemPrompt: string
  responsibilities: string
  status: ProjectAgentStatus
}

export interface AgentWorkflowStep {
  agentId: string
  agentName: string
  role: ProjectAgentRole
  instruction: string
}

export interface AgentWorkflowRun {
  id: string
  projectId: string
  taskId?: string
  title: string
  goal: string
  status: AgentWorkflowStatus
  steps: AgentWorkflowStep[]
  output: string
  createdAt: string
  updatedAt: string
}

export interface AgentWorkflowRunSaveRequest {
  id?: string
  projectId: string
  taskId?: string
  title: string
  goal: string
  status: AgentWorkflowStatus
  steps: AgentWorkflowStep[]
  output: string
}

export interface AgentWorkflowPlanRequest {
  projectId: string
  taskId?: string
  goal: string
}

export interface ProjectKnowledgeItem {
  id: string
  projectId: string
  title: string
  content: string
  sourceType: AiHistorySourceType
  sourceId?: string
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectKnowledgeFilters {
  projectId: string
  keyword?: string
  favoriteOnly?: boolean
}

export interface ProjectKnowledgeSaveRequest {
  id?: string
  projectId: string
  title: string
  content: string
  sourceType: AiHistorySourceType
  sourceId?: string
  isFavorite?: boolean
}

export type ProjectSearchResultType = 'project' | 'task' | 'ai_history' | 'api_request' | 'knowledge'

export interface ProjectSearchFilters {
  projectId: string
  keyword?: string
}

export interface ProjectSearchResult {
  id: string
  projectId: string
  type: ProjectSearchResultType
  title: string
  summary: string
  sourceType?: AiHistorySourceType | ApiSavedRequest['sourceType'] | 'project' | 'task'
  sourceId?: string
  updatedAt: string
}

export interface ProjectDashboardSummary {
  project: WorkspaceProject | null
  pathExists: boolean
  taskStats: Record<ProjectTaskStatus, number>
  recentTasks: ProjectTask[]
  aiStats: {
    total: number
    favorites: number
    recent: AiHistoryItem[]
  }
  apiStats: {
    savedRequests: number
    envVars: number
    recentHistory: ApiHistoryItem[]
  }
  git: {
    ok: boolean
    branch: string
    changedFiles: number
    stagedFiles: number
    recentCommit: string
    message: string
  }
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
  customPromptTemplates?: boolean
}

export interface DatabaseMaintenanceResponse {
  ok: true
  message: string
  info: DatabaseInfo
}

export interface DiagnosticErrorEntry {
  label: string
  message: string
  at: string
}

export interface DiagnosticSnapshot {
  generatedAt: string
  appVersion: string
  platform: {
    os: NodeJS.Platform
    arch: string
    node: string
    electron?: string
    chrome?: string
  }
  database: DatabaseInfo
  settings: {
    aiProvider: AiProvider
    model: string
    baseURL: string
    apiKeySource: AppSettings['apiKeySource']
    hasApiKey: boolean
    defaultWorkspace: string
    apiTimeoutMs: number
  }
  recentErrors: DiagnosticErrorEntry[]
}

export interface DataTransferResponse {
  ok: true
  message: string
  count: number
  details?: DataTransferDetail[]
}

export interface DataTransferDetail {
  scope: string
  action: 'imported' | 'skipped' | 'overwritten' | 'created'
  message: string
}

export type ProjectPackageImportMode = 'overwrite' | 'skip' | 'new'

export interface ProjectPackageImportPreview {
  path: string
  projectCount: number
  aiHistoryCount: number
  apiRequestCount: number
  taskCount?: number
  knowledgeCount?: number
  conflictProjectNames: string[]
}

export interface ProjectDataPackage {
  project: WorkspaceProject
  aiHistory: AiHistoryItem[]
  apiRequests: ApiSavedRequest[]
  tasks?: ProjectTask[]
  knowledge?: ProjectKnowledgeItem[]
  exportedAt: string
}

export interface AiContextFileResponse {
  path: string
  content: string
}

export interface ProjectPromptTemplateDefault {
  projectId: string
  taskType: AiTaskType
  templateId: string
}

export interface UpdateInfo {
  currentVersion: string
  channel: 'beta' | 'stable'
  feedUrl: string
  feedFile: string
  downloadPageUrl: string
  source: 'cloudflare-r2-generic'
  packaged: boolean
}

export type UpdateCheckResponse =
  | {
      ok: true
      status: 'current' | 'available' | 'unknown'
      currentVersion: string
      latestVersion?: string
      releaseDate?: string
      downloadPageUrl: string
      message: string
    }
  | {
      ok: false
      currentVersion: string
      downloadPageUrl: string
      error: string
    }

export interface DevtoolsApi {
  json: {
    transform(request: JsonTransformRequest): Promise<JsonTransformResponse>
    query(request: JsonQueryRequest): Promise<JsonQueryResponse>
  }
  api: {
    send(request: ApiSendRequest): Promise<ApiSendResponse>
    getState(projectId?: string): Promise<ApiToolState>
    saveState(state: ApiToolState, projectId?: string): Promise<ApiToolState>
    getSavedRequests(projectId?: string): Promise<ApiSavedRequest[]>
    saveRequest(
      request: Omit<ApiSavedRequest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<ApiSavedRequest[]>
    deleteRequest(id: string): Promise<ApiSavedRequest[]>
    discoverRequests(request: ApiDiscoveryRequest): Promise<ApiDiscoveryResponse>
    loadOpenApiRequests(): Promise<ApiDiscoveryResponse | null>
    importDiscoveredRequests(
      projectId: string | undefined,
      requests: ApiDiscoveredRequest[],
      mode: 'skip' | 'overwrite'
    ): Promise<ApiSavedRequest[]>
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
    loadContextFile(): Promise<AiContextFileResponse | null>
    getHistory(taskType?: AiTaskType, projectId?: string, taskId?: string): Promise<AiHistoryItem[]>
    saveHistory(request: AiHistorySaveRequest): Promise<AiHistoryItem[]>
    deleteHistory(id: string, taskType?: AiTaskType): Promise<AiHistoryItem[]>
    clearHistory(taskType?: AiTaskType, projectId?: string): Promise<AiHistoryItem[]>
    toggleHistoryFavorite(id: string, favorite: boolean): Promise<AiHistoryItem[]>
    getPromptTemplates(taskType?: AiTaskType): Promise<AiPromptTemplate[]>
    savePromptTemplate(request: AiPromptTemplateSaveRequest): Promise<AiPromptTemplate[]>
    deletePromptTemplate(id: string, taskType?: AiTaskType): Promise<AiPromptTemplate[]>
    resetBuiltinPromptTemplates(taskType?: AiTaskType): Promise<AiPromptTemplate[]>
    getProjectPromptDefault(projectId: string, taskType: AiTaskType): Promise<string>
    setProjectPromptDefault(defaultValue: ProjectPromptTemplateDefault): Promise<string>
  }
  settings: {
    get(): Promise<AppSettings>
    update(update: AppSettingsUpdate): Promise<AppSettings>
    selectDirectory(): Promise<string | null>
    getDatabaseInfo(): Promise<DatabaseInfo>
    backupDatabase(): Promise<DatabaseMaintenanceResponse>
    restoreDatabase(): Promise<DatabaseMaintenanceResponse | null>
    cleanupDatabase(request: DatabaseMaintenanceCleanupRequest): Promise<DatabaseMaintenanceResponse>
    exportDiagnostics(): Promise<DataTransferResponse | null>
    exportAiHistory(format: 'json' | 'markdown'): Promise<DataTransferResponse | null>
    exportPromptTemplates(): Promise<DataTransferResponse | null>
    importPromptTemplates(): Promise<DataTransferResponse | null>
    exportApiRequests(): Promise<DataTransferResponse | null>
    importApiRequests(): Promise<DataTransferResponse | null>
    exportWorkspaceProjects(): Promise<DataTransferResponse | null>
    importWorkspaceProjects(): Promise<DataTransferResponse | null>
    exportProjectPackage(projectId: string): Promise<DataTransferResponse | null>
    previewProjectPackageImport(): Promise<ProjectPackageImportPreview | null>
    importProjectPackage(path: string, mode: ProjectPackageImportMode): Promise<DataTransferResponse | null>
  }
  projects: {
    list(): Promise<WorkspaceProject[]>
    save(request: WorkspaceProjectSaveRequest): Promise<WorkspaceProject[]>
    scanProfile(projectPath: string): Promise<ProjectProfileDraft>
    delete(id: string): Promise<WorkspaceProject[]>
    markOpened(id: string): Promise<WorkspaceProject[]>
    getDashboard(projectId?: string): Promise<ProjectDashboardSummary>
    listTasks(filters: ProjectTaskFilters): Promise<ProjectTask[]>
    saveTask(request: ProjectTaskSaveRequest): Promise<ProjectTask[]>
    deleteTask(id: string, projectId: string): Promise<ProjectTask[]>
    listTaskFiles(taskId: string): Promise<ProjectTaskFile[]>
    attachTaskFile(projectId: string, taskId: string): Promise<ProjectTaskFile[]>
    deleteTaskFile(id: string, taskId: string): Promise<ProjectTaskFile[]>
    listAgents(projectId: string): Promise<ProjectAgent[]>
    saveAgent(request: ProjectAgentSaveRequest): Promise<ProjectAgent[]>
    deleteAgent(id: string, projectId: string): Promise<ProjectAgent[]>
    listAgentRuns(projectId: string, taskId?: string): Promise<AgentWorkflowRun[]>
    createAgentWorkflowPlan(request: AgentWorkflowPlanRequest): Promise<AgentWorkflowRun>
    saveAgentRun(request: AgentWorkflowRunSaveRequest): Promise<AgentWorkflowRun[]>
    deleteAgentRun(id: string, projectId: string): Promise<AgentWorkflowRun[]>
    listKnowledge(filters: ProjectKnowledgeFilters): Promise<ProjectKnowledgeItem[]>
    search(filters: ProjectSearchFilters): Promise<ProjectSearchResult[]>
    saveKnowledge(request: ProjectKnowledgeSaveRequest): Promise<ProjectKnowledgeItem[]>
    deleteKnowledge(id: string, projectId: string): Promise<ProjectKnowledgeItem[]>
    toggleKnowledgeFavorite(id: string, projectId: string, favorite: boolean): Promise<ProjectKnowledgeItem[]>
  }
  updates: {
    getInfo(): Promise<UpdateInfo>
    check(): Promise<UpdateCheckResponse>
    openDownloadPage(): Promise<{ ok: true }>
  }
}
