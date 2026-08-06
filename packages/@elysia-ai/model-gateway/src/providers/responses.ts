import type { DialogueMessage } from '@elysia-ai/core'
import type { Provider, ProviderConfig, ProviderRequest, ProviderResponse } from './types.js'
import { ProviderError } from './types.js'

function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 429 || status >= 500
}

async function readErrorBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return ''
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number | undefined,
  providerId: string,
): Promise<Response> {
  if (!timeoutMs || timeoutMs <= 0) return fetch(url, init)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError(
        `Provider "${providerId}" request timed out after ${timeoutMs}ms`,
        providerId,
        undefined,
        undefined,
        {
          retryable: true,
          code: 'timeout',
          cause: error,
        },
      )
    }
    throw new ProviderError(
      `Provider "${providerId}" request failed: ${error instanceof Error ? error.message : String(error)}`,
      providerId,
      undefined,
      undefined,
      {
        retryable: true,
        code: 'network-error',
        cause: error,
      },
    )
  } finally {
    clearTimeout(timer)
  }
}

const DEFAULT_ENDPOINT = '/v1'

export function createResponsesProvider(config: ProviderConfig): Provider {
  if (!config.baseURL) {
    throw new Error(`responses provider "${config.id}" requires baseURL`)
  }

  const baseURL = config.baseURL.replace(/\/+$/, '')
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT
  const fullBaseUrl = `${baseURL}${endpoint}`

  const maxTokens = config.maxTokens ?? 4096
  const temperature = config.temperature ?? 0.7
  const timeoutMs = config.timeoutMs

  return {
    id: config.id,
    descriptor: {
      id: config.id,
      type: 'responses',
      model: config.model,
      endpoint: fullBaseUrl,
    },
    async execute(request: ProviderRequest): Promise<ProviderResponse> {
      const model = request.model ?? config.model
      const mt = request.maxTokens ?? maxTokens
      const temp = request.temperature ?? temperature
      const timeout = request.timeoutMs ?? timeoutMs

      const url = `${fullBaseUrl}/responses`

      const input = request.messages.map((m) => ({
        role: m.role as string,
        content: m.content,
      }))

      const body = {
        model,
        input,
        max_output_tokens: mt,
        temperature: temp,
      }

      const startedAt = Date.now()
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }, timeout, config.id)

      if (!res.ok) {
        const body = await readErrorBody(res)
        throw new ProviderError(
          `Responses API failed: ${res.status} ${res.statusText}`,
          config.id,
          res.status,
          body,
          {
            retryable: isRetryableStatus(res.status),
            code: `http-${res.status}`,
          },
        )
      }

      const json = await res.json() as any

      if (json.error) {
        throw new ProviderError(
          `Responses API error: ${json.error.message ?? JSON.stringify(json.error)}`,
          config.id,
          undefined,
          json,
          {
            retryable: true,
            code: 'api-error',
          },
        )
      }

      // Responses API: output is an array of output items
      let output = ''
      if (Array.isArray(json.output)) {
        for (const item of json.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content) {
              if (part.type === 'output_text') {
                output += part.text
              }
            }
          }
        }
      }

      if (!output && typeof json.output_text === 'string') {
        output = json.output_text
      }

      return {
        output,
        messages: [
          ...request.messages,
          { role: 'assistant', content: output },
        ],
        provider: {
          id: config.id,
          type: 'responses',
          model,
          endpoint: fullBaseUrl,
        },
        usage: {
          inputTokens: json.usage?.input_tokens,
          outputTokens: json.usage?.output_tokens,
          totalTokens: json.usage?.total_tokens,
        },
        finishReason: json.status ?? 'unknown',
        latencyMs: Date.now() - startedAt,
        metadata: {
          responseId: json.id,
          latencyMs: Date.now() - startedAt,
        },
      }
    },
  }
}
