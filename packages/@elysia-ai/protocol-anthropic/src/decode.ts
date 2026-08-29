/**
 * Anthropic Messages wire 响应 → canonical。
 * 对齐 canonical_convert.go 的 ClaudeResponseToCanonical / canonicalUsageFromClaudeUsage，
 * 以及 maheshvara_extensions.go 的 claudeImageBlockToPart / claudeDocumentBlockToPart /
 * claudeMediaBlockToPart。
 */

import type { CanonicalContentPart, CanonicalOutputItem, CanonicalResponse, CanonicalUsage } from '@elysia-ai/canonical'
import {
  CONTENT_AUDIO,
  CONTENT_DOCUMENT,
  CONTENT_FILE,
  CONTENT_IMAGE,
  CONTENT_REASONING,
  CONTENT_TEXT,
  CONTENT_TOOL_OUTPUT,
  CONTENT_VIDEO,
  OUTPUT_FUNCTION_CALL,
  OUTPUT_MESSAGE,
  OUTPUT_REASONING,
  SIGNATURE_PROVIDER_ANTHROPIC,
  SIGNATURE_PROVIDER_MAHESHVARA,
} from '@elysia-ai/canonical'
import {
  asArray,
  asRecord,
  contentValueToString,
  decodeMaheshvaraReasoningEnvelope,
  firstNonEmptyString,
  intValue,
  stringValue,
} from '@elysia-ai/canonical'

function newCanonicalResponseID(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
}

/** Claude image block（{"source":{...}}）→ canonical 图片部件。 */
export function claudeImageBlockToPart(block: Record<string, unknown>): CanonicalContentPart {
  const part: CanonicalContentPart = { type: CONTENT_IMAGE, raw: block }
  const source = asRecord(block['source'])
  if (!source) return part
  switch (stringValue(source['type'])) {
    case 'base64':
      part.media_type = firstNonEmptyString(stringValue(source['media_type']), stringValue(source['mimeType']))
      part.image_base64 = stringValue(source['data'])
      break
    case 'url':
      part.image_url = stringValue(source['url'])
      break
    default: {
      // 未声明 type 时从字段推断（data→base64，url→url）。
      const data = stringValue(source['data'])
      if (data !== '') {
        part.media_type = firstNonEmptyString(stringValue(source['media_type']), stringValue(source['mimeType']))
        part.image_base64 = data
      } else {
        const uri = stringValue(source['url'])
        if (uri !== '') part.image_url = uri
      }
    }
  }
  return part
}

export function claudeDocumentBlockToPart(block: Record<string, unknown>): CanonicalContentPart {
  const part: CanonicalContentPart = { type: CONTENT_DOCUMENT, raw: block }
  const source = asRecord(block['source'])
  if (source) {
    part.media_type = firstNonEmptyString(stringValue(source['media_type']), stringValue(source['mimeType']))
    part.mime_type = part.media_type
    part.file_data = stringValue(source['data'])
    part.file_id = stringValue(source['file_id'])
    part.file_name = stringValue(source['filename'])
    part.uri = firstNonEmptyString(stringValue(source['url']), stringValue(source['file_uri']))
  }
  part.file_name = firstNonEmptyString(part.file_name ?? '', stringValue(block['name']), stringValue(block['filename']))
  return part
}

export function claudeMediaBlockToPart(block: Record<string, unknown>, partType: string): CanonicalContentPart {
  const part: CanonicalContentPart = { type: partType, raw: block }
  const source = asRecord(block['source'])
  if (source) {
    part.media_type = firstNonEmptyString(stringValue(source['media_type']), stringValue(source['mimeType']))
    part.mime_type = part.media_type
    part.data = stringValue(source['data'])
    part.uri = firstNonEmptyString(stringValue(source['url']), stringValue(source['file_uri']))
  }
  return part
}

