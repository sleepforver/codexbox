import { dialog, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  clearGeoAnalysisHistory,
  deleteGeoAnalysisHistory,
  getGeoAnalysisHistory,
  handleGeoAnalyze
} from '../services/geo.js'
import type { DataTransferResponse, GeoReportExportRequest, GeoSourceFileResponse } from '../../../src/shared/ipc.js'
import { withIpcError } from './ipcError.js'

export function registerGeoIpc(): void {
  ipcMain.handle('geo:analyze', (_event, request) => handleGeoAnalyze(request))
  ipcMain.handle('geo:loadSourceFile', () => loadGeoSourceFile())
  ipcMain.handle('geo:exportReport', (_event, request, format) => exportGeoReport(request, format))
  ipcMain.handle('geo:getHistory', (_event, projectId) => getGeoAnalysisHistory(projectId))
  ipcMain.handle('geo:deleteHistory', (_event, id) =>
    withIpcError('删除地理体检历史', () => deleteGeoAnalysisHistory(id))
  )
  ipcMain.handle('geo:clearHistory', (_event, projectId) =>
    withIpcError('清空地理体检历史', () => clearGeoAnalysisHistory(projectId))
  )
}

async function loadGeoSourceFile(): Promise<GeoSourceFileResponse | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'GeoJSON', extensions: ['geojson', 'json'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  })
  if (result.canceled || !result.filePaths[0]) return null
  return {
    path: result.filePaths[0],
    source: readFileSync(result.filePaths[0], 'utf8')
  }
}

async function exportGeoReport(
  request: GeoReportExportRequest,
  format: 'json' | 'markdown'
): Promise<DataTransferResponse | null> {
  const extension = format === 'markdown' ? 'md' : 'json'
  const result = await dialog.showSaveDialog({
    defaultPath: `${request.title || 'geo-report'}.${extension}`,
    filters: [format === 'markdown' ? { name: 'Markdown', extensions: ['md'] } : { name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null

  const content =
    format === 'markdown'
      ? formatGeoReportMarkdown(request)
      : JSON.stringify({ version: 1, type: 'geo-report', exportedAt: new Date().toISOString(), ...request }, null, 2)
  writeFileSync(result.filePath, content, 'utf8')
  return { ok: true, message: `地理体检报告已导出：${result.filePath}`, count: request.result.issues.length }
}

function formatGeoReportMarkdown(request: GeoReportExportRequest): string {
  const lines = [`# ${request.title || '地理体检报告'}`, '', `导出时间：${new Date().toLocaleString()}`, '']
  if (request.projectName) lines.push(`项目：${request.projectName}`, '')
  lines.push(`- 要素数：${request.result.featureCount}`)
  lines.push(`- 问题数：${request.result.issues.length}`)
  lines.push(`- 几何类型数：${request.result.geometryTypes.length}`)
  lines.push('', '## 几何类型统计', '')
  request.result.geometryTypes.forEach((item) => lines.push(`- ${item.type}: ${item.count}`))
  if (request.result.bounds) {
    lines.push('', '## 坐标范围', '', '```json', JSON.stringify(request.result.bounds, null, 2), '```')
  }
  lines.push('', '## 校验问题', '')
  if (!request.result.issues.length) {
    lines.push('未发现问题。')
  } else {
    request.result.issues.forEach((issue) => lines.push(`- ${issue.level} ${issue.path}: ${issue.message}`))
  }
  return lines.join('\n')
}
