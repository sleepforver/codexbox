export { getDatabase, saveDatabase } from '../db/connection.js'
export { getSetting, setSetting } from '../db/repositories/settingsRepository.js'
export {
  getApiToolStateFromDb,
  saveApiToolStateToDb,
  getApiSavedRequestsFromDb,
  saveApiRequestToDb,
  deleteApiRequestFromDb
} from '../db/repositories/apiRepository.js'
export {
  getAiHistoryFromDb,
  saveAiHistoryToDb,
  importAiHistoryToDb,
  deleteAiHistoryFromDb,
  clearAiHistoryFromDb
} from '../db/repositories/aiHistoryRepository.js'
export {
  getAiPromptTemplatesFromDb,
  saveAiPromptTemplateToDb,
  deleteAiPromptTemplateFromDb,
  resetBuiltinPromptTemplatesInDb
} from '../db/repositories/promptTemplateRepository.js'
export {
  getDatabaseInfoFromDb,
  backupDatabaseToFile,
  restoreDatabaseFromFile,
  cleanupDatabaseInDb
} from '../db/repositories/databaseMaintenanceRepository.js'
export {
  listWorkspaceProjectsFromDb,
  saveWorkspaceProjectToDb,
  deleteWorkspaceProjectFromDb,
  markWorkspaceProjectOpenedInDb
} from '../db/repositories/projectRepository.js'
