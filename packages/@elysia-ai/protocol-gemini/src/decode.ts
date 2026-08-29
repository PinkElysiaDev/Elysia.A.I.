/**
 * Gemini generateContent wire 响应 → canonical。
 * 对齐 canonical_convert.go 的 GeminiResponseToCanonical / canonicalUsageFromGeminiUsage。
 */

import type { CanonicalOutputItem, CanonicalResponse, CanonicalUsage } from '@elysia-ai/canonical'
import {
  CONTENT_FILE,
  CONTENT_IMAGE,
  CONTENT_REASONING,
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
  intValue,
  stringValue,
} from '@elysia-ai/canonical'

function newCanonicalResponseID(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
}

function usageFromGemini(usage: Record<string, unknown> | undefined): CanonicalUsage | undefined {
  if (!usage) {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0, source: 'provider_response' }
  }
  const input = intValue(usage['promptTokenCount']) + intValue(usage['toolUsePromptTokenCount'])
  const output = intValue(usage['candidatesTokenCount']) + intValue(usage['thoughtsTokenCount'])
  const total = intValue(usage['totalTokenCount']) || input + output
  const out: CanonicalUsage = {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    cached_input_tokens: intValue(usage['cachedContentTokenCount']) || undefined,
    reasoning_tokens: intValue(usage['thoughtsTokenCount']) || undefined,
    tool_use_tokens: intValue(usage['toolUsePromptTokenCount']) || undefined,
    source: 'provider_response',
  }
  for (const detailValue of asArray(usage['promptTokensDetails']) ?? []) {
    const detail = asRecord(detailValue)
    if (!detail) continue
    const count = intValue(detail['tokenCount'])
    switch (stringValue(detail['modality']).toUpperCase()) {
      case 'TEXT': out.text_input_tokens = (out.text_input_tokens ?? 0) + count; break
      case 'IMAGE': out.image_input_tokens = (out.image_input_tokens ?? 0) + count; break
      case 'AUDIO': out.audio_input_tokens = (out.audio_input_tokens ?? 0) + count; break
    }
  }
  for (const detailValue of asArray(usage['candidatesTokensDetails']) ?? []) {
    const detail = asRecord(detailValue)
    if (!detail) continue
    const count = intValue(detail['tokenCount'])
    switch (stringValue(detail['modality']).toUpperCase()) {
      case 'TEXT': out.text_output_tokens = (out.text_output_tokens ?? 0) + count; break
      case 'IMAGE': out.image_output_tokens = (out.image_output_tokens ?? 0) + count; break
      case 'AUDIO': out.audio_output_tokens = (out.audio_output_tokens ?? 0) + count; break
    }
  }
  return out
}

/** Gemini 响应（JSON.parse 产物）→ canonical 响应。 */
export function decodeGenerateContentResponse(body: unknown): CanonicalResponse {
  const raw = asRecord(body)
  if (!raw) throw new Error('nil Gemini response')

  const out: CanonicalResponse = {
    id: stringValue(raw['responseId']) || newCanonicalResponseID('gemini'),
    model: stringValue(raw['modelVersion']),
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    output: [],
    usage: usageFromGemini(asRecord(raw['usageMetadata'])),
  }
  const msg: CanonicalOutputItem = { id: newCanonicalResponseID('msg'), type: OUTPUT_MESSAGE, status: 'completed', role: 'assistant', content: [] }
  const candidates = asArray(raw['candidates']) ?? []
  if (candidates.length > 0) {
    const candidate = asRecord(candidates[0])
    if (candidate) {
      out.stop_reason = stringValue(candidate['finishReason']) || undefined
      const content = asRecord(candidate['content']) ?? {}
      for (const partValue of asArray(content['parts']) ?? []) {
        const part = asRecord(partValue)
        if (!part) continue
        const text = stringValue(part['text'])
        if (text !== '') {
          if (part['thought'] === true) {
            out.output?.push({
              id: newCanonicalResponseID('rs'), type: OUTPUT_REASONING, status: 'completed',
              content: [{
                type: CONTENT_REASONING, text, reasoning_text: text,
                signature: stringValue(part['thoughtSignature']) || undefined,
                signature_provider: SIGNATURE_PROVIDER_GEMINI,
              }],
            })
          } else {
            msg.content?.push({ type: CONTENT_TEXT, text })
          }
        }
        const functionCall = asRecord(part['functionCall'])
        if (functionCall) {
          const callID = stringValue(functionCall['id'])
          const name = stringValue(functionCall['name'])
          const argsJSON = JSON.stringify(functionCall['args'] ?? {})
          out.output?.push({
            id: newCanonicalResponseID('call'),
            type: OUTPUT_FUNCTION_CALL,
            status: 'completed',
            call_id: callID,
            name,
            arguments: argsJSON,
            tool_calls: [{
              id: callID, type: TOOL_FUNCTION, name, arguments: argsJSON,
              thought_signature: stringValue(part['thoughtSignature']) || undefined,
              thought_signature_provider: SIGNATURE_PROVIDER_GEMINI,
            }],
          })
        }
        const inlineData = asRecord(part['inlineData'])
        if (inlineData) {
          msg.content?.push({
            type: CONTENT_IMAGE,
            media_type: firstNonEmptyString(stringValue(inlineData['mimeType']), stringValue(inlineData['mime_type'])) || undefined,
            image_base64: stringValue(inlineData['data']),
          })
        }
        const fileData = asRecord(part['fileData'])
        if (fileData) {
          msg.content?.push({
            type: CONTENT_FILE,
            media_type: firstNonEmptyString(stringValue(fileData['mimeType']), stringValue(fileData['mime_type'])) || undefined,
            uri: firstNonEmptyString(stringValue(fileData['fileUri']), stringValue(fileData['file_uri'])) || undefined,
          })
        }
      }
    }
  }
  if ((msg.content?.length ?? 0) > 0) {
    out.output?.unshift(msg)
  }
  return out
}

/** 提取全部消息文本（网关 output 用；thought 部件不计入）。 */
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

export { usageFromGemini }
