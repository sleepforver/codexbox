import { showToast } from './toast'

export async function safeLoad(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label}失败`
    showToast(message, 'error')
  }
}

export async function safeLoadAll(tasks: Array<{ label: string; work: () => Promise<void> }>): Promise<void> {
  await Promise.all(tasks.map((task) => safeLoad(task.label, task.work)))
}
