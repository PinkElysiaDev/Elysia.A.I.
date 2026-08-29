/**
 * canonical → OpenAI Chat Completions wire 请求构造。
 * 逐行为对齐 Elysia-Api canonical_convert.go 的
 * CanonicalToOpenAIChatRequest / canonicalMessagesToOpenAI /
 * canonicalToolsToOpenAI / canonicalResponseFormatToOpenAI /
 * applyOpenAIRequestExtensionsToBody（maheshvara_extensions.go）。
 */

import type { CanonicalContentPart, CanonicalRequest, CanonicalResponseFormat, CanonicalTool } from '@elysia-ai/canonical'
import {
  CONTENT_AUDIO,
  CONTENT_DOCUMENT,
  CONTENT_FILE,
  CONTENT_IMAGE,
  CONTENT_REASONING,
  CONTENT_REFUSAL,
  CONTENT_TEXT,
  CONTENT_TOOL_OUTPUT,
  CONTENT_VIDEO,
  SIGNATURE_PROVIDER_GEMINI,
  TOOL_FUNCTION,
} from '@elysia-ai/canonical'
import { canonicalSignatureForProvider, firstNonEmptyString, imagePartBase64 } from '@elysia-ai/canonical'

/** 保留非空原始 ID，否则合成确定性 ID（Go ensureToolCallID，与 Gemini 解析约定一致）。 */
export function ensureToolCallID(id: string | undefined, msgIndex: number, callIndex: number): string {
  if ((id ?? '').trim() !== '') return id as string
  return `call_${msgIndex}_${callIndex}`
}

/** 音频 MIME → OpenAI input_audio.format 白名单（仅 wav | mp3）。 */
export function audioInputFormat(part: CanonicalContentPart): string {
  const mime = firstNonEmptyString(part.media_type ?? '', part.mime_type ?? '').toLowerCase()
  if (mime.includes('wav')) return 'wav'
  return 'mp3'
}

/** 图片部件 → OpenAI image_url 的 url 值（http(s) 原样；base64 组装 data: URI）。 */
function imagePartToOpenAIURL(part: CanonicalContentPart): string {
  const uri = firstNonEmptyString(part.image_url ?? '', part.uri ?? '')
  if (uri !== '') return uri
  if (part.image_base64) {
    const mediaType = part.media_type || 'image/png'
    return `data:${mediaType};base64,${part.image_base64}`
  }
  return ''
}

/** canonical 部件数组 → OpenAI 消息 content（纯文本回退为字符串，Go contentPartsToInterface）。 */
export function contentPartsToOpenAI(parts: CanonicalContentPart[]): string | unknown[] {
  if (parts.length === 0) return ''
  if (parts.length === 1 && parts[0].type === CONTENT_TEXT) return parts[0].text ?? ''
  const out: unknown[] = []
  for (const part of parts) {
    switch (part.type) {
      case CONTENT_TEXT:
        out.push({ type: 'text', text: part.text ?? '' })
        break
      case CONTENT_IMAGE: {
        const url = imagePartToOpenAIURL(part)
        if (url !== '') {
          const image: Record<string, unknown> = { url }
          if (part.detail) image['detail'] = part.detail
          out.push({ type: 'image_url', image_url: image })
        }
        break
      }
      case CONTENT_AUDIO: {
        // OpenAI 规范：input_audio.data 必须是裸 base64，format 只接受
        // 'wav' | 'mp3'。远程 URL 无法内联，跳过该部件（塞 URL 会被上游拒绝）。
        const data = firstNonEmptyString(part.audio_base64 ?? '', part.data ?? '')
        if (data !== '') {
          out.push({ type: 'input_audio', input_audio: { data, format: audioInputFormat(part) } })
        }
        break
      }
      case CONTENT_VIDEO: {
        let url = firstNonEmptyString(part.video_url ?? '', part.uri ?? '')
        if (url === '' && part.video_base64) {
          url = `data:${firstNonEmptyString(part.media_type ?? '', part.mime_type ?? '', 'video/mp4')};base64,${part.video_base64}`
        }
        if (url !== '') {
          out.push({ type: 'video_url', video_url: { url } })
        }
        break
      }
      case CONTENT_FILE:
      case CONTENT_DOCUMENT: {
        const file: Record<string, unknown> = { type: 'file' }
        if (part.file_id) file['file_id'] = part.file_id
        if (part.file_name) file['filename'] = part.file_name
        if (part.file_data) file['file_data'] = part.file_data
        if (part.uri) file['file_url'] = part.uri
        if (part.media_type) file['mime_type'] = part.media_type
        if (Object.keys(file).length > 1) out.push(file)
        break
      }
      case CONTENT_REASONING: {
        const text = firstNonEmptyString(part.reasoning_text ?? '', part.text ?? '')
        if (text !== '') out.push({ type: 'text', text, thought: true })
        break
      }
      case CONTENT_TOOL_OUTPUT: {
        if (part.tool_output) out.push({ type: 'text', text: part.tool_output })
        break
      }
      case CONTENT_REFUSAL: {
        if (part.text) out.push({ type: 'text', text: part.text })
        break
      }
      default: {
        if (part.raw !== undefined && part.raw !== null) out.push(part.raw)
      }
    }
  }
  return out
}

