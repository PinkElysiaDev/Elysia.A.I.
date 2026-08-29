import { decodeResponsesResponse, encodeResponsesRequest, extractMessageText } from '@elysia-ai/protocol-responses'
import type { Provider, ProviderConfig, ProviderRequest, ProviderResponse } from './types.js'
import { createHttpProviderError, createProviderApiError, fetchWithTimeout, readResponseBody, normalizeResponsesFinishReason } from './utils.js'
import { toCanonicalRequest } from './canonical-bridge.js'

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
      const canonical = toCanonicalRequest(request, {
        model,
        maxTokens: request.maxTokens ?? maxTokens,
        temperature: request.temperature ?? temperature,
      })
      const timeout = request.timeoutMs ?? timeoutMs

      const url = `${fullBaseUrl}/responses`
      const body = encodeResponsesRequest(canonical)

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
        throw createHttpProviderError('Responses', config.id, res, responseBody)
      }

      const json = await res.json() as any

      if (json.error) {
        throw createProviderApiError('Responses', config.id, json)
      }

      const canonicalResponse = decodeResponsesResponse(json)
      let output = extractMessageText(canonicalResponse)
      if (!output && typeof (json as any).output_text === 'string') {
        output = (json as any).output_text
      }

      // status 是生命周期状态而非停止原因；截断/过滤须看 incomplete_details
      const finishReason = normalizeResponsesFinishReason(
        json.status,
        typeof json.incomplete_details === 'object' && json.incomplete_details !== null
          ? (json.incomplete_details as { reason?: unknown }).reason
          : undefined,
      )
      const latencyMs = Date.now() - startedAt

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
