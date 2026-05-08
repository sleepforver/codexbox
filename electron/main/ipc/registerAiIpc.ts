import { ipcMain } from 'electron'
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
  resetBuiltinPromptTemplates,
  saveAiHistory,
  saveAiPromptTemplate
} from '../services/settings.js'

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
  ipcMain.handle('ai:getHistory', (_event, taskType) => getAiHistory(taskType))
  ipcMain.handle('ai:saveHistory', (_event, request) => saveAiHistory(request))
  ipcMain.handle('ai:deleteHistory', (_event, id, taskType) => deleteAiHistory(id, taskType))
  ipcMain.handle('ai:clearHistory', (_event, taskType) => clearAiHistory(taskType))
  ipcMain.handle('ai:getPromptTemplates', (_event, taskType) => getAiPromptTemplates(taskType))
  ipcMain.handle('ai:savePromptTemplate', (_event, request) => saveAiPromptTemplate(request))
  ipcMain.handle('ai:deletePromptTemplate', (_event, id, taskType) => deleteAiPromptTemplate(id, taskType))
  ipcMain.handle('ai:resetBuiltinPromptTemplates', (_event, taskType) => resetBuiltinPromptTemplates(taskType))
}
