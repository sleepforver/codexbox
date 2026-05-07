import type {
  AiConnectionResponse,
  AiGenerateTextResponse,
  ApiSendResponse,
  GeoAnalyzeResponse,
  GitActionResponse,
  GitCommitResponse,
  GitCommandResponse,
  JsonQueryResponse,
  JsonTransformResponse
} from '../shared/ipc'

export function isAiGenerateTextError(
  result: AiGenerateTextResponse
): result is { ok: false; text: string; error: string; model?: string } {
  return result.ok === false
}

export function isAiConnectionError(result: AiConnectionResponse): result is { ok: false; model?: string; error: string } {
  return result.ok === false
}

export function isApiSendError(
  result: ApiSendResponse
): result is { ok: false; requestId: string; durationMs: number; error: string } {
  return result.ok === false
}

export function isGitActionError(
  result: GitActionResponse
): result is { ok: false; action: GitActionResponse['action']; path: string; output: string; error: string } {
  return result.ok === false
}

export function isGitCommitError(result: GitCommitResponse): result is { ok: false; output: string; error: string } {
  return result.ok === false
}

export function isGitCommandError(result: GitCommandResponse): result is Extract<GitCommandResponse, { ok: false }> {
  return result.ok === false
}

export function isJsonTransformError(result: JsonTransformResponse): result is Extract<JsonTransformResponse, { ok: false }> {
  return result.ok === false
}

export function isJsonQueryError(result: JsonQueryResponse): result is Extract<JsonQueryResponse, { ok: false }> {
  return result.ok === false
}

export function isGeoAnalyzeError(result: GeoAnalyzeResponse): result is Extract<GeoAnalyzeResponse, { ok: false }> {
  return result.ok === false
}
