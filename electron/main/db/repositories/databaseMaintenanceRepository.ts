import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  DatabaseInfo,
  DatabaseMaintenanceCleanupRequest,
  DatabaseMaintenanceResponse
} from '../../../../src/shared/ipc.js'
import { backupDir, dbPath } from '../paths.js'
import { closeDatabase, getDatabase, persist, readDatabaseFileInfo } from '../connection.js'
import { run, transaction } from '../runtime.js'

function formatDatabaseFileError(error: unknown, action: string, target: string): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'EACCES' || code === 'EPERM') {
    return `${action}失败：${target} 无法写入，请检查文件权限、安装目录权限或安全软件拦截。原始错误：${message}`
  }
  if (code === 'EBUSY') {
    return `${action}失败：${target} 正被其他程序占用，请关闭数据库查看器、编辑器或同步工具后重试。原始错误：${message}`
  }
  if (code === 'ENOENT') {
    return `${action}失败：${target} 不存在或所在目录已被移动。原始错误：${message}`
  }
  return `${action}失败：${target} 文件操作异常。原始错误：${message}`
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
  try {
    copyFileSync(dbPath(), target)
  } catch (error) {
    throw new Error(formatDatabaseFileError(error, '备份数据库', target))
  }

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
  try {
    copyFileSync(sourcePath, dbPath())
  } catch (error) {
    throw new Error(formatDatabaseFileError(error, '恢复数据库', dbPath()))
  }
  const db = await getDatabase()

  return {
    ok: true,
    message: `数据库已从备份恢复：${sourcePath}`,
    info: readDatabaseFileInfo(db)
  }
}

export async function cleanupDatabaseInDb(
  request: DatabaseMaintenanceCleanupRequest
): Promise<DatabaseMaintenanceResponse> {
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
