import { randomUUID } from 'node:crypto'
import type { GeoAnalyzeHistoryItem, GeoAnalyzeRequest, GeoAnalyzeResponse } from '../../../../src/shared/ipc.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, run } from '../runtime.js'

type GeoAnalyzeSuccess = Extract<GeoAnalyzeResponse, { ok: true }>

interface GeoHistoryRow {
  id: string
  project_id: string | null
  title: string
  source: string
  required_properties: string
  result: string
  feature_count: number
  issue_count: number
  created_at: string
}

function mapGeoHistory(row: GeoHistoryRow): GeoAnalyzeHistoryItem {
  const requiredProperties = parseJsonValue<string[]>(row.required_properties, [])
  const result = parseJsonValue<GeoAnalyzeSuccess>(row.result, {
    ok: true,
    historyId: row.id,
    featureCount: row.feature_count,
    geometryTypes: [],
    bounds: null,
    issues: [{ level: 'warning', path: 'result', message: '历史结果解析失败，请重新分析源数据' }]
  })
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    title: row.title,
    source: row.source,
    requiredProperties,
    result,
    featureCount: row.feature_count,
    issueCount: row.issue_count,
    createdAt: row.created_at
  }
}

function parseJsonValue<T>(source: string, fallback: T): T {
  try {
    return JSON.parse(source) as T
  } catch {
    return fallback
  }
}

export async function getGeoAnalysisHistoryFromDb(projectId?: string): Promise<GeoAnalyzeHistoryItem[]> {
  const db = await getDatabase()
  const where = projectId ? 'WHERE project_id = ?' : ''
  const params = projectId ? [projectId] : []
  const rows = readMany<GeoHistoryRow>(
    db,
    `SELECT id, project_id, title, source, required_properties, result, feature_count, issue_count, created_at
      FROM geo_analysis_history ${where}
      ORDER BY created_at DESC
      LIMIT 50`,
    params
  )
  return rows.map(mapGeoHistory)
}

export async function saveGeoAnalysisHistoryToDb(
  request: GeoAnalyzeRequest,
  result: GeoAnalyzeSuccess
): Promise<GeoAnalyzeHistoryItem> {
  const db = await getDatabase()
  const id = randomUUID()
  const now = new Date().toISOString()
  const title = request.title?.trim() || `GeoJSON 体检 ${new Date(now).toLocaleString('zh-CN')}`

  run(
    db,
    `INSERT INTO geo_analysis_history
      (id, project_id, title, source, required_properties, result, feature_count, issue_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      request.projectId ?? null,
      title,
      request.source,
      JSON.stringify(request.requiredProperties),
      JSON.stringify({ ...result, historyId: id }),
      result.featureCount,
      result.issues.length,
      now
    ]
  )
  persist(db)

  return {
    id,
    projectId: request.projectId,
    title,
    source: request.source,
    requiredProperties: request.requiredProperties,
    result: { ...result, historyId: id },
    featureCount: result.featureCount,
    issueCount: result.issues.length,
    createdAt: now
  }
}

export async function importGeoAnalysisHistoryToDb(item: GeoAnalyzeHistoryItem, projectId?: string): Promise<void> {
  const db = await getDatabase()
  const targetProjectId = projectId ?? item.projectId
  run(
    db,
    `INSERT OR REPLACE INTO geo_analysis_history
      (id, project_id, title, source, required_properties, result, feature_count, issue_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      targetProjectId ?? null,
      item.title,
      item.source,
      JSON.stringify(item.requiredProperties),
      JSON.stringify({ ...item.result, historyId: item.id }),
      item.featureCount,
      item.issueCount,
      item.createdAt
    ]
  )
  persist(db)
}

export async function deleteGeoAnalysisHistoryFromDb(id: string): Promise<GeoAnalyzeHistoryItem[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM geo_analysis_history WHERE id = ?', [id])
  persist(db)
  return getGeoAnalysisHistoryFromDb()
}

export async function clearGeoAnalysisHistoryFromDb(projectId?: string): Promise<GeoAnalyzeHistoryItem[]> {
  const db = await getDatabase()
  if (projectId) {
    run(db, 'DELETE FROM geo_analysis_history WHERE project_id = ?', [projectId])
  } else {
    run(db, 'DELETE FROM geo_analysis_history')
  }
  persist(db)
  return getGeoAnalysisHistoryFromDb(projectId)
}
