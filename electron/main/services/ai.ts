import OpenAI from 'openai'
import type {
  AiConfigResponse,
  AiConnectionResponse,
  AiGenerateTextStreamRequest,
  AiGenerateTextRequest,
  AiGenerateTextResponse,
  AiStreamEvent,
  AiTaskType
} from '../../../src/shared/ipc.js'
import { readAiRuntimeConfig } from './settings.js'

const promptTemplates: Record<AiTaskType, string> = {
  'explain-code': '你是一位资深软件开发工程师。请用中文解释代码的意图、关键流程、潜在风险和可改进点，回答要结构清晰。',
  'generate-code':
    '你是一位资深软件开发工程师。请根据需求生成清晰、可维护的 TypeScript 代码，并补充使用说明和注意事项。',
  'git-summary':
    '你是一位资深软件开发工程师。请根据 Git diff 用中文总结本次变更，按功能变化、风险点、建议验证三段输出。',
  'commit-message':
    '你是一位资深软件开发工程师。请根据 Git diff 生成简洁规范的 commit message，包含一行标题和必要的正文说明。',
  'api-debug': '你是一位资深软件开发工程师。请根据 API 请求和响应错误，用中文给出排查步骤、可能原因和下一步建议。'
}

const activeStreams = new Map<string, AbortController>()

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { status?: unknown; code?: unknown }
  if (typeof value.status === 'number') return value.status
  if (typeof value.code === 'number') return value.code
  if (typeof value.code === 'string' && /^\d+$/.test(value.code)) return Number(value.code)
  return undefined
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const value = error as { code?: unknown; type?: unknown; name?: unknown }
  return [value.code, value.type, value.name].filter((item) => typeof item === 'string').join(' ')
}

function formatAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const status = getErrorStatus(error)
  const code = getErrorCode(error)
  const errorText = `${status ?? ''} ${code} ${message}`.trim()

  if (status === 401 || /401|unauthorized|invalid api key/i.test(errorText)) {
    return 'SiliconFlow 鉴权失败：请确认设置页保存的是有效的 SILICONFLOW_API_KEY，并且没有使用 OpenAI 或其他平台的 Key。'
  }

  if (status === 403 || /403|forbidden|permission/i.test(errorText)) {
    return 'SiliconFlow 权限不足：当前 API Key 无权访问该模型或服务，请检查账号权限、余额和模型访问范围。'
  }

  if (status === 404 || /404|model.*not.*found|not found/i.test(errorText)) {
    return 'SiliconFlow 模型不存在或不可用：请在设置页确认模型名称是否正确，或切换为账号可用的模型。'
  }

  if (status === 429 || /429|rate limit|too many requests|quota/i.test(errorText)) {
    return 'SiliconFlow 请求过于频繁或额度受限：请稍后重试，或检查账号额度、并发限制和计费状态。'
  }

  if (status && status >= 500) {
    return `SiliconFlow 服务端异常（${status}）：请稍后重试；如果持续失败，请检查 SiliconFlow 服务状态。`
  }

  if (/timeout|timed out|aborted|aborterror|etimedout/i.test(errorText)) {
    return 'SiliconFlow 请求超时：请检查网络连接，或在设置页适当增大 API 请求超时时间。'
  }

  if (/enotfound|econnreset|econnrefused|network|fetch failed|getaddrinfo/i.test(errorText)) {
    return '无法连接 SiliconFlow：请检查网络、代理、防火墙，以及 SILICONFLOW_BASE_URL 是否正确。'
  }

  if (status === 400 || /400|bad request|invalid_request/i.test(errorText)) {
    return `SiliconFlow 请求参数错误：请检查模型名称、Prompt 内容和请求格式。原始信息：${message}`
  }

  return message || '硅基流动 API 调用失败'
}

export async function readAiConfig(): Promise<AiConfigResponse> {
  const config = await readAiRuntimeConfig()

  return {
    hasApiKey: Boolean(config.apiKey),
    model: config.model
  }
}

export async function handleAiGenerateText(request: AiGenerateTextRequest): Promise<AiGenerateTextResponse> {
  const config = await readAiRuntimeConfig()

  if (!config.apiKey) {
    return { ok: false, text: '', model: config.model, error: '未配置 SILICONFLOW_API_KEY' }
  }

  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs
    })
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: promptTemplates[request.taskType] },
        { role: 'user', content: request.prompt }
      ],
      temperature: 0.3
    })

    return {
      ok: true,
      text: response.choices[0]?.message?.content || '',
      model: config.model
    }
  } catch (error) {
    return {
      ok: false,
      text: '',
      model: config.model,
      error: formatAiError(error)
    }
  }
}

export async function handleAiGenerateTextStream(
  request: AiGenerateTextStreamRequest,
  onEvent: (event: AiStreamEvent) => void
): Promise<void> {
  const config = await readAiRuntimeConfig()

  if (!config.apiKey) {
    onEvent({ type: 'error', requestId: request.requestId, model: config.model, error: '未配置 SILICONFLOW_API_KEY' })
    return
  }

  const controller = new AbortController()
  activeStreams.set(request.requestId, controller)

  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs
    })
    const stream = await client.chat.completions.create(
      {
        model: config.model,
        messages: [
          { role: 'system', content: promptTemplates[request.taskType] },
          { role: 'user', content: request.prompt }
        ],
        temperature: 0.3,
        stream: true
      },
      { signal: controller.signal }
    )

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content
      if (text) {
        onEvent({ type: 'chunk', requestId: request.requestId, text })
      }
    }

    onEvent({ type: 'done', requestId: request.requestId, model: config.model })
  } catch (error) {
    if (controller.signal.aborted) {
      onEvent({ type: 'canceled', requestId: request.requestId })
      return
    }

    onEvent({
      type: 'error',
      requestId: request.requestId,
      model: config.model,
      error: formatAiError(error)
    })
  } finally {
    activeStreams.delete(request.requestId)
  }
}

export function cancelAiStream(requestId: string): void {
  activeStreams.get(requestId)?.abort()
  activeStreams.delete(requestId)
}

export async function handleAiTestConnection(): Promise<AiConnectionResponse> {
  const config = await readAiRuntimeConfig()

  if (!config.apiKey) {
    return {
      ok: false,
      model: config.model,
      baseURL: config.baseURL,
      error: '未配置 SILICONFLOW_API_KEY：请在 .env 或设置页保存硅基流动 API Key。'
    }
  }

  const startedAt = Date.now()
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs
    })
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: '你是资深软件开发工程师。请用中文简短回答。' },
        { role: 'user', content: '请回复：模型连接正常。' }
      ],
      temperature: 0
    })

    return {
      ok: true,
      model: config.model,
      baseURL: config.baseURL,
      durationMs: Date.now() - startedAt,
      text: response.choices[0]?.message?.content || '模型连接正常。'
    }
  } catch (error) {
    return {
      ok: false,
      model: config.model,
      baseURL: config.baseURL,
      durationMs: Date.now() - startedAt,
      error: formatAiError(error)
    }
  }
}
