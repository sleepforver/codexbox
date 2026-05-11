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
    const detail = error instanceof Error && error.message.trim() ? error.message : '未知错误'
    rememberIpcError(label, detail)
    throw new Error(`${label}失败：${detail}`)
  }
}

export function getRecentIpcErrors(): DiagnosticErrorEntry[] {
  return [...recentErrors]
}
