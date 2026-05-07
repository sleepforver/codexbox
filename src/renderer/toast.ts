import { reactive } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export const toasts = reactive<ToastItem[]>([])

export function showToast(message: string, type: ToastItem['type'] = 'info'): void {
  const toast = { id: Date.now() + Math.random(), message, type }
  toasts.push(toast)
  window.setTimeout(() => {
    const index = toasts.findIndex((item) => item.id === toast.id)
    if (index >= 0) toasts.splice(index, 1)
  }, 2600)
}
