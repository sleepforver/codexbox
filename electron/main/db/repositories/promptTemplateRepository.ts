import { randomUUID } from 'node:crypto'
import type { Database } from 'sql.js'
import type { AiPromptTemplate, AiPromptTemplateSaveRequest, AiTaskType } from '../../../../src/shared/ipc.js'
import { builtinPromptTemplates } from '../builtinPromptTemplates.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, readOne, run, transaction } from '../runtime.js'
import { aiPromptTemplateSaveSchema, aiTaskTypeSchema } from '../../validation/schemas.js'

export function seedBuiltinPromptTemplates(db: Database): void {
  const now = new Date().toISOString()
  builtinPromptTemplates.forEach((item) => {
    const existing = readOne<{ id: string }>(db, 'SELECT id FROM ai_prompt_templates WHERE id = ?', [item.id])
    if (existing) return

    run(
      db,
      `INSERT INTO ai_prompt_templates
        (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.taskType, item.name, item.content, JSON.stringify(item.variables), 1, now, now]
    )
  })
}

export async function getAiPromptTemplatesFromDb(taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  const db = await getDatabase()
  if (taskType !== undefined) aiTaskTypeSchema.parse(taskType)
  const rows = taskType
    ? readMany<{
        id: string
        task_type: AiTaskType
        name: string
        content: string
        variables: string
        is_builtin: number
        created_at: string
        updated_at: string
      }>(
        db,
        'SELECT id, task_type, name, content, variables, is_builtin, created_at, updated_at FROM ai_prompt_templates WHERE task_type = ? ORDER BY is_builtin DESC, updated_at DESC, name ASC',
        [taskType]
      )
    : readMany<{
        id: string
        task_type: AiTaskType
        name: string
        content: string
        variables: string
        is_builtin: number
        created_at: string
        updated_at: string
      }>(
        db,
        'SELECT id, task_type, name, content, variables, is_builtin, created_at, updated_at FROM ai_prompt_templates ORDER BY task_type ASC, is_builtin DESC, updated_at DESC, name ASC'
      )

  return rows.map((row) => ({
    id: row.id,
    taskType: row.task_type,
    name: row.name,
    content: row.content,
    variables: JSON.parse(row.variables) as string[],
    isBuiltin: Boolean(row.is_builtin),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
}

export async function saveAiPromptTemplateToDb(request: AiPromptTemplateSaveRequest): Promise<AiPromptTemplate[]> {
  const parsed = aiPromptTemplateSaveSchema.parse(request)
  const db = await getDatabase()
  const now = new Date().toISOString()
  const name = parsed.name.trim() || '未命名模板'
  const content = parsed.content.trim()

  if (!content) {
    return getAiPromptTemplatesFromDb(parsed.taskType)
  }

  if (parsed.id) {
    const existing = readOne<{ is_builtin: number; created_at: string }>(
      db,
      'SELECT is_builtin, created_at FROM ai_prompt_templates WHERE id = ?',
      [parsed.id]
    )
    if (existing?.is_builtin) {
      return getAiPromptTemplatesFromDb(parsed.taskType)
    }

    run(
      db,
      `INSERT OR REPLACE INTO ai_prompt_templates
        (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [parsed.id, parsed.taskType, name, content, JSON.stringify(parsed.variables), 0, existing?.created_at || now, now]
    )
  } else {
    run(
      db,
      `INSERT INTO ai_prompt_templates
        (id, task_type, name, content, variables, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), parsed.taskType, name, content, JSON.stringify(parsed.variables), 0, now, now]
    )
  }

  persist(db)
  return getAiPromptTemplatesFromDb(parsed.taskType)
}

export async function deleteAiPromptTemplateFromDb(id: string, taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM ai_prompt_templates WHERE id = ? AND is_builtin = 0', [id])
  persist(db)
  return getAiPromptTemplatesFromDb(taskType)
}

export async function resetBuiltinPromptTemplatesInDb(taskType?: AiTaskType): Promise<AiPromptTemplate[]> {
  const db = await getDatabase()
  transaction(db, () => {
    if (taskType) {
      aiTaskTypeSchema.parse(taskType)
      run(db, 'DELETE FROM ai_prompt_templates WHERE is_builtin = 1 AND task_type = ?', [taskType])
    } else {
      run(db, 'DELETE FROM ai_prompt_templates WHERE is_builtin = 1')
    }
    seedBuiltinPromptTemplates(db)
  })
  persist(db)
  return getAiPromptTemplatesFromDb(taskType)
}
