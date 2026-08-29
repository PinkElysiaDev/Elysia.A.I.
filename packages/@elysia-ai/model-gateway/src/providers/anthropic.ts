import { decodeMessagesResponse, encodeMessagesRequest, extractMessageText } from '@elysia-ai/protocol-anthropic'
import type { Provider, ProviderConfig, ProviderRequest, ProviderResponse } from './types.js'
import {
  createHttpProviderError,
  createProviderApiError,
  fetchWithTimeout,
  normalizeClaudeFinishReason,
  readResponseBody,
} from './utils.js'
import { toCanonicalRequest } from './canonical-bridge.js'

const DEFAULT_ENDPOINT = '/v1'

export function createAnthropicProvider(config: ProviderConfig): Provider {
  if (!config.baseURL) {
    throw new Error(`anthropic provider "${config.id}" requires baseURL`)
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
      type: 'anthropic',
      model: config.model,
      endpoint: fullBaseUrl,
    },
    async execute(request: ProviderRequest): Promise<ProviderResponse> {
      const model = request.model ?? config.model
      const canonical = toCanonicalRequest(request, {
        model,
        maxTokens: request.maxTokens ?? maxTokens,
        temperature: request.temperature ?? temperature,
      })
      const timeout = request.timeoutMs ?? timeoutMs

      const url = `${fullBaseUrl}/messages`
      const body = encodeMessagesRequest(canonical)

      const startedAt = Date.now()
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }, timeout, config.id)

      if (!res.ok) {
        const responseBody = await readResponseBody(res)
        throw createHttpProviderError('Claude', config.id, res, responseBody)
      }

      const json = await res.json() as any

      if (json.error) {
        throw createProviderApiError('Claude', config.id, json)
      }

      const canonicalResponse = decodeMessagesResponse(json)
      const output = extractMessageText(canonicalResponse)
      const finishReason = normalizeClaudeFinishReason(canonicalResponse.stop_reason)
      const latencyMs = Date.now() - startedAt

      return {
        output,
        messages: [
          ...request.messages,
          { role: 'assistant', content: output },
        ],
        provider: {
          id: config.id,
          type: 'anthropic',
          model: canonicalResponse.model || model,
          endpoint: fullBaseUrl,
        },
        usage: {
          inputTokens: canonicalResponse.usage?.input_tokens,
          outputTokens: canonicalResponse.usage?.output_tokens,
          totalTokens: canonicalResponse.usage?.total_tokens,
        },
        finishReason,
        latencyMs,
        metadata: {
          responseId: canonicalResponse.id,
          model: canonicalResponse.model,
          providerLatencyMs: latencyMs,
          latencyMs,
        },
      }
    },
  }
}
