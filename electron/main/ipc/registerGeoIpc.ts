import { ipcMain } from 'electron'
import {
  clearGeoAnalysisHistory,
  deleteGeoAnalysisHistory,
  getGeoAnalysisHistory,
  handleGeoAnalyze
} from '../services/geo.js'

export function registerGeoIpc(): void {
  ipcMain.handle('geo:analyze', (_event, request) => handleGeoAnalyze(request))
  ipcMain.handle('geo:getHistory', (_event, projectId) => getGeoAnalysisHistory(projectId))
  ipcMain.handle('geo:deleteHistory', (_event, id) => deleteGeoAnalysisHistory(id))
  ipcMain.handle('geo:clearHistory', (_event, projectId) => clearGeoAnalysisHistory(projectId))
}
