import { app } from 'electron'
import { join, resolve } from 'node:path'

export function projectDataDir(): string {
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'data')
  }

  return resolve(process.cwd(), 'data')
}

export function dbPath(): string {
  return join(projectDataDir(), 'devtools-codex.db')
}

export function backupDir(): string {
  return join(projectDataDir(), 'backups')
}

export function oldUserDataDbPath(): string {
  return join(app.getPath('userData'), 'devtools-codex.db')
}

export function legacySettingsPath(): string {
  return join(app.getPath('userData'), 'devtools-codex-settings.json')
}
