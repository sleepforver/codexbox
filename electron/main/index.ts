import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { registerIpcHandlers } from './ipc/registerIpcHandlers.js'

loadEnv()

const isDev = !app.isPackaged
const isE2eSmoke = process.env.CODEXBOX_E2E_SMOKE === '1'
const e2eSmokeUserData = process.env.CODEXBOX_E2E_USER_DATA

if (e2eSmokeUserData) {
  app.setPath('userData', e2eSmokeUserData)
}

function createWindow(): void {
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1440, Math.max(1180, Math.round(workAreaWidth * 0.86)))
  const height = Math.min(920, Math.max(760, Math.round(workAreaHeight * 0.86)))

  const window = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    show: !isE2eSmoke,
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

  configureE2eSmokeExit(window)
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function configureE2eSmokeExit(window: BrowserWindow): void {
  if (!isE2eSmoke) return

  const timeoutMs = Number(process.env.CODEXBOX_E2E_TIMEOUT_MS || 12000)
  const timeout = setTimeout(() => {
    app.exit(1)
  }, timeoutMs)

  window.webContents.once('did-fail-load', () => {
    clearTimeout(timeout)
    app.exit(1)
  })

  window.webContents.once('did-finish-load', () => {
    void runE2eSmokeAssertions(window)
      .then(() => {
        clearTimeout(timeout)
        setTimeout(() => app.quit(), 250)
      })
      .catch((error: unknown) => {
        clearTimeout(timeout)
        console.error(error instanceof Error ? error.message : error)
        app.exit(1)
      })
  })
}

async function runE2eSmokeAssertions(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    `(() => {
      const waitFor = (predicate, label, timeoutMs = 5000) =>
        new Promise((resolve, reject) => {
          const startedAt = Date.now()
          const tick = () => {
            try {
              if (predicate()) {
                resolve(true)
                return
              }
            } catch (error) {
              reject(error)
              return
            }
            if (Date.now() - startedAt >= timeoutMs) {
              reject(new Error('Timed out waiting for ' + label))
              return
            }
            setTimeout(tick, 50)
          }
          tick()
        })

      const assert = (condition, message) => {
        if (!condition) throw new Error(message)
      }

      return (async () => {
        const expectedRoutes = ['/projects', '/json', '/api', '/git', '/ai-explain', '/ai-generate', '/ai-history', '/settings']
        await waitFor(() => document.querySelectorAll('.nav-link').length === expectedRoutes.length, 'module navigation')

        const api = window.devtoolsApi
        assert(api, 'preload devtoolsApi missing')
        for (const key of ['json', 'api', 'git', 'ai', 'settings', 'projects', 'updates']) {
          assert(api[key], 'preload API missing: ' + key)
        }
        assert(!api.geo, 'removed Geo API should not be exposed')

        const navLinks = [...document.querySelectorAll('.nav-link')].map((item) => item.getAttribute('href') || '')
        for (const route of expectedRoutes) {
          assert(navLinks.some((href) => href.endsWith('#' + route)), 'navigation missing route: ' + route)
        }
        assert(!navLinks.some((href) => href.endsWith('#/geo')), 'removed Geo route should not be in navigation')

        for (const route of expectedRoutes) {
          window.location.hash = '#' + route
          await waitFor(() => window.location.hash.endsWith(route), 'route hash ' + route)
          await waitFor(() => document.querySelector('.tool-panel h2'), 'tool panel ' + route)
        }

        return true
      })()
    })()`,
    true
  )
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
