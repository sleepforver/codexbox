import { ipcMain } from 'electron'
import { handleGitAction, handleGitCommit, handleGitRun } from '../services/git.js'

export function registerGitIpc(): void {
  ipcMain.handle('git:run', (_event, request) => handleGitRun(request))
  ipcMain.handle('git:action', (_event, request) => handleGitAction(request))
  ipcMain.handle('git:commit', (_event, request) => handleGitCommit(request))
}
