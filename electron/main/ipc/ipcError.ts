import type { DiagnosticErrorEntry } from '../../../src/shared/ipc.js'

const recentErrors: DiagnosticErrorEntry[] = []
const maxRecentErrors = 20

function rememberIpcError(label: string, message: string): void {
  recentErrors.unshift({ label, message, at: new Date().toISOString() })
  recentErrors.splice(maxRecentErrors)
}

export async function withIpcError<T>(label: string, action: () => Promise<T> | T): Promise<T> {
  try {
    return await action()
  } catch (error) {
    const detail = formatIpcErrorDetail(error)
    rememberIpcError(label, detail)
    throw new Error(`${label}失败：${detail}`)
  }
}

function formatIpcErrorDetail(error: unknown): string {
  const message = error instanceof Error && error.message.trim() ? error.message : String(error || '未知错误')
  const missingColumn = message.match(/no such column:\s*([\w.]+)/i)
  if (missingColumn) {
    return `数据库结构缺少字段 ${missingColumn[1]}，可能是旧版本数据库尚未完成迁移。请重启应用后重试；如果仍失败，请先备份数据库并导出诊断信息。`
  }

  const missingTable = message.match(/no such table:\s*([\w.]+)/i)
  if (missingTable) {
    return `数据库结构缺少数据表 ${missingTable[1]}，可能是旧版本数据库尚未完成迁移。请重启应用后重试；如果仍失败，请先备份数据库并导出诊断信息。`
  }

  if (/database disk image is malformed/i.test(message)) {
    return '数据库文件可能已损坏，请先备份当前数据文件，再尝试从最近备份恢复。'
  }

  return message
}

export function getRecentIpcErrors(): DiagnosticErrorEntry[] {
  return [...recentErrors]
}
