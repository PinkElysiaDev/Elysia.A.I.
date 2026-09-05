import { decodeGenerateContentResponse, encodeGenerateContentRequest, extractMessageText } from '@elysia-ai/protocol-gemini'
import type { Provider, ProviderConfig, ProviderRequest, ProviderResponse } from './types.js'
import {
  createHttpProviderError,
  createProviderApiError,
  fetchWithTimeout,
  normalizeGeminiFinishReason,
  readResponseBody,
} from './utils.js'
import { toMaheshvaraRequest } from './maheshvara-bridge.js'

const DEFAULT_ENDPOINT = '/v1beta'

export function createGeminiProvider(config: ProviderConfig): Provider {
  if (!config.baseURL) {
    throw new Error(`gemini provider "${config.id}" requires baseURL`)
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
      type: 'gemini',
      model: config.model,
      endpoint: fullBaseUrl,
    },
    async execute(request: ProviderRequest): Promise<ProviderResponse> {
      const model = request.model ?? config.model
      const maheshvara = toMaheshvaraRequest(request, {
        model,
        maxTokens: request.maxTokens ?? maxTokens,
        temperature: request.temperature ?? temperature,
      })
      const timeout = request.timeoutMs ?? timeoutMs

      const url = `${fullBaseUrl}/models/${model}:generateContent?key=${config.apiKey}`
      const body = encodeGenerateContentRequest(maheshvara)

      const startedAt = Date.now()
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeout, config.id)

      if (!res.ok) {
        const responseBody = await readResponseBody(res)
        throw createHttpProviderError('Gemini', config.id, res, responseBody)
      }

      const json = await res.json() as any

      if (json.error) {
        throw createProviderApiError('Gemini', config.id, json, json.error.code)
      }

      const maheshvaraResponse = decodeGenerateContentResponse(json)
      const output = extractMessageText(maheshvaraResponse)
      const finishReason = normalizeGeminiFinishReason(maheshvaraResponse.stop_reason)
      const latencyMs = Date.now() - startedAt

      return {
        output,
        messages: [
          ...request.messages,
          { role: 'assistant', content: output },
        ],
        provider: {
          id: config.id,
          type: 'gemini',
          model,
          endpoint: fullBaseUrl,
        },
        usage: {
          inputTokens: maheshvaraResponse.usage?.input_tokens,
          outputTokens: maheshvaraResponse.usage?.output_tokens,
          totalTokens: maheshvaraResponse.usage?.total_tokens,
        },
        finishReason,
        latencyMs,
        metadata: {
          modelVersion: maheshvaraResponse.model,
          providerLatencyMs: latencyMs,
          latencyMs,
        },
      }
    },
  }
}
