import type {
  GeoAnalyzeHistoryItem,
  GeoAnalyzeRequest,
  GeoAnalyzeResponse,
  GeoBounds,
  GeoValidationIssue
} from '../../../src/shared/ipc.js'
import {
  clearGeoAnalysisHistoryFromDb,
  deleteGeoAnalysisHistoryFromDb,
  getGeoAnalysisHistoryFromDb,
  importGeoAnalysisHistoryToDb,
  saveGeoAnalysisHistoryToDb
} from '../db/repositories/geoRepository.js'
import { geoAnalyzeRequestSchema } from '../validation/schemas.js'

interface GeoFeature {
  type: 'Feature'
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: Record<string, unknown> | null
}

function isFeatureCollection(value: unknown): value is { type: 'FeatureCollection'; features: GeoFeature[] } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { type?: unknown }).type === 'FeatureCollection' &&
      Array.isArray((value as { features?: unknown }).features)
  )
}

function collectCoordinatePairs(value: unknown, pairs: Array<[number, number]>): void {
  if (!Array.isArray(value)) return

  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    pairs.push([value[0], value[1]])
    return
  }

  value.forEach((item) => collectCoordinatePairs(item, pairs))
}

function updateBounds(bounds: GeoBounds | null, lng: number, lat: number): GeoBounds {
  if (!bounds) {
    return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat }
  }

  return {
    minLng: Math.min(bounds.minLng, lng),
    minLat: Math.min(bounds.minLat, lat),
    maxLng: Math.max(bounds.maxLng, lng),
    maxLat: Math.max(bounds.maxLat, lat)
  }
}

const maxGeoJsonSourceBytes = 5 * 1024 * 1024
const maxGeoJsonFeatures = 10000
const maxRequiredProperties = 50

export async function handleGeoAnalyze(request: GeoAnalyzeRequest): Promise<GeoAnalyzeResponse> {
  const parsedRequest = geoAnalyzeRequestSchema.parse(request)
  const sourceSize = Buffer.byteLength(parsedRequest.source, 'utf8')
  if (!parsedRequest.source.trim()) {
    return { ok: false, error: 'GeoJSON 输入不能为空' }
  }
  if (sourceSize > maxGeoJsonSourceBytes) {
    return { ok: false, error: 'GeoJSON 输入超过 5MB，请拆分后再分析' }
  }
  if (parsedRequest.requiredProperties.length > maxRequiredProperties) {
    return { ok: false, error: `必填属性最多支持 ${maxRequiredProperties} 个` }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(parsedRequest.source)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'GeoJSON 解析失败' }
  }

  if (!isFeatureCollection(parsed)) {
    return { ok: false, error: '仅支持 GeoJSON FeatureCollection' }
  }
  if (parsed.features.length > maxGeoJsonFeatures) {
    return { ok: false, error: `GeoJSON 要素超过 ${maxGeoJsonFeatures} 个，请拆分后再分析` }
  }

  const typeCounts = new Map<string, number>()
  const issues: GeoValidationIssue[] = []
  let bounds: GeoBounds | null = null
  const requiredProperties = Array.from(
    new Set(parsedRequest.requiredProperties.map((item) => item.trim()).filter(Boolean))
  )

  parsed.features.forEach((feature, index) => {
    const path = `features[${index}]`
    const geometryType = feature.geometry?.type || 'Unknown'
    typeCounts.set(geometryType, (typeCounts.get(geometryType) || 0) + 1)

    if (!feature.geometry) {
      issues.push({ level: 'error', path, message: '缺少 geometry' })
    }

    if (!feature.properties || typeof feature.properties !== 'object') {
      issues.push({ level: 'warning', path, message: '缺少 properties' })
    }

    for (const property of requiredProperties) {
      if (!feature.properties || feature.properties[property] === undefined || feature.properties[property] === '') {
        issues.push({ level: 'warning', path: `${path}.properties.${property}`, message: `缺少必填属性 ${property}` })
      }
    }

    const pairs: Array<[number, number]> = []
    collectCoordinatePairs(feature.geometry?.coordinates, pairs)

    if (!pairs.length && feature.geometry) {
      issues.push({ level: 'error', path: `${path}.geometry.coordinates`, message: '坐标为空或格式不正确' })
    }

    for (const [lng, lat] of pairs) {
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        issues.push({ level: 'warning', path: `${path}.geometry.coordinates`, message: `坐标超出 WGS84 范围: ${lng}, ${lat}` })
      }
      bounds = updateBounds(bounds, lng, lat)
    }
  })

  const result: Extract<GeoAnalyzeResponse, { ok: true }> = {
    ok: true,
    featureCount: parsed.features.length,
    geometryTypes: [...typeCounts.entries()].map(([type, count]) => ({ type, count })),
    bounds,
    issues
  }

  const historyItem = await saveGeoAnalysisHistoryToDb(parsedRequest, result)
  return { ...result, historyId: historyItem.id }
}

export function getGeoAnalysisHistory(projectId?: string): Promise<GeoAnalyzeHistoryItem[]> {
  return getGeoAnalysisHistoryFromDb(projectId)
}

export function deleteGeoAnalysisHistory(id: string): Promise<GeoAnalyzeHistoryItem[]> {
  return deleteGeoAnalysisHistoryFromDb(id)
}

export function clearGeoAnalysisHistory(projectId?: string): Promise<GeoAnalyzeHistoryItem[]> {
  return clearGeoAnalysisHistoryFromDb(projectId)
}

export function importGeoAnalysisHistory(item: GeoAnalyzeHistoryItem, projectId?: string): Promise<void> {
  return importGeoAnalysisHistoryToDb(item, projectId)
}
