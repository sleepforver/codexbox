import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import initSqlJs, { type Database } from 'sql.js'
import { randomUUID } from 'node:crypto'
import type {
  AiHistoryItem,
  AiHistorySaveRequest,
  AiPromptTemplate,
  AiPromptTemplateSaveRequest,
  AiTaskType,
  ApiHistoryItem,
  ApiSavedRequest,
  ApiToolState,
  DatabaseInfo,
  DatabaseMaintenanceCleanupRequest,
  DatabaseMaintenanceResponse,
  DatabaseTableStat,
  EnvPair
} from '../../../src/shared/ipc.js'

interface LegacySettings {
  openaiApiKey?: string
  openaiModel?: string
  defaultWorkspace?: string
  apiTimeoutMs?: number
  autoFormatJsonResponse?: boolean
  apiState?: ApiToolState
}

let databasePromise: Promise<Database> | null = null

const builtinPromptTemplates: Array<Pick<AiPromptTemplate, 'id' | 'taskType' | 'name' | 'content' | 'variables'>> = [
  {
    id: 'builtin-explain-risk-review',
    taskType: 'explain-code',
    name: '代码风险审查',
    content:
      '请从电力地理行业软件开发角度审查以下代码：\n\n{{code}}\n\n请按“意图概述、关键流程、潜在风险、改进建议、建议测试”五段输出。',
    variables: ['code']
  },
  {
    id: 'builtin-explain-geojson',
    taskType: 'explain-code',
    name: 'GeoJSON 数据解释',
    content:
      '请解释以下 GeoJSON 或地理数据处理代码的作用，并说明它对线路、杆塔、变电站等电力地理数据的适用性：\n\n{{code}}',
    variables: ['code']
  },
  {
    id: 'builtin-generate-geojson-validator',
    taskType: 'generate-code',
    name: 'GeoJSON 体检函数',
    content:
      '请生成一个 TypeScript 函数，用于校验 GeoJSON FeatureCollection。要求统计 geometry 类型、计算经纬度范围、检查必填属性 {{requiredFields}}，并返回结构化问题列表。',
    variables: ['requiredFields']
  },
  {
    id: 'builtin-generate-line-ledger-checker',
    taskType: 'generate-code',
    name: '线路台账字段检查',
    content:
      '请生成 TypeScript 代码，校验电力线路台账记录。字段包括 lineName、voltage、towerId、stationName、geometry。要求输出缺失字段、重复杆塔编号和坐标异常。',
    variables: []
  },
  {
    id: 'builtin-api-debug-powergis',
    taskType: 'api-debug',
    name: '电力地理 API 报文排错',
    content:
      '请分析以下 API 请求和响应，重点检查鉴权、坐标字段、分页参数、服务端错误和电力地理业务字段是否合理：\n\n{{requestAndResponse}}',
    variables: ['requestAndResponse']
  },
  {
    id: 'builtin-git-summary-powergis',
    taskType: 'git-summary',
    name: '电力地理变更说明',
    content:
      '请根据以下 Git diff 生成中文变更说明，按“功能变化、影响范围、风险点、建议验证”输出，并关注电力地理数据处理逻辑：\n\n{{diff}}',
    variables: ['diff']
  },
  {
    id: 'builtin-commit-message-standard',
    taskType: 'commit-message',
    name: '规范 Commit Message',
    content:
      '请根据以下 Git diff 生成规范 commit message。要求包含一行 Conventional Commits 标题，必要时补充中文正文：\n\n{{diff}}',
    variables: ['diff']
  }
]

function dbPath(): string {
  return join(projectDataDir(), 'devtools-codex.db')
}

function backupDir(): string {
  return join(projectDataDir(), 'backups')
}

function oldUserDataDbPath(): string {
  return join(app.getPath('userData'), 'devtools-codex.db')
}

function projectDataDir(): string {
  return resolve(process.cwd(), 'data')
}

function legacySettingsPath(): string {
  return join(app.getPath('userData'), 'devtools-codex-settings.json')
}

