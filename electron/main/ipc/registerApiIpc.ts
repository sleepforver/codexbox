import { ipcMain } from 'electron'
import { handleApiSend } from '../services/api.js'
import { deleteApiSavedRequest, getApiSavedRequests, getApiToolState, saveApiSavedRequest, saveApiToolState } from '../services/settings.js'

export function registerApiIpc(): void {
  ipcMain.handle('api:send', (_event, request) => handleApiSend(request))
  ipcMain.handle('api:getState', () => getApiToolState())
  ipcMain.handle('api:saveState', (_event, state) => saveApiToolState(state))
  ipcMain.handle('api:getSavedRequests', (_event, projectId) => getApiSavedRequests(projectId))
  ipcMain.handle('api:saveRequest', (_event, request) => saveApiSavedRequest(request))
  ipcMain.handle('api:deleteRequest', (_event, id) => deleteApiSavedRequest(id))
}
