export async function withIpcError<T>(label: string, action: () => Promise<T> | T): Promise<T> {
  try {
    return await action()
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : '未知错误'
    throw new Error(`${label}失败：${detail}`)
  }
}