async function openDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  const path = dbPath()
  const oldPath = oldUserDataDbPath()

  if (existsSync(path)) {
    return new SQL.Database(readFileSync(path))
  }

  mkdirSync(dirname(path), { recursive: true })

  if (existsSync(oldPath)) {
    return new SQL.Database(readFileSync(oldPath))
  }

  return new SQL.Database()
}

function persist(db: Database): void {
  const data = db.export()
  writeFileSync(dbPath(), Buffer.from(data))
}

function run(db: Database, sql: string, params: unknown[] = []): void {
  db.run(sql, params)
}

function transaction(db: Database, work: () => void): void {
  db.run('BEGIN')
  try {
    work()
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}

function readOne<T>(db: Database, sql: string, params: unknown[] = []): T | null {
  const statement = db.prepare(sql)
  statement.bind(params)

  try {
    if (!statement.step()) return null
    return statement.getAsObject() as T
  } finally {
    statement.free()
  }
}

function readMany<T>(db: Database, sql: string, params: unknown[] = []): T[] {
  const statement = db.prepare(sql)
  statement.bind(params)
  const rows: T[] = []

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }
  } finally {
    statement.free()
  }

  return rows
}

function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_env_vars (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS api_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      at TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_saved_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      headers TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_history (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_prompt_templates (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      variables TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

function getSettingRaw(db: Database, key: string): string | null {
  const row = readOne<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? null
}

function setSettingRaw(db: Database, key: string, value: unknown): void {
  run(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)])
}

function getMeta(db: Database, key: string): string | null {
  const row = readOne<{ value: string }>(db, 'SELECT value FROM meta WHERE key = ?', [key])
  return row?.value ?? null
}

function setMeta(db: Database, key: string, value: string): void {
  run(db, 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value])
}

function seedDefaults(db: Database): void {
  if (getSettingRaw(db, 'openaiModel') === null) setSettingRaw(db, 'openaiModel', 'Qwen/Qwen2.5-7B-Instruct')
  if (getSettingRaw(db, 'defaultWorkspace') === null) setSettingRaw(db, 'defaultWorkspace', '')
  if (getSettingRaw(db, 'apiTimeoutMs') === null) setSettingRaw(db, 'apiTimeoutMs', 30000)
  if (getSettingRaw(db, 'autoFormatJsonResponse') === null) setSettingRaw(db, 'autoFormatJsonResponse', true)

  const count = readOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM api_env_vars')
  if (!count?.count) {
    run(db, 'INSERT OR REPLACE INTO api_env_vars (key, value, sort_order) VALUES (?, ?, ?)', [
      'baseUrl',
      'https://httpbin.org',
      0
    ])
  }

  seedBuiltinPromptTemplates(db)
}

