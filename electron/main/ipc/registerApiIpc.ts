import { dialog, ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { handleApiSend } from '../services/api.js'
import { discoverApiRequests, importDiscoveredApiRequests, parseOpenApiDocument } from '../services/apiDiscovery.js'
import {
  deleteApiSavedRequest,
  getApiSavedRequests,
  getApiToolState,
  saveApiSavedRequest,
  saveApiToolState
} from '../services/settings.js'
import { withIpcError } from './ipcError.js'

export function registerApiIpc(): void {
  ipcMain.handle('api:send', (_event, request) => handleApiSend(request))
  ipcMain.handle('api:getState', (_event, projectId) => getApiToolState(projectId))
  ipcMain.handle('api:saveState', (_event, state, projectId) =>
    withIpcError('保存 API 工具状态', () => saveApiToolState(state, projectId))
  )
  ipcMain.handle('api:getSavedRequests', (_event, projectId) => getApiSavedRequests(projectId))
  ipcMain.handle('api:saveRequest', (_event, request) =>
    withIpcError('保存 API 请求', () => saveApiSavedRequest(request))
  )
  ipcMain.handle('api:deleteRequest', (_event, id) => withIpcError('删除 API 请求', () => deleteApiSavedRequest(id)))
  ipcMain.handle('api:discoverRequests', (_event, request) => discoverApiRequests(request))
  ipcMain.handle('api:loadOpenApiRequests', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 OpenAPI / Swagger JSON',
      properties: ['openFile'],
      filters: [
        { name: 'OpenAPI / Swagger', extensions: ['json'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const source = readFileSync(result.filePaths[0], 'utf8')
    return parseOpenApiDocument(source, result.filePaths[0])
  })
  ipcMain.handle('api:importDiscoveredRequests', (_event, projectId, requests, mode) =>
    withIpcError('导入扫描接口', () => importDiscoveredApiRequests(projectId, requests, mode))
  )
}
