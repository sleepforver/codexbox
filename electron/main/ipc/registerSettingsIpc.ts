import { dialog, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import type {
  AiHistoryItem,
  AiPromptTemplate,
  ApiSavedRequest,
  DataTransferResponse,
  GeoAnalyzeHistoryItem,
  ProjectDataPackage
} from '../../../src/shared/ipc.js'
import {
  backupDatabase,
  cleanupDatabase,
  getAiHistory,
  getAiPromptTemplates,
  getApiSavedRequests,
  getDatabaseInfo,
  importAiHistory,
  listWorkspaceProjects,
  readAppSettings,
  restoreDatabase,
  saveAiPromptTemplate,
  saveApiSavedRequest,
  saveWorkspaceProject,
  updateAppSettings
} from '../services/settings.js'
import { getGeoAnalysisHistory, importGeoAnalysisHistory } from '../services/geo.js'
import {
  aiPromptTemplateSchema,
  apiSavedRequestInputSchema,
  formatValidationError,
  importEnvelopeSchema,
  projectPackageSchema,
  workspaceProjectSchema
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
  ipcMain.handle('settings:exportWorkspaceProjects', () => exportWorkspaceProjects())
  ipcMain.handle('settings:importWorkspaceProjects', () => importWorkspaceProjects())
  ipcMain.handle('settings:exportProjectPackage', (_event, projectId) => exportProjectPackage(projectId))
  ipcMain.handle('settings:importProjectPackage', () => importProjectPackage())
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

function assertImportItemsNotEmpty(items: unknown[], label: string): void {
  if (!items.length) throw new Error(`${label}导入文件没有可导入的数据`)
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
  assertImportItemsNotEmpty(items, 'Prompt 模板')

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

async function exportWorkspaceProjects(): Promise<DataTransferResponse | null> {
  const items = await listWorkspaceProjects()
  const path = await chooseSavePath('workspace-projects.json', [{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  writeFileSync(path, exportEnvelope('workspace-projects', items), 'utf8')
  return { ok: true, message: `项目工作区已导出：${path}`, count: items.length }
}

async function importWorkspaceProjects(): Promise<DataTransferResponse | null> {
  const path = await chooseOpenPath([{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  const items = parseImportItems(path, 'workspace-projects').map((item) => workspaceProjectSchema.parse(item))
  assertImportItemsNotEmpty(items, '项目工作区')

  for (const item of items) {
    await saveWorkspaceProject({
      id: item.id,
      name: item.name,
      path: item.path,
      description: item.description,
      tags: item.tags
    })
  }

  return { ok: true, message: `项目工作区已导入：${items.length} 个`, count: items.length }
}

async function importApiRequests(): Promise<DataTransferResponse | null> {
  const path = await chooseOpenPath([{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  const items = parseImportItems(path, 'api-requests').map((item) => apiSavedRequestInputSchema.parse(item))
  assertImportItemsNotEmpty(items, 'API 请求集合')

  for (const item of items) {
    await saveApiSavedRequest({
      name: item.name,
      method: item.method,
      url: item.url,
      headers: item.headers,
      body: item.body,
      projectId: item.projectId
    })
  }

  return { ok: true, message: `API 请求集合已导入：${items.length} 条`, count: items.length }
}

async function exportProjectPackage(projectId: string): Promise<DataTransferResponse | null> {
  const project = (await listWorkspaceProjects()).find((item) => item.id === projectId)
  if (!project) throw new Error('项目工作区不存在')

  const [aiHistory, apiRequests, geoAnalysisHistory] = await Promise.all([
    getAiHistory(undefined, projectId),
    getApiSavedRequests(projectId),
    getGeoAnalysisHistory(projectId)
  ])
  const packageData: ProjectDataPackage = {
    project,
    aiHistory,
    apiRequests,
    geoAnalysisHistory,
    exportedAt: new Date().toISOString()
  }
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 48) || 'project'
  const path = await chooseSavePath(`${safeName}-project-package.json`, [{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null

  writeFileSync(path, exportEnvelope('project-package', [packageData]), 'utf8')
  return {
    ok: true,
    message: `项目数据包已导出：${path}`,
    count: aiHistory.length + apiRequests.length + geoAnalysisHistory.length
  }
}

async function importProjectPackage(): Promise<DataTransferResponse | null> {
  const path = await chooseOpenPath([{ name: 'JSON', extensions: ['json'] }])
  if (!path) return null
  const packages = parseImportItems(path, 'project-package').map((item) => projectPackageSchema.parse(item))
  assertImportItemsNotEmpty(packages, '项目数据包')
  let importedCount = 0

  for (const packageData of packages) {
    const project = packageData.project
    await saveWorkspaceProject({
      id: project.id,
      name: project.name,
      path: project.path,
      description: project.description,
      tags: project.tags
    })
    importedCount += 1

    for (const item of packageData.aiHistory) {
      await importAiHistory({ ...item, projectId: project.id }, project.id)
      importedCount += 1
    }

    for (const item of packageData.apiRequests) {
      await saveApiSavedRequest({
        id: item.id,
        name: item.name,
        method: item.method,
        url: item.url,
        headers: item.headers,
        body: item.body,
        projectId: project.id
      })
      importedCount += 1
    }

    for (const item of packageData.geoAnalysisHistory as GeoAnalyzeHistoryItem[]) {
      await importGeoAnalysisHistory({ ...item, projectId: project.id }, project.id)
      importedCount += 1
    }
  }

  return { ok: true, message: `项目数据包已导入：${packages.length} 个项目`, count: importedCount }
}
