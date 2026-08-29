/**
 * canonical → OpenAI Responses API wire 请求构造。
 * 对齐 canonical_convert.go 的 CanonicalToResponsesRequest / canonicalInputToResponses /
 * canonicalToolCallsToResponsesItems / canonicalContentToResponsesInputContent /
 * canonicalToolsToResponses / canonicalResponseFormatToResponses。
 */

import type { CanonicalContentPart, CanonicalRequest, CanonicalResponseFormat, CanonicalTool, CanonicalToolCall } from '@elysia-ai/canonical'
import {
  CONTENT_AUDIO,
  CONTENT_FILE,
  CONTENT_IMAGE,
  CONTENT_REASONING,
  CONTENT_TEXT,
  CONTENT_VIDEO,
  INPUT_FUNCTION_CALL_OUTPUT,
  TOOL_FUNCTION,
} from '@elysia-ai/canonical'
import { collectInstructions, firstNonEmptyString } from '@elysia-ai/canonical'
import { canonicalToolChoiceToOpenAI, imagePartToOpenAIURL } from '@elysia-ai/protocol-openai'

function responsesInputRole(role: string): string {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'assistant') return 'assistant'
  return 'user'
}

function responsesTextPartTypeForRole(role: string): string {
  if (responsesInputRole(role) === 'assistant') return 'output_text'
  return 'input_text'
}

function refusalTextFromRaw(raw: unknown): string {
  const m = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : undefined
  if (!m) return ''
  if (String(m['type'] ?? '').trim().toLowerCase() !== 'refusal') return ''
  const refusal = typeof m['refusal'] === 'string' ? m['refusal'] : ''
  if (refusal !== '') return refusal
  return typeof m['text'] === 'string' ? m['text'] : ''
}

function canonicalTextOf(parts: CanonicalContentPart[] | undefined): string {
  let out = ''
  for (const part of parts ?? []) {
    if (part.type === CONTENT_TEXT) out += part.text ?? ''
  }
  return out
}

export function canonicalToolCallsToResponsesItems(calls: CanonicalToolCall[] | undefined): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = []
  for (const call of calls ?? []) {
    const callID = (call.id ?? '').trim()
    const name = (call.name ?? '').trim()
    if (callID === '' || name === '') continue
    let args = typeof call.arguments === 'string' ? call.arguments.trim() : ''
    if (args === '') args = '{}'
    items.push({ type: 'function_call', call_id: callID, name, arguments: args })
  }
  return items
}

function canonicalContentToResponsesInputContent(role: string, parts: CanonicalContentPart[] | undefined): Array<Record<string, unknown>> {
  const normalizedRole = responsesInputRole(role)
  const out: Array<Record<string, unknown>> = []
  for (const part of parts ?? []) {
    switch (part.type) {
      case CONTENT_TEXT: {
        if (part.text) {
          out.push({ type: responsesTextPartTypeForRole(normalizedRole), text: part.text })
        }
        break
      }
      case CONTENT_REASONING: {
        if (normalizedRole === 'assistant') {
          const text = part.reasoning_text || part.text || ''
          if (text) out.push({ type: 'output_text', text })
        }
        break
      }
      case CONTENT_IMAGE: {
        if (normalizedRole === 'user') {
          const url = imagePartToOpenAIURL(part)
          if (url !== '') out.push({ type: 'input_image', image_url: url })
        }
        break
      }
      case CONTENT_AUDIO: {
        if (normalizedRole === 'user') {
          // OpenAI 规范：载荷键为 input_audio，data 必须是裸 base64，
          // format 只接受 'wav' | 'mp3'（MIME 需映射，URL 无法内联则跳过）。
          const data = firstNonEmptyString(part.audio_base64 ?? '', part.data ?? '')
          if (data !== '') {
            const mime = firstNonEmptyString(part.media_type ?? '', part.mime_type ?? '').toLowerCase()
            const format = mime.includes('wav') ? 'wav' : 'mp3'
            out.push({ type: 'input_audio', input_audio: { data, format } })
          }
        }
        break
      }
      case CONTENT_VIDEO: {
        if (normalizedRole === 'user') {
          const url = firstNonEmptyString(part.video_url ?? '', part.uri ?? '', part.image_url ?? '')
          if (url) out.push({ type: 'input_video', video_url: url })
        }
        break
      }
      case CONTENT_FILE: {
        if (normalizedRole === 'user') {
          const item: Record<string, unknown> = { type: 'input_file' }
          if (part.file_id) item['file_id'] = part.file_id
          if (part.file_name) item['filename'] = part.file_name
          if (part.file_data) item['file_data'] = part.file_data
          if (Object.keys(item).length > 1) out.push(item)
        }
        break
      }
      default: {
        const refusal = refusalTextFromRaw(part.raw)
        if (normalizedRole === 'assistant' && refusal !== '') {
          out.push({ type: 'refusal', refusal })
        }
      }
    }
  }
  return out
}

/** rawResponsesInputItem：InputItems 解析时保留的原始 item 直接回放。 */
function rawResponsesInputItem(rawExtra: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const raw = rawExtra?.['raw']
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return undefined
}

