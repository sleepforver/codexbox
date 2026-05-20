import { randomUUID } from 'node:crypto'
import type {
  AiHistorySourceType,
  ProjectKnowledgeFilters,
  ProjectKnowledgeItem,
  ProjectKnowledgeSaveRequest,
  ProjectSearchFilters,
  ProjectSearchResult,
  ProjectSearchResultType
} from '../../../../src/shared/ipc.js'
import { projectKnowledgeFiltersSchema, projectKnowledgeSaveSchema } from '../../validation/schemas.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, run } from '../runtime.js'

interface ProjectKnowledgeRow {
  id: string
  project_id: string
  title: string
  content: string
  source_type: AiHistorySourceType
  source_id: string | null
  is_favorite: number
  created_at: string
  updated_at: string
}

function mapProjectKnowledge(row: ProjectKnowledgeRow): ProjectKnowledgeItem {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content,
    sourceType: row.source_type,
    sourceId: row.source_id ?? undefined,
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function listProjectKnowledgeFromDb(filters: ProjectKnowledgeFilters): Promise<ProjectKnowledgeItem[]> {
  const parsed = projectKnowledgeFiltersSchema.parse(filters)
  const db = await getDatabase()
  const clauses = ['project_id = ?']
  const params: Array<string | number> = [parsed.projectId]

  if (parsed.favoriteOnly) {
    clauses.push('is_favorite = 1')
  }
  if (parsed.keyword?.trim()) {
    clauses.push('(title LIKE ? OR content LIKE ?)')
    const keyword = `%${parsed.keyword.trim()}%`
    params.push(keyword, keyword)
  }

  const rows = readMany<ProjectKnowledgeRow>(
    db,
    `SELECT id, project_id, title, content, source_type, source_id, is_favorite, created_at, updated_at
      FROM project_knowledge
      WHERE ${clauses.join(' AND ')}
      ORDER BY is_favorite DESC, updated_at DESC`,
    params
  )

  return rows.map(mapProjectKnowledge)
}

interface ProjectSearchRow {
  id: string
  project_id: string
  title: string
  summary: string
  source_type: string | null
  source_id: string | null
  updated_at: string
  result_type: ProjectSearchResultType
}

function mapProjectSearchResult(row: ProjectSearchRow): ProjectSearchResult {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.result_type,
    title: row.title,
    summary: row.summary,
    sourceType: (row.source_type ?? undefined) as ProjectSearchResult['sourceType'],
    sourceId: row.source_id ?? undefined,
    updatedAt: row.updated_at
  }
}

function buildKeywordClauses(columns: string[], keyword?: string): { clause: string; params: string[] } {
  const value = keyword?.trim()
  if (!value) return { clause: '1 = 1', params: [] }
  return {
    clause: `(${columns.map((column) => `${column} LIKE ?`).join(' OR ')})`,
    params: columns.map(() => `%${value}%`)
  }
}

