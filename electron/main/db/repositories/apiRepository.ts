import { randomUUID } from 'node:crypto'
import type { Database } from 'sql.js'
import type { ApiHistoryItem, ApiSavedRequest, ApiToolState, EnvPair } from '../../../../src/shared/ipc.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, readOne, run, transaction } from '../runtime.js'
import { apiSavedRequestInputSchema, apiToolStateSchema } from '../../validation/schemas.js'

function normalizedProjectId(projectId?: string): string {
  return projectId || ''
}

export function saveApiEnvVars(db: Database, envVars: EnvPair[], projectId?: string): void {
  const scope = normalizedProjectId(projectId)
  transaction(db, () => {
    run(db, 'DELETE FROM api_env_vars WHERE project_id = ?', [scope])
    envVars.forEach((item, index) => {
      if (!item.key.trim()) return
      run(db, 'INSERT OR REPLACE INTO api_env_vars (project_id, key, value, sort_order) VALUES (?, ?, ?, ?)', [
        scope,
        item.key.trim(),
        item.value,
        index
      ])
    })
  })
}

export function saveApiHistory(db: Database, history: ApiHistoryItem[]): void {
  transaction(db, () => {
    run(db, 'DELETE FROM api_history')
    history.slice(0, 20).forEach((item, index) => {
      run(db, 'INSERT INTO api_history (method, url, at, created_at) VALUES (?, ?, ?, ?)', [
        item.method,
        item.url,
        item.at,
        Date.now() - index
      ])
    })
  })
}

export async function getApiToolStateFromDb(projectId?: string): Promise<ApiToolState> {
  const db = await getDatabase()
  const scope = normalizedProjectId(projectId)
  let envVars = readMany<EnvPair>(
    db,
    'SELECT key, value FROM api_env_vars WHERE project_id = ? ORDER BY sort_order ASC, key ASC',
    [scope]
  )
  if (projectId && !envVars.length) {
    envVars = readMany<EnvPair>(
      db,
      "SELECT key, value FROM api_env_vars WHERE project_id = '' ORDER BY sort_order ASC, key ASC"
    )
  }
  const history = readMany<ApiHistoryItem>(
    db,
    'SELECT method, url, at FROM api_history ORDER BY created_at DESC, id DESC LIMIT 20'
  )

  return { envVars, history }
}

export async function saveApiToolStateToDb(state: ApiToolState, projectId?: string): Promise<ApiToolState> {
  const parsed = apiToolStateSchema.parse(state)
  const db = await getDatabase()
  saveApiEnvVars(db, parsed.envVars, projectId)
  saveApiHistory(db, parsed.history)
  persist(db)
  return getApiToolStateFromDb(projectId)
}

export async function getApiSavedRequestsFromDb(projectId?: string): Promise<ApiSavedRequest[]> {
  const db = await getDatabase()
  const where = projectId ? 'WHERE project_id = ?' : ''
  const params = projectId ? [projectId] : []
  const rows = readMany<{
    id: string
    name: string
    method: ApiSavedRequest['method']
    url: string
    headers: string
    body: string
    project_id: string | null
    task_id: string | null
    group_name: string | null
    source_type: ApiSavedRequest['sourceType'] | null
    source_path: string | null
    confidence: number | null
    created_at: string
    updated_at: string
  }>(
    db,
    `SELECT id, name, method, url, headers, body, project_id, task_id, group_name, source_type, source_path, confidence, created_at, updated_at
      FROM api_saved_requests ${where}
      ORDER BY COALESCE(group_name, ''), updated_at DESC`,
    params
  )

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    method: row.method,
    url: row.url,
    headers: JSON.parse(row.headers) as ApiSavedRequest['headers'],
    body: row.body,
    projectId: row.project_id ?? undefined,
    taskId: row.task_id ?? undefined,
    groupName: row.group_name ?? undefined,
    sourceType: row.source_type ?? undefined,
    sourcePath: row.source_path ?? undefined,
    confidence: row.confidence ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
}

export async function saveApiRequestToDb(
  request: Omit<ApiSavedRequest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<ApiSavedRequest[]> {
  const parsed = apiSavedRequestInputSchema.parse(request)
  const db = await getDatabase()
  const now = new Date().toISOString()
  const id = parsed.id || randomUUID()
  const existing = parsed.id
    ? readOne<{ created_at: string }>(db, 'SELECT created_at FROM api_saved_requests WHERE id = ?', [parsed.id])
    : null

  run(
    db,
    `INSERT OR REPLACE INTO api_saved_requests
      (id, name, method, url, headers, body, project_id, task_id, group_name, source_type, source_path, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.name.trim() || `${parsed.method} ${parsed.url}`,
      parsed.method,
      parsed.url,
      JSON.stringify(parsed.headers),
      parsed.body,
      parsed.projectId ?? null,
      parsed.taskId ?? null,
      parsed.groupName ?? null,
      parsed.sourceType ?? null,
      parsed.sourcePath ?? null,
      parsed.confidence ?? null,
      existing?.created_at || now,
      now
    ]
  )
  persist(db)
  return getApiSavedRequestsFromDb(parsed.projectId)
}

export async function deleteApiRequestFromDb(id: string): Promise<ApiSavedRequest[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM api_saved_requests WHERE id = ?', [id])
  persist(db)
  return getApiSavedRequestsFromDb()
}
