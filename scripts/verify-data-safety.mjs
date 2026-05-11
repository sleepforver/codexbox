import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import initSqlJs from 'sql.js'

function read(path) {
  return readFileSync(path, 'utf8')
}

function assertIncludes(path, text, label = text) {
  assert.ok(read(path).includes(text), `${path} missing ${label}`)
}

function extractCurrentSchemaVersion() {
  const match = read('electron/main/db/schema.ts').match(/currentSchemaVersion\s*=\s*(\d+)/)
  assert.ok(match, 'currentSchemaVersion not found')
  return Number(match[1])
}

function extractInitializeSchemaSql() {
  const source = read('electron/main/db/schema.ts')
  const match = source.match(/db\.run\(`([\s\S]*?)`\)/)
  assert.ok(match, 'initializeSchema SQL block not found')
  return match[1]
}

function readOne(db, sql, params = []) {
  const statement = db.prepare(sql)
  statement.bind(params)
  try {
    if (!statement.step()) return null
    return statement.getAsObject()
  } finally {
    statement.free()
  }
}

function readMany(db, sql, params = []) {
  const statement = db.prepare(sql)
  statement.bind(params)
  const rows = []
  try {
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

function tableNames(db) {
  return readMany(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).map((row) => row.name)
}

function columnNames(db, table) {
  return readMany(db, `PRAGMA table_info(${table})`).map((row) => row.name)
}

function tableCount(db, table) {
  return readOne(db, `SELECT COUNT(*) AS count FROM ${table}`).count
}

function persist(db, path) {
  writeFileSync(path, Buffer.from(db.export()))
}

function loadDatabase(SQL, path) {
  return new SQL.Database(readFileSync(path))
}

function backupDatabaseFile(sourcePath, backupDir) {
  mkdirSync(backupDir, { recursive: true })
  const target = join(backupDir, 'devtools-codex-test-backup.db')
  copyFileSync(sourcePath, target)
  return target
}

function cleanupDatabase(db, request) {
  db.run('BEGIN')
  try {
    if (request.aiHistory) db.run('DELETE FROM ai_history')
    if (request.apiHistory) db.run('DELETE FROM api_history')
    if (request.apiSavedRequests) db.run('DELETE FROM api_saved_requests')
    if (request.customPromptTemplates) db.run('DELETE FROM ai_prompt_templates WHERE is_builtin = 0')
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}

function seedMutableRows(db) {
  db.run(
    `INSERT INTO ai_history (id, task_type, title, prompt, output, model, is_favorite, project_id, created_at)
     VALUES ('history-1', 'generate-code', 'Generate', 'prompt', 'output', 'model', 0, 'project-1', '2026-05-11T00:00:00.000Z')`
  )
  db.run(
    `INSERT INTO api_history (method, url, at, created_at)
     VALUES ('GET', 'https://example.com', '2026-05-11T00:00:00.000Z', 1)`
  )
  db.run(
    `INSERT INTO api_saved_requests (id, name, method, url, headers, body, project_id, group_name, source_type, source_path, confidence, created_at, updated_at)
     VALUES ('request-1', 'Example', 'GET', 'https://example.com', '[]', '', 'project-1', 'default', 'manual', '', 100, '2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z')`
  )
  db.run(
    `INSERT INTO ai_prompt_templates (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
     VALUES ('template-custom', 'generate-code', 'Custom', '{{prompt}}', '["prompt"]', 0, '2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z')`
  )
  db.run(
    `INSERT INTO ai_prompt_templates (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
     VALUES ('template-builtin', 'generate-code', 'Builtin', '{{prompt}}', '["prompt"]', 1, '2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z')`
  )
}

const schemaVersion = extractCurrentSchemaVersion()
assert.equal(schemaVersion, 8, 'unexpected current schema version')

for (const version of [2, 3, 4, 5, 6, 7, 8]) {
  assertIncludes('electron/main/db/migrations.ts', `schema_version', '${version}`, `migration version ${version}`)
}

assertIncludes('electron/main/db/connection.ts', 'migrateSchema(db)', 'schema migration on open')
assertIncludes('electron/main/db/connection.ts', 'seedDefaults(db)', 'default seed on open')
assertIncludes('electron/main/db/connection.ts', 'migrateLegacyJson(db)', 'legacy JSON migration on open')
assertIncludes(
  'electron/main/db/repositories/databaseMaintenanceRepository.ts',
  'await closeDatabase()',
  'close before restore'
)
assertIncludes('electron/main/db/repositories/databaseMaintenanceRepository.ts', 'copyFileSync(sourcePath, dbPath())')
assertIncludes('electron/main/db/repositories/databaseMaintenanceRepository.ts', 'DELETE FROM ai_history')
assertIncludes('electron/main/db/repositories/databaseMaintenanceRepository.ts', 'DELETE FROM api_history')
assertIncludes('electron/main/db/repositories/databaseMaintenanceRepository.ts', 'DELETE FROM api_saved_requests')
assertIncludes(
  'electron/main/db/repositories/databaseMaintenanceRepository.ts',
  'DELETE FROM ai_prompt_templates WHERE is_builtin = 0'
)
assertIncludes('electron/main/services/settings.ts', 'formatFileSystemError', '.env write error helper')
assertIncludes('electron/main/services/settings.ts', "throw new Error(formatFileSystemError(error, '.env'))")
assertIncludes(
  'electron/main/db/repositories/databaseMaintenanceRepository.ts',
  'formatDatabaseFileError',
  'database file error helper'
)
assertIncludes(
  'electron/main/db/repositories/databaseMaintenanceRepository.ts',
  '正被其他程序占用',
  'busy database file guidance'
)
assertIncludes('electron/main/ipc/ipcError.ts', 'getRecentIpcErrors', 'recent IPC error diagnostics')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', 'settings:exportDiagnostics', 'diagnostics export IPC')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', "withIpcError('导出 AI 历史'", 'export error tracking')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', "withIpcError('导出项目数据包'", 'project export tracking')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', 'createDiagnosticSnapshot', 'diagnostics snapshot')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', 'appVersion: app.getVersion()', 'diagnostics app version')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', 'platform:', 'diagnostics platform info')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', 'database,', 'diagnostics database info')
assertIncludes('src/shared/ipc.ts', 'interface DiagnosticSnapshot', 'diagnostics shared type')
assertIncludes('src/renderer/views/SettingsView.vue', 'exportDiagnostics', 'settings diagnostics action')

