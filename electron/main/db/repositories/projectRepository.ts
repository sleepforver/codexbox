import { randomUUID } from 'node:crypto'
import type { WorkspaceProject, WorkspaceProjectSaveRequest } from '../../../../src/shared/ipc.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, readOne, run } from '../runtime.js'
import { workspaceProjectSaveSchema } from '../../validation/schemas.js'

interface WorkspaceProjectRow {
  id: string
  name: string
  path: string
  description: string
  tags: string
  created_at: string
  updated_at: string
  last_opened_at: string | null
}

function mapProject(row: WorkspaceProjectRow): WorkspaceProject {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at
  }
}

export async function listWorkspaceProjectsFromDb(): Promise<WorkspaceProject[]> {
  const db = await getDatabase()
  const rows = readMany<WorkspaceProjectRow>(
    db,
    `SELECT id, name, path, description, tags, created_at, updated_at, last_opened_at
      FROM workspace_projects
      ORDER BY COALESCE(last_opened_at, updated_at) DESC, name ASC`
  )
  return rows.map(mapProject)
}

export async function saveWorkspaceProjectToDb(request: WorkspaceProjectSaveRequest): Promise<WorkspaceProject[]> {
  const parsed = workspaceProjectSaveSchema.parse(request)
  const db = await getDatabase()
  const now = new Date().toISOString()
  const id = parsed.id || randomUUID()
  const existing = parsed.id
    ? readOne<{ created_at: string; last_opened_at: string | null }>(
        db,
        'SELECT created_at, last_opened_at FROM workspace_projects WHERE id = ?',
        [parsed.id]
      )
    : null
  const tags = parsed.tags.map((tag) => tag.trim()).filter(Boolean)
  const name = parsed.name.trim() || parsed.path.trim().split(/[\\/]/).filter(Boolean).at(-1) || '未命名项目'

  run(
    db,
    `INSERT OR REPLACE INTO workspace_projects
      (id, name, path, description, tags, created_at, updated_at, last_opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      parsed.path.trim(),
      parsed.description.trim(),
      JSON.stringify(Array.from(new Set(tags))),
      existing?.created_at || now,
      now,
      existing?.last_opened_at ?? null
    ]
  )
  persist(db)
  return listWorkspaceProjectsFromDb()
}

export async function deleteWorkspaceProjectFromDb(id: string): Promise<WorkspaceProject[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM workspace_projects WHERE id = ?', [id])
  persist(db)
  return listWorkspaceProjectsFromDb()
}

export async function markWorkspaceProjectOpenedInDb(id: string): Promise<WorkspaceProject[]> {
  const db = await getDatabase()
  const now = new Date().toISOString()
  run(db, 'UPDATE workspace_projects SET last_opened_at = ?, updated_at = ? WHERE id = ?', [now, now, id])
  persist(db)
  return listWorkspaceProjectsFromDb()
}
