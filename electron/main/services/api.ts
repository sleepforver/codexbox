import { randomUUID } from 'node:crypto'
import type { ApiSendRequest, ApiSendResponse, HeaderPair } from '../../../src/shared/ipc.js'
import { readAppSettings } from './settings.js'

function normalizeHeaders(headers: HeaderPair[]): Record<string, string> {
  return Object.fromEntries(
    headers.filter((header) => header.key.trim()).map((header) => [header.key.trim(), header.value])
  )
}

function formatBody(body: string, contentType: string): { body: string; isJson: boolean } {
  const looksJson = contentType.includes('application/json') || contentType.includes('+json')

  if (!looksJson) {
    return { body, isJson: false }
  }

  try {
    return { body: JSON.stringify(JSON.parse(body), null, 2), isJson: true }
  } catch {
    return { body, isJson: false }
  }
}

export async function handleApiSend(request: ApiSendRequest): Promise<ApiSendResponse> {
  const startedAt = performance.now()
  const requestId = randomUUID()
  const controller = new AbortController()
  const settings = await readAppSettings()
  const requestError = validateRequest(request)

  if (requestError) {
    return { ok: false, requestId, durationMs: 0, error: requestError }
  }

  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? settings.apiTimeoutMs, 1000), 120000)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: normalizeHeaders(request.headers),
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      signal: controller.signal
    })
    const rawBody = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    const formatted = settings.autoFormatJsonResponse
      ? formatBody(rawBody, contentType)
      : { body: rawBody, isJson: false }

    return {
      ok: true,
      requestId,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      headers: Object.fromEntries(response.headers.entries()),
      body: formatted.body,
      metadata: {
        contentType,
        sizeBytes: new TextEncoder().encode(rawBody).length,
        isJson: formatted.isJson
      }
    }
  } catch (error) {
    return {
      ok: false,
      requestId,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : '请求失败'
    }
  } finally {
    clearTimeout(timeout)
  }
}

function validateRequest(request: ApiSendRequest): string | null {
  try {
    const parsed = new URL(request.url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '仅支持 HTTP/HTTPS 请求'
    }
  } catch {
    return 'URL 格式不正确'
  }

  if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs < 1000)) {
    return '超时时间不能小于 1000ms'
  }

  return null
}