const SQL = await initSqlJs()
const db = new SQL.Database()
db.run(extractInitializeSchemaSql())

const expectedTables = [
  'ai_history',
  'ai_prompt_templates',
  'api_env_vars',
  'api_history',
  'api_saved_requests',
  'meta',
  'settings',
  'workspace_projects'
]
assert.deepEqual(tableNames(db), expectedTables)

assert.ok(columnNames(db, 'ai_history').includes('is_favorite'), 'ai_history.is_favorite missing')
assert.ok(columnNames(db, 'api_saved_requests').includes('project_id'), 'api_saved_requests.project_id missing')
assert.ok(columnNames(db, 'api_env_vars').includes('project_id'), 'api_env_vars.project_id missing')

seedMutableRows(db)
assert.equal(tableCount(db, 'ai_history'), 1)
assert.equal(tableCount(db, 'api_history'), 1)
assert.equal(tableCount(db, 'api_saved_requests'), 1)
assert.equal(tableCount(db, 'ai_prompt_templates'), 2)

const tempDir = mkdtempSync(join(tmpdir(), 'codexbox-data-safety-'))
try {
  const dbPath = join(tempDir, 'devtools-codex.db')
  const backupDir = join(tempDir, 'backups')
  persist(db, dbPath)
  const backupPath = backupDatabaseFile(dbPath, backupDir)
  assert.ok(existsSync(backupPath), 'backup file not created')

  cleanupDatabase(db, {
    aiHistory: true,
    apiHistory: true,
    apiSavedRequests: true,
    customPromptTemplates: true
  })

  assert.equal(tableCount(db, 'ai_history'), 0)
  assert.equal(tableCount(db, 'api_history'), 0)
  assert.equal(tableCount(db, 'api_saved_requests'), 0)
  assert.equal(tableCount(db, 'ai_prompt_templates'), 1, 'builtin prompt template should be retained')

  copyFileSync(backupPath, dbPath)
  const restored = loadDatabase(SQL, dbPath)
  try {
    assert.equal(tableCount(restored, 'ai_history'), 1)
    assert.equal(tableCount(restored, 'api_history'), 1)
    assert.equal(tableCount(restored, 'api_saved_requests'), 1)
    assert.equal(tableCount(restored, 'ai_prompt_templates'), 2)
  } finally {
    restored.close()
  }
} finally {
  db.close()
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('data safety verification checks passed')