function canonicalInputToResponses(req: CanonicalRequest): Array<Record<string, unknown>> {
  if ((req.input_items?.length ?? 0) > 0) {
    const items: Array<Record<string, unknown>> = []
    for (const item of req.input_items!) {
      if (item.type === INPUT_FUNCTION_CALL_OUTPUT) {
        items.push({ type: 'function_call_output', call_id: item.call_id, output: item.output })
        continue
      }
      const raw = rawResponsesInputItem(item.RawExtra)
      if (raw) {
        items.push(raw)
        continue
      }
      const role = responsesInputRole(item.role ?? '')
      const content = canonicalContentToResponsesInputContent(role, item.content)
      if (content.length === 0) continue
      items.push({ role, content })
    }
    return items
  }

  const items: Array<Record<string, unknown>> = []
  for (const msg of req.messages ?? []) {
    const role = (msg.role ?? '').trim().toLowerCase()
    if (role === '' || role === 'system' || role === 'developer') continue
    if (role === 'tool' || role === 'function') {
      const callID = (msg.tool_call_id ?? '').trim()
      const output = canonicalTextOf(msg.content)
      if (callID === '') {
        items.push({ role: 'user', content: [{ type: 'input_text', text: `[tool_output_missing_call_id] ${output}` }] })
        continue
      }
      items.push({ type: 'function_call_output', call_id: callID, output })
      continue
    }
    const content = canonicalContentToResponsesInputContent(role, msg.content)
    if (content.length > 0) {
      items.push({ role: responsesInputRole(role), content })
    }
    if (role === 'assistant') {
      items.push(...canonicalToolCallsToResponsesItems(msg.tool_calls))
    }
  }
  return items
}

export function canonicalToolsToResponses(tools: CanonicalTool[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const tool of tools) {
    if (tool.raw) {
      out.push(tool.raw)
      continue
    }
    const m: Record<string, unknown> = { type: tool.type }
    if (tool.type === TOOL_FUNCTION) {
      m['name'] = tool.name
      m['description'] = tool.description
      m['parameters'] = tool.parameters ?? tool.input_schema
      if (tool.strict !== undefined) m['strict'] = tool.strict
    }
    out.push(m)
  }
  return out
}

function canonicalResponseFormatToResponses(f: CanonicalResponseFormat): Record<string, unknown> {
  if (f.raw) return f.raw as Record<string, unknown>
  const out: Record<string, unknown> = { type: f.type }
  if (f.name) out['name'] = f.name
  if (f.description) out['description'] = f.description
  if (f.schema) out['schema'] = f.schema
  if (f.strict !== undefined) out['strict'] = f.strict
  return out
}

function applyResponsesRequestExtensions(out: Record<string, unknown>, req: CanonicalRequest): void {
  if (req.seed !== undefined) out['seed'] = req.seed
  if (req.service_tier) out['service_tier'] = req.service_tier
  if (req.max_tool_calls !== undefined) out['max_tool_calls'] = req.max_tool_calls
  if (req.top_logprobs !== undefined) out['top_logprobs'] = req.top_logprobs
  if (req.safety_identifier) out['safety_identifier'] = req.safety_identifier
  if (req.stream_options) {
    const streamOptions: Record<string, unknown> = { ...req.stream_options.raw }
    if (req.stream_options.include_usage) streamOptions['include_usage'] = true
    if (req.stream_options.include_obfuscation !== undefined) {
      streamOptions['include_obfuscation'] = req.stream_options.include_obfuscation
    }
    if (Object.keys(streamOptions).length > 0) out['stream_options'] = streamOptions
  }
  if (req.prompt_cache_key) out['prompt_cache_key'] = req.prompt_cache_key
  if (req.prompt_cache_retention !== undefined) out['prompt_cache_retention'] = req.prompt_cache_retention
}

/**
 * canonical 请求 → Responses API 请求体对象。
 * original 为可选的原始 Responses 请求（透传场景解析自 wire），提供时以其为基底
 * 保留未建模字段（对齐 Go CanonicalToResponsesRequest 的 original 参数语义）。
 */
export function encodeResponsesRequest(req: CanonicalRequest, original?: Record<string, unknown>): Record<string, unknown> {
  if (!req.model?.trim()) {
    throw new Error('cannot render openai_responses request without model')
  }
  const out: Record<string, unknown> = original ? structuredClone(original) : {}
  out['model'] = req.model
  const instructions = collectInstructions(req)
  if (instructions !== '') out['instructions'] = instructions
  out['input'] = canonicalInputToResponses(req)
  if ((req.max_output_tokens ?? 0) > 0) out['max_output_tokens'] = req.max_output_tokens
  if (req.temperature !== undefined) out['temperature'] = req.temperature
  if (req.top_p !== undefined) out['top_p'] = req.top_p
  if (req.stream) out['stream'] = true
  if ((req.tools?.length ?? 0) > 0) out['tools'] = canonicalToolsToResponses(req.tools!)
  if (req.tool_choice !== undefined && req.tool_choice !== null) {
    out['tool_choice'] = canonicalToolChoiceToOpenAI(req.tool_choice)
  }
  if (req.parallel_tool_calls !== undefined) out['parallel_tool_calls'] = req.parallel_tool_calls
  if (req.response_format) {
    out['text'] = { format: canonicalResponseFormatToResponses(req.response_format) }
  }
  if (req.reasoning) {
    const reasoning: Record<string, unknown> = { ...(req.reasoning.raw ?? {}) }
    if (req.reasoning.effort) reasoning['effort'] = req.reasoning.effort
    out['reasoning'] = reasoning
  }
  applyResponsesRequestExtensions(out, req)
  return out
}
