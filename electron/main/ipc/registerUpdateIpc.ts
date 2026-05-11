import { ipcMain } from 'electron'
import { checkForUpdate, getUpdateInfo, openManualDownloadPage } from '../services/updateInfo.js'
import { withIpcError } from './ipcError.js'

export function registerUpdateIpc(): void {
  ipcMain.handle('updates:getInfo', () => getUpdateInfo())
  ipcMain.handle('updates:check', () => withIpcError('检查更新', () => checkForUpdate()))
  ipcMain.handle('updates:openDownloadPage', () =>
    withIpcError('打开手动下载页', async () => {
      await openManualDownloadPage()
      return { ok: true }
    })
  )
}
