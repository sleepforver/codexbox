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
    if (legacy.autoFormatJsonResponse !== undefined) setSettingRaw(db, 'autoFormatJsonResponse', legacy.autoFormatJsonResponse)

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
    setMeta(db, 'schema_version', String(currentSchemaVersion))
    return
  }

  if (storedVersion < currentSchemaVersion) {
    setMeta(db, 'schema_version', String(currentSchemaVersion))
  }
}
