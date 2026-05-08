import { randomUUID } from 'node:crypto'
import type { AiHistoryItem, AiHistorySaveRequest, AiTaskType } from '../../../../src/shared/ipc.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, run } from '../runtime.js'
import { aiHistorySaveSchema, aiTaskTypeSchema } from '../../validation/schemas.js'

export async function getAiHistoryFromDb(taskType?: AiTaskType, projectId?: string): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  if (taskType !== undefined) aiTaskTypeSchema.parse(taskType)
  const filters: string[] = []
  const params: string[] = []

  if (taskType) {
    filters.push('task_type = ?')
    params.push(taskType)
  }
  if (projectId) {
    filters.push('project_id = ?')
    params.push(projectId)
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const limit = taskType || projectId ? 50 : 100
  const rows = readMany<{
    id: string
    task_type: AiTaskType
    title: string
    prompt: string
    output: string
    model: string
    project_id: string | null
    created_at: string
  }>(
    db,
    `SELECT id, task_type, title, prompt, output, model, project_id, created_at
      FROM ai_history ${where}
      ORDER BY created_at DESC
      LIMIT ${limit}`,
    params
  )

  return rows.map((row) => ({
    id: row.id,
    taskType: row.task_type,
    title: row.title,
    prompt: row.prompt,
    output: row.output,
    model: row.model,
    projectId: row.project_id ?? undefined,
    createdAt: row.created_at
  }))
}

export async function saveAiHistoryToDb(request: AiHistorySaveRequest): Promise<AiHistoryItem[]> {
  const parsed = aiHistorySaveSchema.parse(request)
  const db = await getDatabase()
  const now = new Date().toISOString()
  const title = parsed.title.trim() || parsed.prompt.trim().split(/\r?\n/)[0]?.slice(0, 60) || '未命名 AI 记录'

  run(
    db,
    `INSERT INTO ai_history
      (id, task_type, title, prompt, output, model, project_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), parsed.taskType, title, parsed.prompt, parsed.output, parsed.model, parsed.projectId ?? null, now]
  )
  persist(db)
  return getAiHistoryFromDb(parsed.taskType, parsed.projectId)
}

export async function importAiHistoryToDb(
  item: AiHistorySaveRequest & { id?: string; createdAt?: string },
  projectId?: string
): Promise<void> {
  const parsed = aiHistorySaveSchema.parse({
    taskType: item.taskType,
    title: item.title,
    prompt: item.prompt,
    output: item.output,
    model: item.model,
    projectId: projectId ?? item.projectId
  })
  const db = await getDatabase()
  const id = item.id || randomUUID()
  const createdAt = item.createdAt || new Date().toISOString()
  const title = parsed.title.trim() || parsed.prompt.trim().split(/\r?\n/)[0]?.slice(0, 60) || '未命名 AI 记录'

  run(
    db,
    `INSERT OR REPLACE INTO ai_history
      (id, task_type, title, prompt, output, model, project_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, parsed.taskType, title, parsed.prompt, parsed.output, parsed.model, parsed.projectId ?? null, createdAt]
  )
  persist(db)
}

export async function deleteAiHistoryFromDb(id: string, taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM ai_history WHERE id = ?', [id])
  persist(db)
  return getAiHistoryFromDb(taskType)
}

export async function clearAiHistoryFromDb(taskType?: AiTaskType, projectId?: string): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  const filters: string[] = []
  const params: string[] = []
  if (taskType) {
    aiTaskTypeSchema.parse(taskType)
    filters.push('task_type = ?')
    params.push(taskType)
  }
  if (projectId) {
    filters.push('project_id = ?')
    params.push(projectId)
  }
  if (filters.length) {
    run(db, `DELETE FROM ai_history WHERE ${filters.join(' AND ')}`, params)
  } else {
    run(db, 'DELETE FROM ai_history')
  }
  persist(db)
  return getAiHistoryFromDb(taskType, projectId)
}
