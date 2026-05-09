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

interface GeoFeatureIndexItem {
  path: string
  geometryType: string
  properties: Record<string, unknown>
  pairs: Array<[number, number]>
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

function propertyText(properties: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = properties[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function extractSequence(value: string): number | null {
  const match = value.match(/(\d+)(?!.*\d)/)
  if (!match) return null
  const number = Number(match[1])
  return Number.isInteger(number) ? number : null
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function addGeoDataQualityIssues(features: GeoFeatureIndexItem[], issues: GeoValidationIssue[]): void {
  const identifierMap = new Map<string, string[]>()
  const entityNames = new Set<string>()
  const groupSequences = new Map<string, number[]>()
  const groupPoints = new Map<string, Array<{ path: string; point: [number, number] }>>()

  for (const feature of features) {
    const identifier = propertyText(feature.properties, ['featureId', 'id', 'code', 'objectId'])
    const groupName = propertyText(feature.properties, ['datasetName', 'groupName', 'layerName', 'category'])
    const entityName = propertyText(feature.properties, ['name', 'featureName', 'label'])

    if (identifier) {
      identifierMap.set(identifier, [...(identifierMap.get(identifier) ?? []), feature.path])
    }

    if (entityName) {
      entityNames.add(entityName)
    }

    if (groupName && identifier) {
      const explicitOrder = propertyText(feature.properties, ['sequence', 'sortNo', 'order', 'index'])
      const order = extractSequence(explicitOrder || identifier)
      if (order !== null) groupSequences.set(groupName, [...(groupSequences.get(groupName) ?? []), order])
      if (feature.pairs[0])
        groupPoints.set(groupName, [
          ...(groupPoints.get(groupName) ?? []),
          { path: feature.path, point: feature.pairs[0] }
        ])
    }
  }

  for (const [identifier, paths] of identifierMap.entries()) {
    if (paths.length > 1) {
      issues.push({ level: 'warning', path: paths.join(', '), message: `要素标识重复：${identifier}` })
    }
  }

  for (const [groupName, orders] of groupSequences.entries()) {
    const uniqueOrders = [...new Set(orders)].sort((a, b) => a - b)
    if (uniqueOrders.length < 3) continue
    const missing: number[] = []
    for (let value = uniqueOrders[0]; value <= uniqueOrders[uniqueOrders.length - 1]; value += 1) {
      if (!uniqueOrders.includes(value)) missing.push(value)
      if (missing.length >= 20) break
    }
    if (missing.length) {
      issues.push({ level: 'warning', path: `group=${groupName}`, message: `分组序号存在缺口：${missing.join(', ')}` })
    }
  }

  for (const feature of features.filter((item) => item.geometryType === 'LineString')) {
    const groupName = propertyText(feature.properties, ['datasetName', 'groupName', 'layerName', 'category'])
    const startRef = propertyText(feature.properties, ['startRef', 'sourceRef', 'fromRef'])
    const endRef = propertyText(feature.properties, ['endRef', 'targetRef', 'toRef'])

    for (const ref of [startRef, endRef].filter(Boolean)) {
      if (entityNames.size && !entityNames.has(ref) && !identifierMap.has(ref)) {
        issues.push({ level: 'warning', path: feature.path, message: `关联对象不存在：${ref}` })
      }
    }

    if (!groupName || feature.pairs.length < 2) continue
    const points = groupPoints.get(groupName) ?? []
    if (!points.length) continue
    const endpoints = [feature.pairs[0], feature.pairs[feature.pairs.length - 1]]
    endpoints.forEach((point, index) => {
      const hasNearbyPoint = points.some((item) => distance(item.point, point) <= 0.001)
      if (!hasNearbyPoint) {
        issues.push({
          level: 'warning',
          path: feature.path,
          message: `线要素${index === 0 ? '起点' : '终点'}附近未匹配到同组点要素`
        })
      }
    })
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
  const indexedFeatures: GeoFeatureIndexItem[] = []
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
    indexedFeatures.push({
      path,
      geometryType,
      properties: feature.properties && typeof feature.properties === 'object' ? feature.properties : {},
      pairs
    })

    if (!pairs.length && feature.geometry) {
      issues.push({ level: 'error', path: `${path}.geometry.coordinates`, message: '坐标为空或格式不正确' })
    }

    for (const [lng, lat] of pairs) {
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        issues.push({
          level: 'warning',
          path: `${path}.geometry.coordinates`,
          message: `坐标超出 WGS84 范围: ${lng}, ${lat}`
        })
      }
      bounds = updateBounds(bounds, lng, lat)
    }
  })

  const finalBounds = bounds as GeoBounds | null
  if (
    finalBounds &&
    (finalBounds.minLng < -180 || finalBounds.maxLng > 180 || finalBounds.minLat < -90 || finalBounds.maxLat > 90)
  ) {
    issues.push({
      level: 'warning',
      path: 'features.geometry.coordinates',
      message: '坐标范围超出 WGS84 经纬度，数据可能使用了投影坐标系，请确认坐标系后再分析'
    })
  }

  addGeoDataQualityIssues(indexedFeatures, issues)

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
