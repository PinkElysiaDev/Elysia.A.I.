/**
 * OpenAI Chat Completions wire 响应 → canonical。
 * 对齐 canonical_convert.go 的 OpenAIChatResponseToCanonical /
 * canonicalUsageFromOpenAIUsage。输入为 JSON.parse 的任意对象，
 * 全程防御式访问，不依赖 wire 结构体定义。
 */

import type { CanonicalContentPart, CanonicalOutputItem, CanonicalResponse, CanonicalUsage } from '@elysia-ai/canonical'
import {
  CONTENT_AUDIO,
  CONTENT_IMAGE,
  CONTENT_REASONING,
  CONTENT_REFUSAL,
  CONTENT_TEXT,
  OUTPUT_FUNCTION_CALL,
  OUTPUT_MESSAGE,
  OUTPUT_REASONING,
  SIGNATURE_PROVIDER_GEMINI,
  TOOL_FUNCTION,
} from '@elysia-ai/canonical'
import {
  asArray,
  asRecord,
  firstNonEmptyString,
  interfaceToContentParts,
  intValue,
  stringValue,
} from '@elysia-ai/canonical'

function newCanonicalResponseID(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
}

/** OpenAI audio 值 → canonical audio 部件（Go openAIAudioValueToPart）。 */
function openAIAudioValueToPart(value: unknown): CanonicalContentPart | undefined {
  const object = asRecord(value)
  if (!object) return undefined
  const data = firstNonEmptyString(stringValue(object['data']), stringValue(object['audio_data']), stringValue(object['base64']))
  const url = firstNonEmptyString(stringValue(object['url']), stringValue(object['audio_url']))
  const transcript = stringValue(object['transcript'])
  if (data === '' && url === '' && transcript === '') return undefined
  return {
    type: CONTENT_AUDIO,
    audio_url: url,
    audio_base64: data,
    data,
    text: transcript,
    media_type: firstNonEmptyString(stringValue(object['format']), stringValue(object['mime_type']), stringValue(object['mimeType'])),
    raw: object,
  }
}

function usageFromOpenAI(usage: Record<string, unknown> | undefined): CanonicalUsage | undefined {
  if (!usage) {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0, source: 'provider_response' }
  }
  const promptDetails = asRecord(usage['prompt_tokens_details']) ?? asRecord(usage['input_tokens_details']) ?? {}
  const completionDetails = asRecord(usage['completion_tokens_details']) ?? {}
  const inputTokens = intValue(usage['prompt_tokens'])
  const outputTokens = intValue(usage['completion_tokens'])
  const cachedFromTop = Math.max(intValue(usage['cached_tokens']), intValue(usage['prompt_cache_hit_tokens']))
  let cached = cachedFromTop
  if (cached === 0) {
    cached = Math.max(intValue(promptDetails['cached_tokens']), intValue(promptDetails['cache_read_tokens']))
  }
  const total = intValue(usage['total_tokens']) || inputTokens + outputTokens
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: total,
    cached_input_tokens: cached || undefined,
    reasoning_tokens: intValue(completionDetails['reasoning_tokens']) || undefined,
    accepted_prediction_tokens: intValue(completionDetails['accepted_prediction_tokens']) || undefined,
    rejected_prediction_tokens: intValue(completionDetails['rejected_prediction_tokens']) || undefined,
    source: 'provider_response',
  }
}

/** Chat Completions 响应（JSON.parse 产物）→ canonical 响应。 */
export function decodeChatCompletionsResponse(body: unknown): CanonicalResponse {
  const raw = asRecord(body)
  if (!raw) throw new Error('nil OpenAI response')

  const out: CanonicalResponse = {
    id: stringValue(raw['id']),
    model: stringValue(raw['model']),
    created_at: intValue(raw['created']),
    status: 'completed',
    output: [],
    usage: usageFromOpenAI(asRecord(raw['usage'])),
  }

  const choices = asArray(raw['choices']) ?? []
  if (choices.length > 0) {
    const choice = asRecord(choices[0])
    if (choice) {
      const message = asRecord(choice['message']) ?? {}
      const item: CanonicalOutputItem = {
        id: newCanonicalResponseID('msg'),
        type: OUTPUT_MESSAGE,
        status: 'completed',
        role: stringValue(message['role']) || 'assistant',
        content: interfaceToContentParts(message['content']),
      }
      for (const part of item.content ?? []) {
        if (part.type === CONTENT_REASONING) {
          out.output?.push({
            id: newCanonicalResponseID('rs'), type: OUTPUT_REASONING, status: 'completed',
            content: [part],
          })
        }
      }
      const reasoningContent = stringValue(message['reasoning_content'])
      if (reasoningContent !== '') {
        out.output?.push({
          id: newCanonicalResponseID('rs'), type: OUTPUT_REASONING, status: 'completed',
          content: [{ type: CONTENT_REASONING, text: reasoningContent, reasoning_text: reasoningContent }],
        })
      }
      const refusal = stringValue(message['refusal'])
      if (refusal !== '') {
        item.content?.push({ type: CONTENT_REFUSAL, text: refusal })
      }
      const audioPart = openAIAudioValueToPart(message['audio'])
      if (audioPart) item.content?.push(audioPart)
      out.output?.push(item)
      for (const callValue of asArray(message['tool_calls']) ?? []) {
        const call = asRecord(callValue)
        if (!call) continue
        const fn = asRecord(call['function']) ?? {}
        const argumentsText = stringValue(fn['arguments'])
        let thoughtSignature = ''
        const extra = asRecord(call['extra_content'])
        const google = extra ? asRecord(extra['google']) : undefined
        thoughtSignature = firstNonEmptyString(
          google ? stringValue(google['thought_signature']) : '',
          stringValue(call['thought_signature']),
        )
        out.output?.push({
          id: stringValue(call['id']),
          type: OUTPUT_FUNCTION_CALL,
          status: 'completed',
          call_id: stringValue(call['id']),
          name: stringValue(fn['name']),
          arguments: argumentsText || undefined,
          tool_calls: [{
            id: stringValue(call['id']),
            type: TOOL_FUNCTION,
            name: stringValue(fn['name']),
            arguments: argumentsText || undefined,
            arguments_text: argumentsText,
            thought_signature: thoughtSignature || undefined,
            thought_signature_provider: thoughtSignature !== '' ? SIGNATURE_PROVIDER_GEMINI : undefined,
            raw: call,
          }],
        })
      }
      out.stop_reason = stringValue(choice['finish_reason']) || undefined
    }
  }
  return out
}

/** 提取全部消息文本（网关 output 用）。 */
export function extractMessageText(response: CanonicalResponse): string {
  let out = ''
  for (const item of response.output ?? []) {
    if (item.type !== OUTPUT_MESSAGE) continue
    for (const part of item.content ?? []) {
      if (part.type === CONTENT_TEXT) out += part.text ?? ''
    }
  }
  return out
}

export { usageFromOpenAI, openAIAudioValueToPart, newCanonicalResponseID, CONTENT_IMAGE }
