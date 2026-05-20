import { ipcMain } from 'electron'
import {
  deleteProjectTask,
  deleteProjectTaskFile,
  deleteAgentWorkflowRun,
  deleteProjectAgent,
  deleteProjectKnowledge,
  createAgentWorkflowPlan,
  deleteWorkspaceProject,
  getProjectDashboard,
  listAgentWorkflowRuns,
  listProjectAgents,
  listProjectKnowledge,
  listProjectTaskFiles,
  listProjectTasks,
  listWorkspaceProjects,
  markWorkspaceProjectOpened,
  saveProjectTask,
  saveProjectTaskFile,
  saveAgentWorkflowRun,
  saveProjectAgent,
  saveProjectKnowledge,
  searchProjectKnowledge,
  saveWorkspaceProject,
  toggleProjectKnowledgeFavorite
} from '../services/settings.js'
import { scanProjectProfile } from '../services/projectProfileScanner.js'
import { chooseTaskFile } from '../services/projectTaskFileImporter.js'
import { withIpcError } from './ipcError.js'

export function registerProjectsIpc(): void {
  ipcMain.handle('projects:list', () => withIpcError('读取项目工作区', () => listWorkspaceProjects()))
  ipcMain.handle('projects:save', (_event, request) =>
    withIpcError('保存项目工作区', () => saveWorkspaceProject(request))
  )
  ipcMain.handle('projects:scanProfile', (_event, projectPath) =>
    withIpcError('扫描项目资料', () => scanProjectProfile(projectPath))
  )
  ipcMain.handle('projects:delete', (_event, id) => withIpcError('删除项目工作区', () => deleteWorkspaceProject(id)))
  ipcMain.handle('projects:markOpened', (_event, id) =>
    withIpcError('标记最近使用项目', () => markWorkspaceProjectOpened(id))
  )
  ipcMain.handle('projects:getDashboard', (_event, projectId) =>
    withIpcError('读取项目仪表盘', () => getProjectDashboard(projectId))
  )
  ipcMain.handle('projects:listTasks', (_event, filters) =>
    withIpcError('读取项目任务', () => listProjectTasks(filters))
  )
  ipcMain.handle('projects:saveTask', (_event, request) => withIpcError('保存项目任务', () => saveProjectTask(request)))
  ipcMain.handle('projects:deleteTask', (_event, id, projectId) =>
    withIpcError('删除项目任务', () => deleteProjectTask(id, projectId))
  )
  ipcMain.handle('projects:listTaskFiles', (_event, taskId) =>
    withIpcError('读取任务文件', () => listProjectTaskFiles(taskId))
  )
  ipcMain.handle('projects:attachTaskFile', (_event, projectId, taskId) =>
    withIpcError('上传任务文件', async () => {
      const file = chooseTaskFile()
      return file ? saveProjectTaskFile({ projectId, taskId, ...file }) : listProjectTaskFiles(taskId)
    })
  )
  ipcMain.handle('projects:deleteTaskFile', (_event, id, taskId) =>
    withIpcError('删除任务文件', () => deleteProjectTaskFile(id, taskId))
  )
  ipcMain.handle('projects:listAgents', (_event, projectId) =>
    withIpcError('读取项目 Agent', () => listProjectAgents(projectId))
  )
  ipcMain.handle('projects:saveAgent', (_event, request) =>
    withIpcError('保存项目 Agent', () => saveProjectAgent(request))
  )
  ipcMain.handle('projects:deleteAgent', (_event, id, projectId) =>
    withIpcError('删除项目 Agent', () => deleteProjectAgent(id, projectId))
  )
  ipcMain.handle('projects:listAgentRuns', (_event, projectId, taskId) =>
    withIpcError('读取 Agent 工作流', () => listAgentWorkflowRuns(projectId, taskId))
  )
  ipcMain.handle('projects:createAgentWorkflowPlan', (_event, request) =>
    withIpcError('创建 Agent 工作流', () => createAgentWorkflowPlan(request))
  )
  ipcMain.handle('projects:saveAgentRun', (_event, request) =>
    withIpcError('保存 Agent 工作流', () => saveAgentWorkflowRun(request))
  )
  ipcMain.handle('projects:deleteAgentRun', (_event, id, projectId) =>
    withIpcError('删除 Agent 工作流', () => deleteAgentWorkflowRun(id, projectId))
  )
  ipcMain.handle('projects:listKnowledge', (_event, filters) =>
    withIpcError('读取项目知识库', () => listProjectKnowledge(filters))
  )
  ipcMain.handle('projects:search', (_event, filters) =>
    withIpcError('搜索项目知识', () => searchProjectKnowledge(filters))
  )
  ipcMain.handle('projects:saveKnowledge', (_event, request) =>
    withIpcError('保存项目知识条目', () => saveProjectKnowledge(request))
  )
  ipcMain.handle('projects:deleteKnowledge', (_event, id, projectId) =>
    withIpcError('删除项目知识条目', () => deleteProjectKnowledge(id, projectId))
  )
  ipcMain.handle('projects:toggleKnowledgeFavorite', (_event, id, projectId, favorite) =>
    withIpcError('更新项目知识收藏状态', () => toggleProjectKnowledgeFavorite(id, projectId, favorite))
  )
}
