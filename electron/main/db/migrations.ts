import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import type { Database } from 'sql.js'
import type { ApiToolState } from '../../../src/shared/ipc.js'
import { legacySettingsPath } from './paths.js'
import { currentSchemaVersion } from './schema.js'
import { readOne, run } from './runtime.js'
import { saveApiEnvVars, saveApiHistory } from './repositories/apiRepository.js'
import { seedBuiltinPromptTemplates } from './repositories/promptTemplateRepository.js'

interface LegacySettings {
  openaiApiKey?: string
  openaiModel?: string
  defaultWorkspace?: string
  apiTimeoutMs?: number
  autoFormatJsonResponse?: boolean
  apiState?: ApiToolState
}

export function getMeta(db: Database, key: string): string | null {
  const row = readOne<{ value: string }>(db, 'SELECT value FROM meta WHERE key = ?', [key])
  return row?.value ?? null
}

export function setMeta(db: Database, key: string, value: string): void {
  run(db, 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value])
}

export function getSettingRaw(db: Database, key: string): string | null {
  const row = readOne<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? null
}

export function setSettingRaw(db: Database, key: string, value: unknown): void {
  run(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)])
}

export function seedDefaults(db: Database): void {
  if (getSettingRaw(db, 'openaiModel') === null) setSettingRaw(db, 'openaiModel', 'Qwen/Qwen2.5-7B-Instruct')
  if (getSettingRaw(db, 'defaultWorkspace') === null) setSettingRaw(db, 'defaultWorkspace', '')
  if (getSettingRaw(db, 'apiTimeoutMs') === null) setSettingRaw(db, 'apiTimeoutMs', 30000)
  if (getSettingRaw(db, 'autoFormatJsonResponse') === null) setSettingRaw(db, 'autoFormatJsonResponse', true)

  const count = readOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM api_env_vars WHERE project_id = ''")
  if (!count?.count) {
    run(db, 'INSERT OR REPLACE INTO api_env_vars (project_id, key, value, sort_order) VALUES (?, ?, ?, ?)', [
      '',
      'baseUrl',
      'https://httpbin.org',
      0
    ])
  }

  seedBuiltinPromptTemplates(db)
}

export function migrateLegacyJson(db: Database): void {
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
    if (legacy.autoFormatJsonResponse !== undefined)
      setSettingRaw(db, 'autoFormatJsonResponse', legacy.autoFormatJsonResponse)

    if (legacy.apiState?.envVars?.length) saveApiEnvVars(db, legacy.apiState.envVars)
    if (legacy.apiState?.history?.length) saveApiHistory(db, legacy.apiState.history)

    unlinkSync(path)
  } catch {
    // Keep the legacy file if migration cannot parse it.
  }

  setMeta(db, 'legacy_json_migrated', '1')
}