function canonicalMessagesToOpenAI(req: CanonicalRequest): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []
  if (req.instructions) {
    messages.push({ role: 'system', content: req.instructions })
  }
  const allMessages = req.messages ?? []
  for (let msgIndex = 0; msgIndex < allMessages.length; msgIndex++) {
    const msg = allMessages[msgIndex]
    const visibleParts: CanonicalContentPart[] = []
    const toolOutputs: CanonicalContentPart[] = []
    let reasoning = ''
    let refusal = ''
    for (const part of msg.content ?? []) {
      if (part.type === CONTENT_REASONING) {
        reasoning += firstNonEmptyString(part.reasoning_text ?? '', part.text ?? '')
        continue
      }
      if (part.type === CONTENT_REFUSAL) {
        refusal += part.text ?? ''
        continue
      }
      if (part.type === CONTENT_TOOL_OUTPUT) {
        toolOutputs.push(part)
        continue
      }
      visibleParts.push(part)
    }
    let role = (msg.role ?? '').trim().toLowerCase()
    if (role === '') role = 'user'

    // 纯 tool_result 消息不再生成空 user 消息，避免 assistant tool_calls 后
    // 缺对应 tool 消息被上游拒（insufficient tool messages）。
    const hasRegularContent = visibleParts.length > 0 || reasoning !== '' || refusal !== ''
      || (msg.tool_calls?.length ?? 0) > 0 || (msg.name ?? '') !== ''
      || msg.metadata !== undefined || msg.cache_control !== undefined || (msg.tool_call_id ?? '') !== ''
    if (hasRegularContent) {
      const out: Record<string, unknown> = {
        role,
        content: contentPartsToOpenAI(visibleParts),
      }
      if (visibleParts.length === 0 && (msg.tool_calls?.length ?? 0) > 0) {
        out['content'] = null
      }
      if (reasoning !== '') out['reasoning_content'] = reasoning
      if (refusal !== '') out['refusal'] = refusal
      if (msg.name) out['name'] = msg.name
      if (msg.metadata !== undefined) out['metadata'] = msg.metadata
      if (msg.cache_control !== undefined) out['cache_control'] = msg.cache_control
      if (msg.tool_call_id) out['tool_call_id'] = msg.tool_call_id
      if ((msg.tool_calls?.length ?? 0) > 0) {
        const calls: Array<Record<string, unknown>> = []
        msg.tool_calls!.forEach((call, callIndex) => {
          let argumentsText = typeof call.arguments === 'string' ? call.arguments.trim() : ''
          if (argumentsText === '') argumentsText = call.arguments_text ?? ''
          if (argumentsText === '') argumentsText = '{}'
          const callType = firstNonEmptyString(call.type, TOOL_FUNCTION)
          const wireCall: Record<string, unknown> = {
            // 绝不输出空 id：严格上游会判 missing field id。
            id: ensureToolCallID(call.id, msgIndex, callIndex),
            type: callType,
            function: { name: call.name, arguments: argumentsText },
          }
          const signature = canonicalSignatureForProvider(call.thought_signature, call.thought_signature_provider, SIGNATURE_PROVIDER_GEMINI)
          if (signature !== '') {
            wireCall['extra_content'] = { google: { thought_signature: signature } }
          }
          calls.push(wireCall)
        })
        out['tool_calls'] = calls
      }
      messages.push(out)
    }

    // tool_output 部件 → role:"tool" 消息，与 assistant tool_calls[].id 对应。
    for (const toolOutput of toolOutputs) {
      messages.push({
        role: 'tool',
        tool_call_id: toolOutput.tool_call_id,
        content: toolOutput.tool_output,
      })
    }
  }
  return messages
}

export function canonicalToolsToOpenAI(tools: CanonicalTool[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const tool of tools) {
    if (tool.type !== TOOL_FUNCTION) {
      throw new Error(`builtin tool ${JSON.stringify(tool.type)} cannot be transformed to OpenAI chat completions`)
    }
    const parameters = tool.parameters ?? tool.input_schema
    const fn: Record<string, unknown> = {
      name: tool.name,
      description: tool.description,
      parameters,
    }
    if (tool.strict !== undefined) fn['strict'] = tool.strict
    out.push({ type: 'function', function: fn })
  }
  return out
}

