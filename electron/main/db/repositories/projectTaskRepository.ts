import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type {
  ProjectTask,
  ProjectTaskFile,
  ProjectTaskFilters,
  ProjectTaskSaveRequest,
  ProjectTaskStatus,
  ProjectTaskType
} from '../../../../src/shared/ipc.js'
import { projectTaskFiltersSchema, projectTaskSaveSchema } from '../../validation/schemas.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, run } from '../runtime.js'

interface ProjectTaskRow {
  id: string
  project_id: string
  title: string
  description: string
  task_type: ProjectTaskType
  priority: ProjectTask['priority']
  status: ProjectTaskStatus
  created_at: string
  updated_at: string
  completed_at: string | null
}

export function mapProjectTask(row: ProjectTaskRow): ProjectTask {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    taskType: row.task_type,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }
}

export async function listProjectTasksFromDb(filters: ProjectTaskFilters): Promise<ProjectTask[]> {
  const parsed = projectTaskFiltersSchema.parse(filters)
  const db = await getDatabase()
  const clauses = ['project_id = ?']
  const params: string[] = [parsed.projectId]

  if (parsed.status && parsed.status !== 'all') {
    clauses.push('status = ?')
    params.push(parsed.status)
  }
  if (parsed.taskType && parsed.taskType !== 'all') {
    clauses.push('task_type = ?')
    params.push(parsed.taskType)
  }
  if (parsed.keyword?.trim()) {
    clauses.push('(title LIKE ? OR description LIKE ?)')
    const keyword = `%${parsed.keyword.trim()}%`
    params.push(keyword, keyword)
  }

  const rows = readMany<ProjectTaskRow>(
    db,
    `SELECT id, project_id, title, description, task_type, priority, status, created_at, updated_at, completed_at
      FROM project_tasks
      WHERE ${clauses.join(' AND ')}
      ORDER BY
        CASE status
          WHEN 'in_progress' THEN 0
          WHEN 'todo' THEN 1
          WHEN 'pending_validation' THEN 2
          WHEN 'done' THEN 3
          ELSE 4
        END,
        updated_at DESC`,
    params
  )

  return rows.map(mapProjectTask)
}

export async function saveProjectTaskToDb(request: ProjectTaskSaveRequest): Promise<ProjectTask[]> {
  const parsed = projectTaskSaveSchema.parse(request)
  if (!parsed.projectId.trim()) throw new Error('项目不能为空')
  const db = await getDatabase()
  const now = new Date().toISOString()
  const id = parsed.id || randomUUID()
  const createdAt =
    parsed.id &&
    readMany<{ created_at: string }>(db, 'SELECT created_at FROM project_tasks WHERE id = ?', [parsed.id])[0]
      ?.created_at

  const completedAt = parsed.status === 'done' || parsed.status === 'archived' ? now : null
  run(
    db,
    `INSERT OR REPLACE INTO project_tasks
      (id, project_id, title, description, task_type, priority, status, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.projectId,
      parsed.title.trim() || '未命名任务',
      parsed.description.trim(),
      parsed.taskType,
      parsed.priority,
      parsed.status,
      createdAt || now,
      now,
      completedAt
    ]
  )
  persist(db)
  return listProjectTasksFromDb({ projectId: parsed.projectId })
}

export async function deleteProjectTaskFromDb(id: string, projectId: string): Promise<ProjectTask[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM project_task_files WHERE task_id = ?', [id])
  run(db, 'DELETE FROM project_tasks WHERE id = ? AND project_id = ?', [id, projectId])
  persist(db)
  return listProjectTasksFromDb({ projectId })
}

interface ProjectTaskFileRow {
  id: string
  project_id: string
  task_id: string
  name: string
  path: string
  content: string
  size_bytes: number
  created_at: string
}

function mapProjectTaskFile(row: ProjectTaskFileRow): ProjectTaskFile {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    name: row.name,
    path: row.path,
    content: row.content,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  }
}

export async function listProjectTaskFilesFromDb(taskId: string): Promise<ProjectTaskFile[]> {
  const db = await getDatabase()
  const rows = readMany<ProjectTaskFileRow>(
    db,
    `SELECT id, project_id, task_id, name, path, content, size_bytes, created_at
      FROM project_task_files
      WHERE task_id = ?
      ORDER BY created_at DESC`,
    [taskId]
  )
  return rows.map(mapProjectTaskFile)
}

export async function saveProjectTaskFileToDb(request: {
  projectId: string
  taskId: string
  path: string
  content: string
  sizeBytes: number
}): Promise<ProjectTaskFile[]> {
  const db = await getDatabase()
  const now = new Date().toISOString()
  run(
    db,
    `INSERT INTO project_task_files
      (id, project_id, task_id, name, path, content, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      request.projectId,
      request.taskId,
      basename(request.path),
      request.path,
      request.content,
      request.sizeBytes,
      now
    ]
  )
  persist(db)
  return listProjectTaskFilesFromDb(request.taskId)
}

export async function deleteProjectTaskFileFromDb(id: string, taskId: string): Promise<ProjectTaskFile[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM project_task_files WHERE id = ? AND task_id = ?', [id, taskId])
  persist(db)
  return listProjectTaskFilesFromDb(taskId)
}
