import { ipcMain } from 'electron'
import { handleGeoAnalyze } from '../services/geo.js'

export function registerGeoIpc(): void {
  ipcMain.handle('geo:analyze', (_event, request) => handleGeoAnalyze(request))
}
