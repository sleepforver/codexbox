import type {
  JsonMetadata,
  JsonQueryRequest,
  JsonQueryResponse,
  JsonTransformRequest,
  JsonTransformResponse
} from '../../../src/shared/ipc.js'

function readMetadata(parsed: unknown, output: string): JsonMetadata {
  const rootType = Array.isArray(parsed)
    ? 'array'
    : parsed !== null && typeof parsed === 'object'
      ? 'object'
      : 'primitive'
  const topLevelKeys =
    rootType === 'array'
      ? (parsed as unknown[]).length
      : rootType === 'object'
        ? Object.keys(parsed as Record<string, unknown>).length
        : 0

  return {
    rootType,
    characters: output.length,
    lines: output ? output.split(/\r?\n/).length : 0,
    topLevelKeys
  }
}

function parsePosition(message: string): { line?: number; column?: number } {
  const positionMatch = message.match(/position\s+(\d+)/i)

  if (!positionMatch) {
    return {}
  }

  return { column: Number(positionMatch[1]) + 1 }
}

export function handleJsonTransform(request: JsonTransformRequest): JsonTransformResponse {
  try {
    const parsed = JSON.parse(request.source)
    const indent = request.indent === 'tab' ? '\t' : request.indent
    const output =
      request.mode === 'validate'
        ? request.source
        : request.mode === 'minify'
          ? JSON.stringify(parsed)
          : JSON.stringify(parsed, null, indent)

    return {
      ok: true,
      output,
      metadata: readMetadata(parsed, output)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON 解析失败'

    return {
      ok: false,
      error: message,
      ...parsePosition(message)
    }
  }
}

function readPathValue(source: unknown, path: string): { matched: boolean; value: unknown } {
  const normalized = path.trim().replace(/^\$\.?/, '')

  if (!normalized) {
    return { matched: true, value: source }
  }

  const segments = normalized
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let current = source

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)

      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { matched: false, value: undefined }
      }

      current = current[index]
      continue
    }

    if (current !== null && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment]
      continue
    }

    return { matched: false, value: undefined }
  }

  return { matched: true, value: current }
}

export function handleJsonQuery(request: JsonQueryRequest): JsonQueryResponse {
  try {
    const parsed = JSON.parse(request.source)
    const result = readPathValue(parsed, request.path)

    if (!result.matched) {
      return { ok: true, matched: false, output: '未匹配到路径' }
    }

    return {
      ok: true,
      matched: true,
      output: typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2)
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'JSON 查询失败'
    }
  }
}
