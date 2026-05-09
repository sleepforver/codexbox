import { showToast } from './toast'

export function getUserErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

export function showOperationError(error: unknown, fallback: string): string {
  const message = getUserErrorMessage(error, fallback)
  showToast(message, 'error')
  return message
}
