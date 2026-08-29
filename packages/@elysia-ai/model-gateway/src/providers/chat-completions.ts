import { decodeChatCompletionsResponse, encodeChatCompletionsRequest, extractMessageText } from '@elysia-ai/protocol-openai'
import type { Provider, ProviderConfig, ProviderRequest, ProviderResponse } from './types.js'
import { createHttpProviderError, createProviderApiError, fetchWithTimeout, readResponseBody } from './utils.js'
import { toCanonicalRequest } from './canonical-bridge.js'

const DEFAULT_ENDPOINT = '/v1'

export function createChatCompletionsProvider(config: ProviderConfig): Provider {
  if (!config.baseURL) {
    throw new Error(`chat-completions provider "${config.id}" requires baseURL`)
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
      type: 'chat-completions',
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

      const url = `${fullBaseUrl}/chat/completions`
      const body = encodeChatCompletionsRequest(canonical)

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
        const responseBody = await readResponseBody(res)
        throw createHttpProviderError('Chat Completions', config.id, res, responseBody)
      }

      const json = await res.json() as any

      if (json.error) {
        throw createProviderApiError('Chat Completions', config.id, json)
      }

      const canonicalResponse = decodeChatCompletionsResponse(json)
      const output = extractMessageText(canonicalResponse)
      const finishReason = canonicalResponse.stop_reason ?? 'unknown'
      const latencyMs = Date.now() - startedAt

      return {
        output,
        messages: [
          ...request.messages,
          { role: 'assistant', content: output },
        ],
        provider: {
          id: config.id,
          type: 'chat-completions',
          model,
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
          latencyMs,
        },
      }
    },
  }
}
