import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import initSqlJs, { type Database } from 'sql.js'
import type { DatabaseInfo, DatabaseTableStat } from '../../../src/shared/ipc.js'
import { dbPath, oldUserDataDbPath } from './paths.js'
import { initializeSchema } from './schema.js'
import { migrateLegacyJson, migrateSchema } from './migrations.js'
import { seedDefaults } from './migrations.js'
import { readOne } from './runtime.js'

let databasePromise: Promise<Database> | null = null

async function openDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  const path = dbPath()
  const oldPath = oldUserDataDbPath()

  if (existsSync(path)) {
    return new SQL.Database(readFileSync(path))
  }

  mkdirSync(dirname(path), { recursive: true })

  if (existsSync(oldPath)) {
    copyFileSync(oldPath, path)
    return new SQL.Database(readFileSync(path))
  }

  return new SQL.Database()
}

export async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = openDatabase().then((db) => {
      initializeSchema(db)
      migrateSchema(db)
      seedDefaults(db)
      migrateLegacyJson(db)
      persist(db)
      return db
    })
  }

  return databasePromise
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) return
  const db = await databasePromise
  db.close()
  databasePromise = null
}

export function persist(db: Database): void {
  const data = db.export()
  writeFileSync(dbPath(), Buffer.from(data))
}

export async function saveDatabase(): Promise<void> {
  persist(await getDatabase())
}

function tableCount(db: Database, table: string): number {
  return readOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0
}

export function readDatabaseFileInfo(db: Database): DatabaseInfo {
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
    { table: 'workspace_projects', label: '项目工作区', rows: tableCount(db, 'workspace_projects') },
    { table: 'project_tasks', label: '项目任务', rows: tableCount(db, 'project_tasks') },
    { table: 'project_task_files', label: '项目任务文件', rows: tableCount(db, 'project_task_files') },
    { table: 'project_knowledge', label: '项目知识库', rows: tableCount(db, 'project_knowledge') },
    { table: 'meta', label: '数据库元信息', rows: tableCount(db, 'meta') }
  ]

  return {
    path,
    exists,
    sizeBytes: stat?.size ?? 0,
    updatedAt: stat?.mtime.toISOString() ?? null,
    schemaVersion:
      tableCount(db, 'meta') >= 0
        ? Number(readOne<{ value: string }>(db, 'SELECT value FROM meta WHERE key = ?', ['schema_version'])?.value || 1)
        : 1,
    tables
  }
}
