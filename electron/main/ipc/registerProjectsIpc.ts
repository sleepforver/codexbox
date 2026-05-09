import { ipcMain } from 'electron'
import {
  deleteWorkspaceProject,
  listWorkspaceProjects,
  markWorkspaceProjectOpened,
  saveWorkspaceProject
} from '../services/settings.js'
import { withIpcError } from './ipcError.js'

export function registerProjectsIpc(): void {
  ipcMain.handle('projects:list', () => listWorkspaceProjects())
  ipcMain.handle('projects:save', (_event, request) =>
    withIpcError('保存项目工作区', () => saveWorkspaceProject(request))
  )
  ipcMain.handle('projects:delete', (_event, id) => withIpcError('删除项目工作区', () => deleteWorkspaceProject(id)))
  ipcMain.handle('projects:markOpened', (_event, id) =>
    withIpcError('标记最近使用项目', () => markWorkspaceProjectOpened(id))
  )
}
