import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { registerIpcHandlers } from './ipc/registerIpcHandlers.js'

loadEnv()

const isDev = !app.isPackaged

function createWindow(): void {
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1440, Math.max(1180, Math.round(workAreaWidth * 0.86)))
  const height = Math.min(920, Math.max(760, Math.round(workAreaHeight * 0.86)))

  const window = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    title: 'AI 开发工具箱',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
