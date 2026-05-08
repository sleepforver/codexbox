import { getDatabase, persist } from '../connection.js'
import { getSettingRaw, setSettingRaw } from '../migrations.js'

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDatabase()
  const value = getSettingRaw(db, key)

  if (value === null) return fallback

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDatabase()
  setSettingRaw(db, key, value)
  persist(db)
}