export function canonicalToolChoiceToOpenAI(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const object = value as Record<string, unknown>
    const config = object['functionCallingConfig']
    if (typeof config === 'object' && config !== null) {
      const cfg = config as Record<string, unknown>
      let mode = String(cfg['mode'] ?? '').trim().toLowerCase()
      if (mode === 'any') mode = 'required'
      else if (mode !== 'none') mode = 'auto'
      const names = Array.isArray(cfg['allowedFunctionNames']) ? cfg['allowedFunctionNames'] : []
      if (names.length > 0) {
        return { type: 'function', function: { name: String(names[0]) } }
      }
      return mode
    }
    const fn = object['function']
    if (typeof fn === 'object' && fn !== null) {
      if (object['type'] === 'function') return object
      return { type: 'function', function: { name: String((fn as Record<string, unknown>)['name'] ?? '') } }
    }
    if (object['type'] === 'tool' && object['name']) {
      return { type: 'function', function: { name: String(object['name']) } }
    }
  }
  const choice = String(value ?? '').trim().toLowerCase()
  if (choice === 'required' || choice === 'none' || choice === 'auto') return choice
  return value
}

function canonicalResponseFormatToOpenAI(f: CanonicalResponseFormat): Record<string, unknown> {
  const raw = f.raw
  if (raw && (raw as Record<string, unknown>)['json_schema'] !== undefined) return raw as Record<string, unknown>
  if (f.type === 'json_schema') {
    return {
      type: 'json_schema',
      json_schema: {
        name: f.name,
        description: f.description,
        schema: f.schema,
        strict: f.strict,
      },
    }
  }
  return { type: f.type }
}

function applyOpenAIRequestExtensions(out: Record<string, unknown>, req: CanonicalRequest): void {
  if (req.n !== undefined) out['n'] = req.n
  if (req.seed !== undefined) out['seed'] = req.seed
  if (req.presence_penalty !== undefined) out['presence_penalty'] = req.presence_penalty
  if (req.frequency_penalty !== undefined) out['frequency_penalty'] = req.frequency_penalty
  if (req.repetition_penalty !== undefined) out['repetition_penalty'] = req.repetition_penalty
  if (req.logprobs !== undefined) out['logprobs'] = req.logprobs
  if (req.top_logprobs !== undefined) out['top_logprobs'] = req.top_logprobs
  if (req.typical_p !== undefined) out['typical_p'] = req.typical_p
  if (req.min_p !== undefined) out['min_p'] = req.min_p
  if (req.top_a !== undefined) out['top_a'] = req.top_a
  if ((req.modalities?.length ?? 0) > 0) out['modalities'] = req.modalities
  if (req.audio !== undefined) out['audio'] = req.audio
  if (req.prediction !== undefined) out['prediction'] = req.prediction
  if (req.service_tier) out['service_tier'] = req.service_tier
  if (req.safety_identifier) out['safety_identifier'] = req.safety_identifier
  if (req.verbosity) out['verbosity'] = req.verbosity
  if (req.store !== undefined) out['store'] = req.store
}

/** canonical 请求 → Chat Completions 请求体对象（调用方负责 JSON.stringify 与发送）。 */
export function encodeChatCompletionsRequest(req: CanonicalRequest): Record<string, unknown> {
  if (!req.model?.trim()) {
    throw new Error('cannot render openai_chat request without model')
  }
  const out: Record<string, unknown> = {
    model: req.model,
    messages: canonicalMessagesToOpenAI(req),
  }
  if ((req.max_output_tokens ?? 0) > 0) out['max_tokens'] = req.max_output_tokens
  if (req.temperature !== undefined) out['temperature'] = req.temperature
  if (req.top_p !== undefined) out['top_p'] = req.top_p
  if (req.stream) {
    out['stream'] = true
    // 流式必须注入 include_usage：OpenAI 兼容上游默认不在流式响应里回 usage。
    out['stream_options'] = { include_usage: true }
  } else if (req.stream_options !== undefined) {
    out['stream_options'] = { include_usage: req.stream_options.include_usage }
  }
  if (req.stop !== undefined && req.stop !== null) out['stop'] = req.stop
  if ((req.tools?.length ?? 0) > 0) out['tools'] = canonicalToolsToOpenAI(req.tools!)
  if (req.tool_choice !== undefined && req.tool_choice !== null) {
    out['tool_choice'] = canonicalToolChoiceToOpenAI(req.tool_choice)
  }
  if (req.parallel_tool_calls !== undefined) out['parallel_tool_calls'] = req.parallel_tool_calls
  if (req.response_format) out['response_format'] = canonicalResponseFormatToOpenAI(req.response_format)
  if (req.reasoning?.effort) out['reasoning_effort'] = req.reasoning.effort
  if (req.user) out['user'] = req.user
  if (req.prompt_cache_key) out['prompt_cache_key'] = req.prompt_cache_key
  applyOpenAIRequestExtensions(out, req)
  return out
}

export { imagePartToOpenAIURL, imagePartBase64 }