function seedBuiltinPromptTemplates(db: Database): void {
  const now = new Date().toISOString()
  builtinPromptTemplates.forEach((item) => {
    const existing = readOne<{ id: string }>(db, 'SELECT id FROM ai_prompt_templates WHERE id = ?', [item.id])
    if (existing) return

    run(
      db,
      `INSERT INTO ai_prompt_templates
        (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.taskType, item.name, item.content, JSON.stringify(item.variables), 1, now, now]
    )
  })
}

function migrateLegacyJson(db: Database): void {
  if (getMeta(db, 'legacy_json_migrated') === '1') return

  const path = legacySettingsPath()
  if (!existsSync(path)) {
    setMeta(db, 'legacy_json_migrated', '1')
    return
  }

  try {
    const legacy = JSON.parse(readFileSync(path, 'utf8')) as LegacySettings

    if (legacy.openaiApiKey) setSettingRaw(db, 'openaiApiKey', legacy.openaiApiKey)
    if (legacy.openaiModel) setSettingRaw(db, 'openaiModel', legacy.openaiModel)
    if (legacy.defaultWorkspace !== undefined) setSettingRaw(db, 'defaultWorkspace', legacy.defaultWorkspace)
    if (legacy.apiTimeoutMs !== undefined) setSettingRaw(db, 'apiTimeoutMs', legacy.apiTimeoutMs)
    if (legacy.autoFormatJsonResponse !== undefined) {
      setSettingRaw(db, 'autoFormatJsonResponse', legacy.autoFormatJsonResponse)
    }

    if (legacy.apiState?.envVars?.length) saveApiEnvVars(db, legacy.apiState.envVars)
    if (legacy.apiState?.history?.length) saveApiHistory(db, legacy.apiState.history)

    unlinkSync(path)
  } catch {
    // Keep the legacy file if migration cannot parse it.
  }

  setMeta(db, 'legacy_json_migrated', '1')
}

export async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = openDatabase().then((db) => {
      initializeSchema(db)
      seedDefaults(db)
      migrateLegacyJson(db)
      persist(db)
      return db
    })
  }

  return databasePromise
}

export async function saveDatabase(): Promise<void> {
  persist(await getDatabase())
}

function tableCount(db: Database, table: string): number {
  return readOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0
}

function readDatabaseFileInfo(db: Database): DatabaseInfo {
  const path = dbPath()
  const exists = existsSync(path)
  const stat = exists ? statSync(path) : null
  const tables: DatabaseTableStat[] = [
    { table: 'settings', label: '设置项', rows: tableCount(db, 'settings') },
    { table: 'api_env_vars', label: 'API 环境变量', rows: tableCount(db, 'api_env_vars') },
    { table: 'api_history', label: 'API 请求历史', rows: tableCount(db, 'api_history') },
    { table: 'api_saved_requests', label: 'API 请求集合', rows: tableCount(db, 'api_saved_requests') },
    { table: 'ai_history', label: 'AI 历史', rows: tableCount(db, 'ai_history') },
    { table: 'ai_prompt_templates', label: 'Prompt 模板', rows: tableCount(db, 'ai_prompt_templates') },
    { table: 'meta', label: '数据库元信息', rows: tableCount(db, 'meta') }
  ]

  return {
    path,
    exists,
    sizeBytes: stat?.size ?? 0,
    updatedAt: stat?.mtime.toISOString() ?? null,
    tables
  }
}

export async function getDatabaseInfoFromDb(): Promise<DatabaseInfo> {
  const db = await getDatabase()
  persist(db)
  return readDatabaseFileInfo(db)
}

export async function backupDatabaseToFile(): Promise<DatabaseMaintenanceResponse> {
  const db = await getDatabase()
  persist(db)
  mkdirSync(backupDir(), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(backupDir(), `devtools-codex-${stamp}.db`)
  copyFileSync(dbPath(), target)

  return {
    ok: true,
    message: `数据库已备份：${target}`,
    info: readDatabaseFileInfo(db)
  }
}

export async function restoreDatabaseFromFile(sourcePath: string): Promise<DatabaseMaintenanceResponse> {
  if (!existsSync(sourcePath)) {
    throw new Error('备份文件不存在')
  }

  const current = await getDatabase()
  current.close()
  databasePromise = null
  mkdirSync(dirname(dbPath()), { recursive: true })
  copyFileSync(sourcePath, dbPath())
  const db = await getDatabase()

  return {
    ok: true,
    message: `数据库已从备份恢复：${sourcePath}`,
    info: readDatabaseFileInfo(db)
  }
}

export async function cleanupDatabaseInDb(request: DatabaseMaintenanceCleanupRequest): Promise<DatabaseMaintenanceResponse> {
  const db = await getDatabase()
  transaction(db, () => {
    if (request.aiHistory) run(db, 'DELETE FROM ai_history')
    if (request.apiHistory) run(db, 'DELETE FROM api_history')
    if (request.apiSavedRequests) run(db, 'DELETE FROM api_saved_requests')
    if (request.customPromptTemplates) run(db, 'DELETE FROM ai_prompt_templates WHERE is_builtin = 0')
  })
  persist(db)

  return {
    ok: true,
    message: '数据库清理完成',
    info: readDatabaseFileInfo(db)
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDatabase()
  const value = getSettingRaw(db, key)

  if (value === null) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDatabase()
  setSettingRaw(db, key, value)
  persist(db)
}

export async function getApiToolStateFromDb(): Promise<ApiToolState> {
  const db = await getDatabase()
  const envVars = readMany<EnvPair>(
    db,
    'SELECT key, value FROM api_env_vars ORDER BY sort_order ASC, key ASC'
  )
  const history = readMany<ApiHistoryItem>(
    db,
    'SELECT method, url, at FROM api_history ORDER BY created_at DESC, id DESC LIMIT 20'
  )

  return { envVars, history }
}

function saveApiEnvVars(db: Database, envVars: EnvPair[]): void {
  transaction(db, () => {
    run(db, 'DELETE FROM api_env_vars')
    envVars.forEach((item, index) => {
      if (!item.key.trim()) return
      run(db, 'INSERT OR REPLACE INTO api_env_vars (key, value, sort_order) VALUES (?, ?, ?)', [
        item.key.trim(),
        item.value,
        index
      ])
    })
  })
}

function saveApiHistory(db: Database, history: ApiHistoryItem[]): void {
  transaction(db, () => {
    run(db, 'DELETE FROM api_history')
    history.slice(0, 20).forEach((item, index) => {
      run(db, 'INSERT INTO api_history (method, url, at, created_at) VALUES (?, ?, ?, ?)', [
        item.method,
        item.url,
        item.at,
        Date.now() - index
      ])
    })
  })
}

export async function saveApiToolStateToDb(state: ApiToolState): Promise<ApiToolState> {
  const db = await getDatabase()
  saveApiEnvVars(db, state.envVars)
  saveApiHistory(db, state.history)
  persist(db)
  return getApiToolStateFromDb()
}

export async function getApiSavedRequestsFromDb(): Promise<ApiSavedRequest[]> {
  const db = await getDatabase()
  const rows = readMany<{
    id: string
    name: string
    method: ApiSavedRequest['method']
    url: string
    headers: string
    body: string
    created_at: string
    updated_at: string
  }>(db, 'SELECT id, name, method, url, headers, body, created_at, updated_at FROM api_saved_requests ORDER BY updated_at DESC')

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    method: row.method,
    url: row.url,
    headers: JSON.parse(row.headers) as ApiSavedRequest['headers'],
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
}

export async function saveApiRequestToDb(
  request: Omit<ApiSavedRequest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<ApiSavedRequest[]> {
  const db = await getDatabase()
  const now = new Date().toISOString()
  const id = request.id || randomUUID()
  const existing = request.id
    ? readOne<{ created_at: string }>(db, 'SELECT created_at FROM api_saved_requests WHERE id = ?', [request.id])
    : null

  run(
    db,
    `INSERT OR REPLACE INTO api_saved_requests
      (id, name, method, url, headers, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      request.name.trim() || `${request.method} ${request.url}`,
      request.method,
      request.url,
      JSON.stringify(request.headers),
      request.body,
      existing?.created_at || now,
      now
    ]
  )
  persist(db)
  return getApiSavedRequestsFromDb()
}

export async function deleteApiRequestFromDb(id: string): Promise<ApiSavedRequest[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM api_saved_requests WHERE id = ?', [id])
  persist(db)
  return getApiSavedRequestsFromDb()
}

export async function getAiHistoryFromDb(taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  const rows = taskType
    ? readMany<{
        id: string
        task_type: AiTaskType
        title: string
        prompt: string
        output: string
        model: string
        created_at: string
      }>(
        db,
        'SELECT id, task_type, title, prompt, output, model, created_at FROM ai_history WHERE task_type = ? ORDER BY created_at DESC LIMIT 50',
        [taskType]
      )
    : readMany<{
        id: string
        task_type: AiTaskType
        title: string
        prompt: string
        output: string
        model: string
        created_at: string
      }>(
        db,
        'SELECT id, task_type, title, prompt, output, model, created_at FROM ai_history ORDER BY created_at DESC LIMIT 100'
      )

  return rows.map((row) => ({
    id: row.id,
    taskType: row.task_type,
    title: row.title,
    prompt: row.prompt,
    output: row.output,
    model: row.model,
    createdAt: row.created_at
  }))
}

export async function saveAiHistoryToDb(request: AiHistorySaveRequest): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  const now = new Date().toISOString()
  const title = request.title.trim() || request.prompt.trim().split(/\r?\n/)[0]?.slice(0, 60) || '未命名 AI 记录'

  run(
    db,
    `INSERT INTO ai_history
      (id, task_type, title, prompt, output, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), request.taskType, title, request.prompt, request.output, request.model, now]
  )
  persist(db)
  return getAiHistoryFromDb(request.taskType)
}

export async function deleteAiHistoryFromDb(id: string, taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM ai_history WHERE id = ?', [id])
  persist(db)
  return getAiHistoryFromDb(taskType)
}

export async function getAiPromptTemplatesFromDb(taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  const db = await getDatabase()
  const rows = taskType
    ? readMany<{
        id: string
        task_type: AiTaskType
        name: string
        content: string
        variables: string
        is_builtin: number
        created_at: string
        updated_at: string
      }>(
        db,
        'SELECT id, task_type, name, content, variables, is_builtin, created_at, updated_at FROM ai_prompt_templates WHERE task_type = ? ORDER BY is_builtin DESC, updated_at DESC, name ASC',
        [taskType]
      )
    : readMany<{
        id: string
        task_type: AiTaskType
        name: string
        content: string
        variables: string
        is_builtin: number
        created_at: string
        updated_at: string
      }>(
        db,
        'SELECT id, task_type, name, content, variables, is_builtin, created_at, updated_at FROM ai_prompt_templates ORDER BY task_type ASC, is_builtin DESC, updated_at DESC, name ASC'
      )

  return rows.map((row) => ({
    id: row.id,
    taskType: row.task_type,
    name: row.name,
    content: row.content,
    variables: JSON.parse(row.variables) as string[],
    isBuiltin: Boolean(row.is_builtin),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
}

export async function saveAiPromptTemplateToDb(request: AiPromptTemplateSaveRequest): Promise<AiPromptTemplate[]> {
  const db = await getDatabase()
  const now = new Date().toISOString()
  const name = request.name.trim() || '未命名模板'
  const content = request.content.trim()

  if (!content) {
    return getAiPromptTemplatesFromDb(request.taskType)
  }

  if (request.id) {
    const existing = readOne<{ is_builtin: number; created_at: string }>(
      db,
      'SELECT is_builtin, created_at FROM ai_prompt_templates WHERE id = ?',
      [request.id]
    )
    if (existing?.is_builtin) {
      return getAiPromptTemplatesFromDb(request.taskType)
    }

    run(
      db,
      `INSERT OR REPLACE INTO ai_prompt_templates
        (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [request.id, request.taskType, name, content, JSON.stringify(request.variables), 0, existing?.created_at || now, now]
    )
  } else {
    run(
      db,
      `INSERT INTO ai_prompt_templates
        (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), request.taskType, name, content, JSON.stringify(request.variables), 0, now, now]
    )
  }

  persist(db)
  return getAiPromptTemplatesFromDb(request.taskType)
}

export async function deleteAiPromptTemplateFromDb(id: string, taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM ai_prompt_templates WHERE id = ? AND is_builtin = 0', [id])
  persist(db)
  return getAiPromptTemplatesFromDb(taskType)
}

export async function resetBuiltinPromptTemplatesInDb(taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  const db = await getDatabase()
  transaction(db, () => {
    if (taskType) {
      run(db, 'DELETE FROM ai_prompt_templates WHERE is_builtin = 1 AND task_type = ?', [taskType])
    } else {
      run(db, 'DELETE FROM ai_prompt_templates WHERE is_builtin = 1')
    }
    seedBuiltinPromptTemplates(db)
  })
  persist(db)
  return getAiPromptTemplatesFromDb(taskType)
}
