import { dialog, ipcMain } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import {
  cancelAiStream,
  handleAiGenerateText,
  handleAiGenerateTextStream,
  handleAiTestConnection,
  readAiConfig
} from '../services/ai.js'
import {
  clearAiHistory,
  deleteAiHistory,
  deleteAiPromptTemplate,
  getAiHistory,
  getAiPromptTemplates,
  getProjectPromptDefault,
  resetBuiltinPromptTemplates,
  saveAiHistory,
  saveAiPromptTemplate,
  setProjectPromptDefault,
  toggleAiHistoryFavorite
} from '../services/settings.js'
import type { AiContextFileResponse } from '../../../src/shared/ipc.js'
import { withIpcError } from './ipcError.js'

function loadAiContextFile(): AiContextFileResponse | null {
  const result = dialog.showOpenDialogSync({
    title: '导入上下文文件',
    properties: ['openFile'],
    filters: [
      {
        name: '文本文件',
        extensions: [
          'txt',
          'md',
          'json',
          'ts',
          'tsx',
          'js',
          'jsx',
          'vue',
          'java',
          'py',
          'go',
          'rs',
          'sql',
          'yaml',
          'yml'
        ]
      },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  const path = result?.[0]
  if (!path) return null
  if (statSync(path).size > 1024 * 1024) throw new Error('上下文文件不能超过 1MB')
  return { path, content: readFileSync(path, 'utf8') }
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:getConfig', () => readAiConfig())
  ipcMain.handle('ai:generateText', (_event, request) => handleAiGenerateText(request))
  ipcMain.handle('ai:generateTextStream', (event, request) => {
    void handleAiGenerateTextStream(request, (streamEvent) => {
      event.sender.send(`ai:stream:${request.requestId}`, streamEvent)
    })
    return { requestId: request.requestId }
  })
  ipcMain.handle('ai:cancelStream', (_event, requestId) => {
    cancelAiStream(requestId)
  })
  ipcMain.handle('ai:testConnection', () => handleAiTestConnection())
  ipcMain.handle('ai:loadContextFile', () => loadAiContextFile())
  ipcMain.handle('ai:getHistory', (_event, taskType, projectId) => getAiHistory(taskType, projectId))
  ipcMain.handle('ai:saveHistory', (_event, request) => withIpcError('保存 AI 历史', () => saveAiHistory(request)))
  ipcMain.handle('ai:deleteHistory', (_event, id, taskType) =>
    withIpcError('删除 AI 历史', () => deleteAiHistory(id, taskType))
  )
  ipcMain.handle('ai:clearHistory', (_event, taskType, projectId) =>
    withIpcError('清空 AI 历史', () => clearAiHistory(taskType, projectId))
  )
  ipcMain.handle('ai:toggleHistoryFavorite', (_event, id, favorite) =>
    withIpcError('更新 AI 历史收藏状态', () => toggleAiHistoryFavorite(id, favorite))
  )
  ipcMain.handle('ai:getPromptTemplates', (_event, taskType) => getAiPromptTemplates(taskType))
  ipcMain.handle('ai:savePromptTemplate', (_event, request) =>
    withIpcError('保存 Prompt 模板', () => saveAiPromptTemplate(request))
  )
  ipcMain.handle('ai:deletePromptTemplate', (_event, id, taskType) =>
    withIpcError('删除 Prompt 模板', () => deleteAiPromptTemplate(id, taskType))
  )
  ipcMain.handle('ai:resetBuiltinPromptTemplates', (_event, taskType) =>
    withIpcError('重置内置 Prompt 模板', () => resetBuiltinPromptTemplates(taskType))
  )
  ipcMain.handle('ai:getProjectPromptDefault', (_event, projectId, taskType) =>
    getProjectPromptDefault(projectId, taskType)
  )
  ipcMain.handle('ai:setProjectPromptDefault', (_event, defaultValue) =>
    withIpcError('保存项目默认 Prompt 模板', () =>
      setProjectPromptDefault(defaultValue.projectId, defaultValue.taskType, defaultValue.templateId)
    )
  )
}
