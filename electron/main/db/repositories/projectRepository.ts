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
  project_type: string
  tech_stack: string
  install_command: string
  dev_command: string
  test_command: string
  build_command: string
  important_paths: string
  notes: string
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
    projectType: row.project_type,
    techStack: row.tech_stack,
    installCommand: row.install_command,
    devCommand: row.dev_command,
    testCommand: row.test_command,
    buildCommand: row.build_command,
    importantPaths: row.important_paths,
    notes: row.notes,
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
      , project_type, tech_stack, install_command, dev_command, test_command, build_command, important_paths, notes
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
      (id, name, path, description, tags, project_type, tech_stack, install_command, dev_command, test_command, build_command, important_paths, notes, created_at, updated_at, last_opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      parsed.path.trim(),
      parsed.description.trim(),
      JSON.stringify(Array.from(new Set(tags))),
      parsed.projectType?.trim() ?? '',
      parsed.techStack?.trim() ?? '',
      parsed.installCommand?.trim() ?? '',
      parsed.devCommand?.trim() ?? '',
      parsed.testCommand?.trim() ?? '',
      parsed.buildCommand?.trim() ?? '',
      parsed.importantPaths?.trim() ?? '',
      parsed.notes?.trim() ?? '',
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
  run(db, 'DELETE FROM project_task_files WHERE project_id = ?', [id])
  run(db, 'DELETE FROM project_knowledge WHERE project_id = ?', [id])
  run(db, 'DELETE FROM project_tasks WHERE project_id = ?', [id])
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
