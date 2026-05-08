import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DatabaseInfo, DatabaseMaintenanceCleanupRequest, DatabaseMaintenanceResponse } from '../../../../src/shared/ipc.js'
import { backupDir, dbPath } from '../paths.js'
import { closeDatabase, getDatabase, persist, readDatabaseFileInfo } from '../connection.js'
import { run, transaction } from '../runtime.js'

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

  await closeDatabase()
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
