import { ipcMain } from 'electron'
import {
  deleteWorkspaceProject,
  listWorkspaceProjects,
  markWorkspaceProjectOpened,
  saveWorkspaceProject
} from '../services/settings.js'

export function registerProjectsIpc(): void {
  ipcMain.handle('projects:list', () => listWorkspaceProjects())
  ipcMain.handle('projects:save', (_event, request) => saveWorkspaceProject(request))
  ipcMain.handle('projects:delete', (_event, id) => deleteWorkspaceProject(id))
  ipcMain.handle('projects:markOpened', (_event, id) => markWorkspaceProjectOpened(id))
}
