/**
 * OpenAI Chat Completions wire 响应 → maheshvara。
 * 对齐 maheshvara_convert.go 的 OpenAIChatResponseToMaheshvara /
 * maheshvaraUsageFromOpenAIUsage。输入为 JSON.parse 的任意对象，
 * 全程防御式访问，不依赖 wire 结构体定义。
 */

import type { MaheshvaraContentPart, MaheshvaraOutputItem, MaheshvaraResponse, MaheshvaraUsage } from '@elysia-ai/maheshvara'
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
} from '@elysia-ai/maheshvara'
import {
  asArray,
  asRecord,
  firstNonEmptyString,
  interfaceToContentParts,
  intValue,
  stringValue,
} from '@elysia-ai/maheshvara'

function newMaheshvaraResponseID(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
}

/** OpenAI audio 值 → maheshvara audio 部件（Go openAIAudioValueToPart）。 */
function openAIAudioValueToPart(value: unknown): MaheshvaraContentPart | undefined {
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

function usageFromOpenAI(usage: Record<string, unknown> | undefined): MaheshvaraUsage | undefined {
  if (!usage) {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0, source: 'provider_response' }
  }
  // prompt 明细默认读 prompt_tokens_details；input_tokens_details 携带有效
  // 计数（cached/text）时优先生效——新式上游逐步迁移到该键。
  let promptDetails = asRecord(usage['prompt_tokens_details']) ?? {}
  const inputDetails = asRecord(usage['input_tokens_details'])
  if (inputDetails && (intValue(inputDetails['cached_tokens']) > 0 || intValue(inputDetails['text_tokens']) > 0)) {
    promptDetails = inputDetails
  }
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
    cache_creation_input_tokens: intValue(promptDetails['cached_creation_tokens']) || undefined,
    reasoning_tokens: intValue(completionDetails['reasoning_tokens']) || undefined,
    accepted_prediction_tokens: intValue(completionDetails['accepted_prediction_tokens']) || undefined,
    rejected_prediction_tokens: intValue(completionDetails['rejected_prediction_tokens']) || undefined,
    // 模态拆分（XF5 批次）：文本/音频/图像 token 的输入输出分桶。
    text_input_tokens: intValue(promptDetails['text_tokens']) || undefined,
    audio_input_tokens: intValue(promptDetails['audio_tokens']) || undefined,
    image_input_tokens: intValue(promptDetails['image_tokens']) || undefined,
    text_output_tokens: intValue(completionDetails['text_tokens']) || undefined,
    audio_output_tokens: intValue(completionDetails['audio_tokens']) || undefined,
    image_output_tokens: intValue(completionDetails['image_tokens']) || undefined,
    // 完整原始对象透传（Go RawFields）：上游新增计数键在跨协议中转不丢失。
    raw: usage,
    source: 'provider_response',
  }
}

/**
 * OpenRouter 风格 reasoning_details 逐条解析为推理 parts（每条一 part，
 * 不合并不去重）：text/summary 走明文，encrypted_content/data 走密文
 * （签发方记为 openai）。
 */
export function openAIReasoningDetailsToParts(raw: unknown): MaheshvaraContentPart[] {
  const parts: MaheshvaraContentPart[] = []
  for (const item of asArray(raw) ?? []) {
    const detail = asRecord(item)
    if (!detail) continue
    const text = firstNonEmptyString(stringValue(detail['text']), stringValue(detail['summary']))
    const encrypted = firstNonEmptyString(stringValue(detail['encrypted_content']), stringValue(detail['data']))
    if (text === '' && encrypted === '') continue
    const part: MaheshvaraContentPart = { type: CONTENT_REASONING, raw: detail, thought: true }
    if (text !== '') {
      part.text = text
      part.reasoning_text = text
    }
    if (encrypted !== '') {
      part.encrypted_content = encrypted
      part.encrypted_provider = 'openai'
    }
    parts.push(part)
  }
  return parts
}

/** Chat Completions 响应（JSON.parse 产物）→ maheshvara 响应。 */
export function decodeChatCompletionsResponse(body: unknown): MaheshvaraResponse {
  const raw = asRecord(body)
  if (!raw) throw new Error('nil OpenAI response')

  const out: MaheshvaraResponse = {
    id: stringValue(raw['id']),
    model: stringValue(raw['model']),
    created_at: intValue(raw['created']),
    status: 'completed',
    system_fingerprint: stringValue(raw['system_fingerprint']) || undefined,
    output: [],
    usage: usageFromOpenAI(asRecord(raw['usage'])),
  }

  const choices = asArray(raw['choices']) ?? []
  if (choices.length > 0) {
    const choice = asRecord(choices[0])
    if (choice) {
      const message = asRecord(choice['message']) ?? {}
      const item: MaheshvaraOutputItem = {
        id: newMaheshvaraResponseID('msg'),
        type: OUTPUT_MESSAGE,
        status: 'completed',
        role: stringValue(message['role']) || 'assistant',
        content: interfaceToContentParts(message['content']),
      }
      for (const part of item.content ?? []) {
        if (part.type === CONTENT_REASONING) {
          out.output?.push({
            id: newMaheshvaraResponseID('rs'), type: OUTPUT_REASONING, status: 'completed',
            content: [part],
          })
        }
      }
      const reasoningContent = stringValue(message['reasoning_content'])
      if (reasoningContent !== '') {
        out.output?.push({
          id: newMaheshvaraResponseID('rs'), type: OUTPUT_REASONING, status: 'completed',
          content: [{ type: CONTENT_REASONING, text: reasoningContent, reasoning_text: reasoningContent }],
        })
      }
      // OpenRouter 风格推理明细：每条一 item（不合并不去重），密文带签发方。
      for (const part of openAIReasoningDetailsToParts(message['reasoning_details'])) {
        out.output?.push({
          id: newMaheshvaraResponseID('rs'), type: OUTPUT_REASONING, status: 'completed',
          content: [part],
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
export function extractMessageText(response: MaheshvaraResponse): string {
  let out = ''
  for (const item of response.output ?? []) {
    if (item.type !== OUTPUT_MESSAGE) continue
    for (const part of item.content ?? []) {
      if (part.type === CONTENT_TEXT) out += part.text ?? ''
    }
  }
  return out
}

export { usageFromOpenAI, openAIAudioValueToPart, newMaheshvaraResponseID, CONTENT_IMAGE }
