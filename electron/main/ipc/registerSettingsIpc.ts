import { dialog, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import type { AiHistoryItem, AiPromptTemplate, ApiSavedRequest, DataTransferResponse } from '../../../src/shared/ipc.js'
import {
  backupDatabase,
  cleanupDatabase,
  getAiHistory,
  getAiPromptTemplates,
  getApiSavedRequests,
  getDatabaseInfo,
  readAppSettings,
  restoreDatabase,
  saveAiPromptTemplate,
  saveApiSavedRequest,
  updateAppSettings
} from '../services/settings.js'
import {
  aiPromptTemplateSchema,
  apiSavedRequestInputSchema,
  formatValidationError,
  importEnvelopeSchema
} from '../validation/schemas.js'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => readAppSettings())
  ipcMain.handle('settings:update', (_event, update) => updateAppSettings(update))
  ipcMain.handle('settings:getDatabaseInfo', () => getDatabaseInfo())
  ipcMain.handle('settings:backupDatabase', () => backupDatabase())
  ipcMain.handle('settings:restoreDatabase', async () => {
    const path = await chooseOpenPath([{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }])
    return path ? restoreDatabase(path) : null
  })
  ipcMain.handle('settings:cleanupDatabase', (_event, request) => cleanupDatabase(request))
  ipcMain.handle('settings:exportAiHistory', (_event, format) => exportAiHistory(format))
  ipcMain.handle('settings:exportPromptTemplates', () => exportPromptTemplates())
  ipcMain.handle('settings:importPromptTemplates', () => importPromptTemplates())
  ipcMain.handle('settings:exportApiRequests', () => exportApiRequests())
  ipcMain.handle('settings:importApiRequests', () => importApiRequests())
  ipcMain.handle('settings:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
}

async function chooseSavePath(defaultPath: string, filters: Electron.FileFilter[]): Promise<string | null> {
  const result = await dialog.showSaveDialog({ defaultPath, filters })
  return result.canceled || !result.filePath ? null : result.filePath
}

async function chooseOpenPath(filters: Electron.FileFilter[]): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
}

function exportEnvelope<T>(type: string, items: T[]): string {
  return JSON.stringify({ version: 1, type, exportedAt: new Date().toISOString(), items }, null, 2)
}

function parseImportItems(path: string, expectedType: string): unknown[] {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (Array.isArray(data)) return data

    const envelope = importEnvelopeSchema.parse(data)
    if (envelope.type && envelope.type !== expectedType) {
      throw new Error(`导入文件类型不匹配：${envelope.type}`)
    }

    return envelope.items
  } catch (error) {
    throw new Error(`导入文件格式无效：${formatValidationError(error)}`)
  }
}

function formatAiHistoryMarkdown(items: AiHistoryItem[]): string {
  const lines = ['# AI 历史记录', '', `导出时间：${new Date().toLocaleString()}`, '']
  items.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.title}`, '')
    lines.push(`- 任务类型：${item.taskType}`)
    lines.push(`- 模型：${item.model}`)
    lines.push(`- 时间：${new Date(item.createdAt).toLocaleString()}`)
    lines.push('', '### Prompt', '', '```text', item.prompt, '```', '', '### 输出', '', item.output, '')
  })
  return lines.join('\n')
}

async function exportAiHistory(format: 'json' | 'markdown'): Promise<DataTransferResponse | null> {
  const items = await getAiHistory()
  const extension = format === 'markdown' ? 'md' : 'json'
  const path = await chooseSavePath(`ai-history.${extension}`, [
    format === 'markdown' ? { name: 'Markdown', extensions: ['md'] } : { name: 'JSON', extensions: ['json'] }
  ])
  if (!path) return null
  writeFileSync(path, format === 'markdown' ? formatAiHistoryMarkdown(items) : exportEnvelope('ai-history', items), 'utf8')
  return { ok: true, message: `AI 历史已导出：${path}`, count: items.length }
}

async function exportPromptTemplates(): Promise<DataTransferResponse | null> {
  const items = await getAiPromptTemplates()
  const path = await chooseSavePath('prompt-templates.json', [{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  writeFileSync(path, exportEnvelope('prompt-templates', items), 'utf8')
  return { ok: true, message: `Prompt 模板已导出：${path}`, count: items.length }
}

async function importPromptTemplates(): Promise<DataTransferResponse | null> {
  const path = await chooseOpenPath([{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  const items = parseImportItems(path, 'prompt-templates').map((item) => aiPromptTemplateSchema.parse(item))

  for (const item of items) {
    await saveAiPromptTemplate({
      taskType: item.taskType,
      name: item.isBuiltin ? `${item.name}（导入）` : item.name,
      content: item.content,
      variables: item.variables
    })
  }

  return { ok: true, message: `Prompt 模板已导入：${items.length} 条`, count: items.length }
}

async function exportApiRequests(): Promise<DataTransferResponse | null> {
  const items = await getApiSavedRequests()
  const path = await chooseSavePath('api-requests.json', [{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  writeFileSync(path, exportEnvelope('api-requests', items), 'utf8')
  return { ok: true, message: `API 请求集合已导出：${path}`, count: items.length }
}

async function importApiRequests(): Promise<DataTransferResponse | null> {
  const path = await chooseOpenPath([{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  const items = parseImportItems(path, 'api-requests').map((item) => apiSavedRequestInputSchema.parse(item))

  for (const item of items) {
    await saveApiSavedRequest({
      name: item.name,
      method: item.method,
      url: item.url,
      headers: item.headers,
      body: item.body
    })
  }

  return { ok: true, message: `API 请求集合已导入：${items.length} 条`, count: items.length }
}
