/**
 * OpenAI Responses API wire 响应 → maheshvara。
 * 对齐 maheshvara_convert.go 的 ResponsesResponseToMaheshvara /
 * maheshvaraUsageFromResponsesUsage。
 */

import type { MaheshvaraOutputItem, MaheshvaraResponse, MaheshvaraUsage } from '@elysia-ai/maheshvara'
import {
  CONTENT_AUDIO,
  CONTENT_FILE,
  CONTENT_IMAGE,
  CONTENT_REASONING,
  CONTENT_REFUSAL,
  CONTENT_TEXT,
  OUTPUT_REASONING,
} from '@elysia-ai/maheshvara'
import {
  asArray,
  asRecord,
  contentValueToString,
  firstNonEmptyString,
  intValue,
  stringValue,
} from '@elysia-ai/maheshvara'

function usageFromResponses(usage: Record<string, unknown> | undefined): MaheshvaraUsage | undefined {
  if (!usage) return undefined
  const inputDetails = asRecord(usage['input_tokens_details'])
  const outputDetails = asRecord(usage['output_tokens_details'])
  const input = intValue(usage['input_tokens'])
  const output = intValue(usage['output_tokens'])
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: intValue(usage['total_tokens']) || input + output,
    cached_input_tokens: inputDetails ? intValue(inputDetails['cached_tokens']) || undefined : undefined,
    reasoning_tokens: outputDetails ? intValue(outputDetails['reasoning_tokens']) || undefined : undefined,
    source: 'provider_response',
  }
}

/** Responses 响应（JSON.parse 产物）→ maheshvara 响应。 */
export function decodeResponsesResponse(body: unknown): MaheshvaraResponse {
  const raw = asRecord(body)
  if (!raw) throw new Error('nil Responses response')

  const out: MaheshvaraResponse = {
    id: stringValue(raw['id']),
    model: stringValue(raw['model']),
    created_at: intValue(raw['created_at']),
    status: stringValue(raw['status']),
    output: [],
    usage: usageFromResponses(asRecord(raw['usage'])),
    incomplete_details: asRecord(raw['incomplete_details']),
    metadata: asRecord(raw['metadata']),
    service_tier: stringValue(raw['service_tier']) || undefined,
  }
  const errorValue = raw['error']
  if (errorValue !== undefined && errorValue !== null) {
    const object = asRecord(errorValue)
    if (object) {
      out.error = {
        message: stringValue(object['message']),
        type: stringValue(object['type']) || undefined,
        code: stringValue(object['code']) || undefined,
        param: stringValue(object['param']) || undefined,
        raw: object,
      }
    } else {
      out.error = { message: contentValueToString(errorValue) }
    }
  }

  for (const itemValue of asArray(raw['output']) ?? []) {
    const item = asRecord(itemValue)
    if (!item) continue
    const citem: MaheshvaraOutputItem = {
      id: stringValue(item['id']) || undefined,
      type: stringValue(item['type']),
      status: stringValue(item['status']) || undefined,
      role: stringValue(item['role']) || undefined,
      call_id: stringValue(item['call_id']) || undefined,
      name: stringValue(item['name']) || undefined,
      arguments: item['arguments'],
      content: [],
      summary: [],
      // 整块原始对象捕获（Go RawItem）：server-tool 项（web_search_call /
      // file_search_call / image_generation_call 等）的载荷不再缩水为
      // id/type 骨架，重建时以 raw 为底叠加类型化字段整体往返。
      raw: item,
    }
    for (const contentValue of asArray(item['content']) ?? []) {
      const content = asRecord(contentValue)
      if (!content) continue
      switch (stringValue(content['type'])) {
        case 'output_text':
        case 'text':
          citem.content?.push({
            type: CONTENT_TEXT,
            text: stringValue(content['text']),
            annotations: asArray(content['annotations']) as Record<string, unknown>[] | undefined,
          })
          break
        case 'refusal':
          citem.content?.push({ type: CONTENT_REFUSAL, text: stringValue(content['refusal']) })
          break
        case 'input_image':
        case 'image':
          citem.content?.push({ type: CONTENT_IMAGE, image_url: stringValue(content['image_url']) })
          break
        case 'input_file':
        case 'file':
          citem.content?.push({
            type: CONTENT_FILE,
            file_id: stringValue(content['file_id']) || undefined,
            uri: stringValue(content['file_url']) || undefined,
            file_name: stringValue(content['filename']) || undefined,
          })
          break
        case 'input_audio':
        case 'audio': {
          const audio = asRecord(content['audio'])
          citem.content?.push({
            type: CONTENT_AUDIO,
            raw: audio,
            audio_base64: audio ? firstNonEmptyString(stringValue(audio['data']), stringValue(audio['audio_data'])) || undefined : undefined,
            audio_url: audio ? firstNonEmptyString(stringValue(audio['url']), stringValue(audio['audio_url'])) || undefined : undefined,
            media_type: audio ? firstNonEmptyString(stringValue(audio['format']), stringValue(audio['mime_type'])) || undefined : undefined,
          })
          break
        }
      }
    }
    for (const summaryValue of asArray(item['summary']) ?? []) {
      const summary = asRecord(summaryValue)
      if (!summary) continue
      citem.summary?.push({ type: stringValue(summary['type']) || undefined, text: stringValue(summary['text']) })
    }
    if (citem.type === OUTPUT_REASONING) {
      let summaryText = ''
      for (const summary of citem.summary ?? []) {
        summaryText += summary.text ?? ''
      }
      citem.reasoning = {
        text: summaryText,
        summary: summaryText,
        summary_parts: [...(citem.summary ?? [])],
        encrypted_content: stringValue(item['encrypted_content']) || undefined,
      }
      if (summaryText.length > 0 || stringValue(item['encrypted_content']) !== '') {
        citem.content?.push({
          type: CONTENT_REASONING,
          text: summaryText,
          reasoning_text: summaryText,
          encrypted_content: stringValue(item['encrypted_content']) || undefined,
          reasoning_summary: citem.summary,
        })
      }
    }
    out.output?.push(citem)
    if (out.usage) {
      switch (citem.type) {
        case 'web_search_call': out.usage.web_search_call_count = (out.usage.web_search_call_count ?? 0) + 1; break
        case 'file_search_call': out.usage.file_search_call_count = (out.usage.file_search_call_count ?? 0) + 1; break
        case 'image_generation_call': out.usage.image_generation_call_count = (out.usage.image_generation_call_count ?? 0) + 1; break
      }
    }
  }
  return out
}

/** 提取全部消息文本（网关 output 用）。 */
export function extractMessageText(response: MaheshvaraResponse): string {
  let out = ''
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === CONTENT_TEXT) out += part.text ?? ''
    }
  }
  return out
}

export { usageFromResponses }