function appendSearchRows(
  rows: ProjectSearchResult[],
  nextRows: ProjectSearchRow[],
  seen: Set<string>
): ProjectSearchResult[] {
  for (const row of nextRows) {
    const key = `${row.result_type}:${row.id}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(mapProjectSearchResult(row))
  }
  return rows
}

export async function searchProjectKnowledgeFromDb(filters: ProjectSearchFilters): Promise<ProjectSearchResult[]> {
  if (!filters.projectId.trim()) throw new Error('项目不能为空')
  const db = await getDatabase()
  const projectId = filters.projectId
  const results: ProjectSearchResult[] = []
  const seen = new Set<string>()

  const projectKeyword = buildKeywordClauses(
    ['name', 'path', 'description', 'tags', 'project_type', 'tech_stack', 'important_paths', 'notes'],
    filters.keyword
  )
  appendSearchRows(
    results,
    readMany<ProjectSearchRow>(
      db,
      `SELECT id, id AS project_id, name AS title,
        trim(description || char(10) || tech_stack || char(10) || important_paths || char(10) || notes) AS summary,
        'project' AS source_type, id AS source_id, updated_at, 'project' AS result_type
        FROM workspace_projects
        WHERE id = ? AND ${projectKeyword.clause}
        LIMIT 1`,
      [projectId, ...projectKeyword.params]
    ),
    seen
  )

  const taskKeyword = buildKeywordClauses(['title', 'description', 'task_type', 'priority', 'status'], filters.keyword)
  appendSearchRows(
    results,
    readMany<ProjectSearchRow>(
      db,
      `SELECT id, project_id, title,
        trim(description || char(10) || task_type || ' / ' || priority || ' / ' || status) AS summary,
        'task' AS source_type, id AS source_id, updated_at, 'task' AS result_type
        FROM project_tasks
        WHERE project_id = ? AND ${taskKeyword.clause}
        ORDER BY updated_at DESC
        LIMIT 20`,
      [projectId, ...taskKeyword.params]
    ),
    seen
  )

  const knowledgeKeyword = buildKeywordClauses(['title', 'content', 'source_type', 'source_id'], filters.keyword)
  appendSearchRows(
    results,
    readMany<ProjectSearchRow>(
      db,
      `SELECT id, project_id, title, content AS summary, source_type, source_id, updated_at, 'knowledge' AS result_type
        FROM project_knowledge
        WHERE project_id = ? AND ${knowledgeKeyword.clause}
        ORDER BY is_favorite DESC, updated_at DESC
        LIMIT 20`,
      [projectId, ...knowledgeKeyword.params]
    ),
    seen
  )

  const historyKeyword = buildKeywordClauses(['title', 'prompt', 'output', 'model', 'task_type'], filters.keyword)
  appendSearchRows(
    results,
    readMany<ProjectSearchRow>(
      db,
      `SELECT id, project_id, title, output AS summary, source_type, COALESCE(source_ref, task_id, id) AS source_id,
        created_at AS updated_at, 'ai_history' AS result_type
        FROM ai_history
        WHERE project_id = ? AND ${historyKeyword.clause}
        ORDER BY created_at DESC
        LIMIT 20`,
      [projectId, ...historyKeyword.params]
    ),
    seen
  )

  const apiKeyword = buildKeywordClauses(
    ['name', 'method', 'url', 'body', 'group_name', 'source_path'],
    filters.keyword
  )
  appendSearchRows(
    results,
    readMany<ProjectSearchRow>(
      db,
      `SELECT id, COALESCE(project_id, '') AS project_id, name AS title,
        trim(method || ' ' || url || char(10) || COALESCE(group_name, '') || char(10) || COALESCE(source_path, '')) AS summary,
        COALESCE(source_type, 'manual') AS source_type, id AS source_id, updated_at, 'api_request' AS result_type
        FROM api_saved_requests
        WHERE project_id = ? AND ${apiKeyword.clause}
        ORDER BY updated_at DESC
        LIMIT 20`,
      [projectId, ...apiKeyword.params]
    ),
    seen
  )

  return results.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 60)
}

export async function saveProjectKnowledgeToDb(request: ProjectKnowledgeSaveRequest): Promise<ProjectKnowledgeItem[]> {
  const parsed = projectKnowledgeSaveSchema.parse(request)
  if (!parsed.projectId.trim()) throw new Error('项目不能为空')
  const db = await getDatabase()
  const now = new Date().toISOString()
  const id = parsed.id || randomUUID()
  const existing = parsed.id
    ? readMany<{ created_at: string; is_favorite: number }>(
        db,
        'SELECT created_at, is_favorite FROM project_knowledge WHERE id = ? AND project_id = ?',
        [parsed.id, parsed.projectId]
      )[0]
    : null
  const isFavorite = parsed.isFavorite ?? Boolean(existing?.is_favorite)

  run(
    db,
    `INSERT OR REPLACE INTO project_knowledge
      (id, project_id, title, content, source_type, source_id, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.projectId,
      parsed.title.trim() || '未命名知识条目',
      parsed.content.trim(),
      parsed.sourceType,
      parsed.sourceId?.trim() || null,
      isFavorite ? 1 : 0,
      existing?.created_at || now,
      now
    ]
  )
  persist(db)
  return listProjectKnowledgeFromDb({ projectId: parsed.projectId })
}

export async function deleteProjectKnowledgeFromDb(id: string, projectId: string): Promise<ProjectKnowledgeItem[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM project_knowledge WHERE id = ? AND project_id = ?', [id, projectId])
  persist(db)
  return listProjectKnowledgeFromDb({ projectId })
}

export async function toggleProjectKnowledgeFavoriteInDb(
  id: string,
  projectId: string,
  favorite: boolean
): Promise<ProjectKnowledgeItem[]> {
  const db = await getDatabase()
  run(db, 'UPDATE project_knowledge SET is_favorite = ?, updated_at = ? WHERE id = ? AND project_id = ?', [
    favorite ? 1 : 0,
    new Date().toISOString(),
    id,
    projectId
  ])
  persist(db)
  return listProjectKnowledgeFromDb({ projectId })
}
