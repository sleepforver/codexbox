import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import type { AiHistoryItem, AiPromptTemplate, ApiSavedRequest } from '../../src/shared/ipc.js'
import { handleApiSend } from './services/api.js'
import {
  cancelAiStream,
  handleAiGenerateText,
  handleAiGenerateTextStream,
  handleAiTestConnection,
  readAiConfig
} from './services/ai.js'
import { handleGitAction, handleGitCommit, handleGitRun } from './services/git.js'
import { handleGeoAnalyze } from './services/geo.js'
import { handleJsonQuery, handleJsonTransform } from './services/json.js'
import {
  backupDatabase,
  cleanupDatabase,
  deleteAiHistory,
  deleteAiPromptTemplate,
  deleteApiSavedRequest,
  getAiHistory,
  getAiPromptTemplates,
  getApiSavedRequests,
  getApiToolState,
  getDatabaseInfo,
  readAppSettings,
  resetBuiltinPromptTemplates,
  restoreDatabase,
  saveAiHistory,
  saveAiPromptTemplate,
  saveApiSavedRequest,
  saveApiToolState,
  updateAppSettings
} from './services/settings.js'

loadEnv()

const isDev = !app.isPackaged

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'AI 开发工具箱',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('json:transform', (_event, request) => handleJsonTransform(request))
  ipcMain.handle('json:query', (_event, request) => handleJsonQuery(request))
  ipcMain.handle('api:send', (_event, request) => handleApiSend(request))
  ipcMain.handle('api:getState', () => getApiToolState())
  ipcMain.handle('api:saveState', (_event, state) => saveApiToolState(state))
  ipcMain.handle('api:getSavedRequests', () => getApiSavedRequests())
  ipcMain.handle('api:saveRequest', (_event, request) => saveApiSavedRequest(request))
  ipcMain.handle('api:deleteRequest', (_event, id) => deleteApiSavedRequest(id))
  ipcMain.handle('git:run', (_event, request) => handleGitRun(request))
  ipcMain.handle('git:action', (_event, request) => handleGitAction(request))
  ipcMain.handle('git:commit', (_event, request) => handleGitCommit(request))
  ipcMain.handle('geo:analyze', (_event, request) => handleGeoAnalyze(request))
  ipcMain.handle('ai:getConfig', () => readAiConfig())
  ipcMain.handle('ai:generateText', (_event, request) => handleAiGenerateText(request))
  ipcMain.handle('ai:generateTextStream', (event, request) => {
    void handleAiGenerateTextStream(request, (streamEvent) => {
      event.sender.send(`ai:stream:${request.requestId}`, streamEvent)
    })
    return { requestId: request.requestId }
  })
  ipcMain.handle('ai:cancelStream', (_event, requestId) => {
    cancelAiStream(requestId)
  })
  ipcMain.handle('ai:testConnection', () => handleAiTestConnection())
  ipcMain.handle('ai:getHistory', (_event, taskType) => getAiHistory(taskType))
  ipcMain.handle('ai:saveHistory', (_event, request) => saveAiHistory(request))
  ipcMain.handle('ai:deleteHistory', (_event, id, taskType) => deleteAiHistory(id, taskType))
  ipcMain.handle('ai:getPromptTemplates', (_event, taskType) => getAiPromptTemplates(taskType))
  ipcMain.handle('ai:savePromptTemplate', (_event, request) => saveAiPromptTemplate(request))
  ipcMain.handle('ai:deletePromptTemplate', (_event, id, taskType) => deleteAiPromptTemplate(id, taskType))
  ipcMain.handle('ai:resetBuiltinPromptTemplates', (_event, taskType) => resetBuiltinPromptTemplates(taskType))
  ipcMain.handle('settings:get', () => readAppSettings())
  ipcMain.handle('settings:update', (_event, update) => updateAppSettings(update))
  ipcMain.handle('settings:getDatabaseInfo', () => getDatabaseInfo())
  ipcMain.handle('settings:backupDatabase', () => backupDatabase())
  ipcMain.handle('settings:restoreDatabase', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return restoreDatabase(result.filePaths[0])
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

function parseImportItems<T>(path: string, expectedType: string): T[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as { type?: string; items?: T[] } | T[]
  if (Array.isArray(data)) return data
  if (data.type && data.type !== expectedType) throw new Error(`导入文件类型不匹配：${data.type}`)
  if (!Array.isArray(data.items)) throw new Error('导入文件缺少 items 数组')
  return data.items
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

async function exportAiHistory(format: 'json' | 'markdown'): Promise<{ ok: true; message: string; count: number } | null> {
  const items = await getAiHistory()
  const extension = format === 'markdown' ? 'md' : 'json'
  const path = await chooseSavePath(`ai-history.${extension}`, [
    format === 'markdown'
      ? { name: 'Markdown', extensions: ['md'] }
      : { name: 'JSON', extensions: ['json'] }
  ])
  if (!path) return null
  writeFileSync(path, format === 'markdown' ? formatAiHistoryMarkdown(items) : exportEnvelope('ai-history', items), 'utf8')
  return { ok: true, message: `AI 历史已导出：${path}`, count: items.length }
}

async function exportPromptTemplates(): Promise<{ ok: true; message: string; count: number } | null> {
  const items = await getAiPromptTemplates()
  const path = await chooseSavePath('prompt-templates.json', [{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  writeFileSync(path, exportEnvelope('prompt-templates', items), 'utf8')
  return { ok: true, message: `Prompt 模板已导出：${path}`, count: items.length }
}

async function importPromptTemplates(): Promise<{ ok: true; message: string; count: number } | null> {
  const path = await chooseOpenPath([{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  const items = parseImportItems<AiPromptTemplate>(path, 'prompt-templates')
  let count = 0
  for (const item of items) {
    if (!item.taskType || !item.name || !item.content) continue
    await saveAiPromptTemplate({
      taskType: item.taskType,
      name: item.isBuiltin ? `${item.name}（导入）` : item.name,
      content: item.content,
      variables: Array.isArray(item.variables) ? item.variables : []
    })
    count += 1
  }
  return { ok: true, message: `Prompt 模板已导入：${count} 条`, count }
}

async function exportApiRequests(): Promise<{ ok: true; message: string; count: number } | null> {
  const items = await getApiSavedRequests()
  const path = await chooseSavePath('api-requests.json', [{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  writeFileSync(path, exportEnvelope('api-requests', items), 'utf8')
  return { ok: true, message: `API 请求集合已导出：${path}`, count: items.length }
}

async function importApiRequests(): Promise<{ ok: true; message: string; count: number } | null> {
  const path = await chooseOpenPath([{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  const items = parseImportItems<ApiSavedRequest>(path, 'api-requests')
  let count = 0
  for (const item of items) {
    if (!item.name || !item.method || !item.url) continue
    await saveApiSavedRequest({
      name: item.name,
      method: item.method,
      url: item.url,
      headers: Array.isArray(item.headers) ? item.headers : [],
      body: item.body ?? ''
    })
    count += 1
  }
  return { ok: true, message: `API 请求集合已导入：${count} 条`, count }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