function usageFromClaude(usage: Record<string, unknown> | undefined): CanonicalUsage | undefined {
  if (!usage) {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0, source: 'provider_response' }
  }
  const cacheCreation = asRecord(usage['cache_creation']) ?? {}
  const input = intValue(usage['input_tokens'])
    + intValue(usage['cache_read_input_tokens'])
    + intValue(usage['cache_creation_input_tokens'])
    + intValue(cacheCreation['ephemeral_5m_input_tokens'])
    + intValue(cacheCreation['ephemeral_1h_input_tokens'])
  const output = intValue(usage['output_tokens'])
  const serverToolUse = asRecord(usage['server_tool_use'])
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    cached_input_tokens: intValue(usage['cache_read_input_tokens']) || undefined,
    cache_creation_input_tokens: intValue(usage['cache_creation_input_tokens']) || undefined,
    web_search_call_count: serverToolUse ? intValue(serverToolUse['web_search_requests']) || undefined : undefined,
    source: 'provider_response',
  }
}

/** Anthropic Messages 响应（JSON.parse 产物）→ canonical 响应。 */
export function decodeMessagesResponse(body: unknown): CanonicalResponse {
  const raw = asRecord(body)
  if (!raw) throw new Error('nil Claude response')

  const out: CanonicalResponse = {
    id: stringValue(raw['id']),
    model: stringValue(raw['model']),
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    output: [],
    stop_reason: stringValue(raw['stop_reason']) || undefined,
    usage: usageFromClaude(asRecord(raw['usage'])),
  }
  const msg: CanonicalOutputItem = { id: stringValue(raw['id']), type: OUTPUT_MESSAGE, status: 'completed', role: 'assistant', content: [] }
  for (const blockValue of asArray(raw['content']) ?? []) {
    const block = asRecord(blockValue)
    if (!block) continue
    switch (stringValue(block['type'])) {
      case 'text':
        msg.content?.push({ type: CONTENT_TEXT, text: stringValue(block['text']), raw: block })
        break
      case 'thinking': {
        const part: CanonicalContentPart = {
          type: CONTENT_REASONING,
          reasoning_text: stringValue(block['thinking']),
          text: stringValue(block['thinking']),
          signature: stringValue(block['signature']) || undefined,
          signature_provider: SIGNATURE_PROVIDER_ANTHROPIC,
        }
        const envelope = decodeMaheshvaraReasoningEnvelope(stringValue(block['signature']))
        if (envelope) {
          part.signature = undefined
          part.signature_provider = SIGNATURE_PROVIDER_MAHESHVARA
          part.encrypted_content = envelope.encrypted_content
          part.reasoning_summary = envelope.summary
          if (!part.text) {
            part.text = envelope.text ?? ''
            part.reasoning_text = envelope.text ?? ''
          }
        }
        out.output?.push({
          id: newCanonicalResponseID('rs'),
          type: OUTPUT_REASONING,
          status: 'completed',
          content: [part],
        })
        break
      }
      case 'redacted_thinking': {
        const envelope = decodeMaheshvaraReasoningEnvelope(stringValue(block['data']))
        if (envelope) {
          out.output?.push({
            id: newCanonicalResponseID('rs'), type: OUTPUT_REASONING, status: 'completed',
            content: [{
              type: CONTENT_REASONING, text: envelope.text ?? '', reasoning_text: envelope.text ?? '',
              signature_provider: SIGNATURE_PROVIDER_MAHESHVARA,
              encrypted_content: envelope.encrypted_content, reasoning_summary: envelope.summary,
            }],
          })
        }
        break
      }
      case 'tool_use':
        out.output?.push({
          id: stringValue(block['id']),
          type: OUTPUT_FUNCTION_CALL,
          status: 'completed',
          call_id: stringValue(block['id']),
          name: stringValue(block['name']),
          arguments: block['input'],
        })
        break
      case 'image':
        msg.content?.push(claudeImageBlockToPart({ type: 'image', source: block['source'] }))
        break
      case 'document':
      case 'file':
        msg.content?.push(claudeDocumentBlockToPart({ type: stringValue(block['type']), source: block['source'] }))
        break
      case 'tool_result':
        msg.content?.push({
          type: CONTENT_TOOL_OUTPUT,
          tool_call_id: stringValue(block['tool_use_id']),
          tool_output: contentValueToString(block['content']),
          raw: block,
        })
        break
    }
  }
  if ((msg.content?.length ?? 0) > 0) {
    out.output?.unshift(msg)
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

export { usageFromClaude, CONTENT_AUDIO, CONTENT_VIDEO, CONTENT_FILE }