export function migrateSchema(db: Database): void {
  const storedVersion = Number(getMeta(db, 'schema_version') || 0)

  if (storedVersion < 1) {
    setMeta(db, 'schema_version', '1')
  }

  const normalizedVersion = Number(getMeta(db, 'schema_version') || 1)

  if (normalizedVersion < 2) {
    run(
      db,
      `CREATE TABLE IF NOT EXISTS workspace_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT
      )`
    )
    run(db, 'CREATE INDEX IF NOT EXISTS idx_workspace_projects_updated ON workspace_projects (updated_at DESC)')
    setMeta(db, 'schema_version', '2')
  }

  const versionAfterProjects = Number(getMeta(db, 'schema_version') || 2)

  if (versionAfterProjects < 3) {
    if (!columnExists(db, 'ai_history', 'project_id')) {
      run(db, 'ALTER TABLE ai_history ADD COLUMN project_id TEXT')
    }
    if (!columnExists(db, 'api_saved_requests', 'project_id')) {
      run(db, 'ALTER TABLE api_saved_requests ADD COLUMN project_id TEXT')
    }
    run(db, 'CREATE INDEX IF NOT EXISTS idx_ai_history_project ON ai_history (project_id, created_at DESC)')
    run(
      db,
      'CREATE INDEX IF NOT EXISTS idx_api_saved_requests_project ON api_saved_requests (project_id, updated_at DESC)'
    )
    setMeta(db, 'schema_version', '3')
  }

  const versionAfterProjectLinks = Number(getMeta(db, 'schema_version') || 3)

  if (versionAfterProjectLinks < 4) {
    run(
      db,
      `CREATE TABLE IF NOT EXISTS geo_analysis_history (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        required_properties TEXT NOT NULL,
        result TEXT NOT NULL,
        feature_count INTEGER NOT NULL,
        issue_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`
    )
    run(
      db,
      'CREATE INDEX IF NOT EXISTS idx_geo_analysis_project_created ON geo_analysis_history (project_id, created_at DESC)'
    )
    setMeta(db, 'schema_version', '4')
  }

  const versionAfterGeo = Number(getMeta(db, 'schema_version') || 4)

  if (versionAfterGeo < 5) {
    if (!columnExists(db, 'api_saved_requests', 'group_name')) {
      run(db, 'ALTER TABLE api_saved_requests ADD COLUMN group_name TEXT')
    }
    if (!columnExists(db, 'api_saved_requests', 'source_type')) {
      run(db, 'ALTER TABLE api_saved_requests ADD COLUMN source_type TEXT')
    }
    if (!columnExists(db, 'api_saved_requests', 'source_path')) {
      run(db, 'ALTER TABLE api_saved_requests ADD COLUMN source_path TEXT')
    }
    if (!columnExists(db, 'api_saved_requests', 'confidence')) {
      run(db, 'ALTER TABLE api_saved_requests ADD COLUMN confidence INTEGER')
    }
    run(
      db,
      'CREATE INDEX IF NOT EXISTS idx_api_saved_requests_group ON api_saved_requests (project_id, group_name, updated_at DESC)'
    )
    setMeta(db, 'schema_version', '5')
  }

  const versionAfterApiDiscovery = Number(getMeta(db, 'schema_version') || 5)

  if (versionAfterApiDiscovery < 6) {
    run(
      db,
      `CREATE TABLE IF NOT EXISTS api_env_vars_v2 (
        project_id TEXT NOT NULL DEFAULT '',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, key)
      )`
    )
    if (columnExists(db, 'api_env_vars', 'project_id')) {
      run(
        db,
        "INSERT OR REPLACE INTO api_env_vars_v2 (project_id, key, value, sort_order) SELECT COALESCE(project_id, ''), key, value, sort_order FROM api_env_vars"
      )
    } else {
      run(
        db,
        "INSERT OR REPLACE INTO api_env_vars_v2 (project_id, key, value, sort_order) SELECT '', key, value, sort_order FROM api_env_vars"
      )
    }
    run(db, 'DROP TABLE api_env_vars')
    run(db, 'ALTER TABLE api_env_vars_v2 RENAME TO api_env_vars')
    run(db, 'CREATE INDEX IF NOT EXISTS idx_api_env_vars_project ON api_env_vars (project_id, sort_order)')
    setMeta(db, 'schema_version', '6')
  }

  const versionAfterProjectEnv = Number(getMeta(db, 'schema_version') || 6)

  if (versionAfterProjectEnv < 7) {
    if (!columnExists(db, 'ai_history', 'is_favorite')) {
      run(db, 'ALTER TABLE ai_history ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0')
    }
    run(db, 'CREATE INDEX IF NOT EXISTS idx_ai_history_favorite ON ai_history (is_favorite, created_at DESC)')
    setMeta(db, 'schema_version', '7')
  }

  const versionAfterFavorites = Number(getMeta(db, 'schema_version') || 7)

  if (versionAfterFavorites < 8) {
    run(db, 'DROP TABLE IF EXISTS geo_analysis_history')
    setMeta(db, 'schema_version', '8')
  }

  if (currentSchemaVersion > 8) setMeta(db, 'schema_version', String(currentSchemaVersion))
}

function columnExists(db: Database, table: string, column: string): boolean {
  const safeTable = table.replace(/[^a-z_]/g, '')
  return (
    readOne<{ name: string }>(db, `SELECT name FROM pragma_table_info('${safeTable}') WHERE name = ?`, [column]) !==
    null
  )
}
