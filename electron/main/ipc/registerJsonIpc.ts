import { ipcMain } from 'electron'
import { handleJsonQuery, handleJsonTransform } from '../services/json.js'

export function registerJsonIpc(): void {
  ipcMain.handle('json:transform', (_event, request) => handleJsonTransform(request))
  ipcMain.handle('json:query', (_event, request) => handleJsonQuery(request))
}
