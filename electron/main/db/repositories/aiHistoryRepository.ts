import { randomUUID } from 'node:crypto'
import type { AiHistoryItem, AiHistorySaveRequest, AiTaskType } from '../../../../src/shared/ipc.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, run } from '../runtime.js'
import { aiHistorySaveSchema, aiTaskTypeSchema } from '../../validation/schemas.js'

export async function getAiHistoryFromDb(taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  if (taskType !== undefined) aiTaskTypeSchema.parse(taskType)
  const rows = taskType
    ? readMany<{
        id: string
        task_type: AiTaskType
        title: string
        prompt: string
        output: string
        model: string
        created_at: string
      }>(
        db,
        'SELECT id, task_type, title, prompt, output, model, created_at FROM ai_history WHERE task_type = ? ORDER BY created_at DESC LIMIT 50',
        [taskType]
      )
    : readMany<{
        id: string
        task_type: AiTaskType
        title: string
        prompt: string
        output: string
        model: string
        created_at: string
      }>(
        db,
        'SELECT id, task_type, title, prompt, output, model, created_at FROM ai_history ORDER BY created_at DESC LIMIT 100'
      )

  return rows.map((row) => ({
    id: row.id,
    taskType: row.task_type,
    title: row.title,
    prompt: row.prompt,
    output: row.output,
    model: row.model,
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
      (id, task_type, title, prompt, output, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), parsed.taskType, title, parsed.prompt, parsed.output, parsed.model, now]
  )
  persist(db)
  return getAiHistoryFromDb(parsed.taskType)
}

export async function deleteAiHistoryFromDb(id: string, taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM ai_history WHERE id = ?', [id])
  persist(db)
  return getAiHistoryFromDb(taskType)
}

export async function clearAiHistoryFromDb(taskType?: AiTaskType): Promise<AiHistoryItem[]> {
  const db = await getDatabase()
  if (taskType) {
    aiTaskTypeSchema.parse(taskType)
    run(db, 'DELETE FROM ai_history WHERE task_type = ?', [taskType])
  } else {
    run(db, 'DELETE FROM ai_history')
  }
  persist(db)
  return getAiHistoryFromDb(taskType)
}
