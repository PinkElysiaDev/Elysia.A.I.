/**
 * OpenAI Chat Completions SSE 流 → canonical 流事件。
 * 逐行为对齐 maheshvara_stream_decoder.go 的 decodeOpenAIChat /
 * decodeOpenAIToolCalls / openAIContentEvents / openAIReasoningSignatureProvider，
 * 以及 maheshvara_stream.go 的 canonicalUsageFromRawMap（此处 usageFromRawMap）。
 * 有状态：工具调用参数与内容块会跨多个上游事件分片到达。
 */

import type { CanonicalContentPart, CanonicalStreamEvent, CanonicalUsage, SSEEvent } from '@elysia-ai/canonical'
import {
  CONTENT_AUDIO,
  CONTENT_REASONING,
  CONTENT_REFUSAL,
  CONTENT_TEXT,
  EVENT_CONTENT_PART_ADDED,
  EVENT_FUNCTION_CALL_ADDED,
  EVENT_FUNCTION_CALL_ARGUMENTS_DELTA,
  EVENT_FUNCTION_CALL_ARGUMENTS_DONE,
  EVENT_REASONING_DELTA,
  EVENT_REASONING_SIGNATURE_DELTA,
  EVENT_REFUSAL_DELTA,
  EVENT_RESPONSE_COMPLETED,
  EVENT_RESPONSE_FAILED,
  EVENT_RESPONSE_IN_PROGRESS,
  EVENT_TEXT_DELTA,
  EVENT_USAGE_DELTA,
  SIGNATURE_PROVIDER_GEMINI,
} from '@elysia-ai/canonical'
import {
  asArray,
  asRecord,
  firstNonEmptyString,
  interfaceToContentParts,
  intValue,
  stringValue,
  usageFromRawMap,
} from '@elysia-ai/canonical'

interface ToolCallState {
  id: string
  name: string
  arguments: string
  added: boolean
}

function openAIGoogleThoughtSignature(tool: Record<string, unknown> | undefined): string {
  if (!tool) return ''
  const extra = asRecord(tool['extra_content'])
  const google = extra ? asRecord(extra['google']) : undefined
  return firstNonEmptyString(
    google ? stringValue(google['thought_signature']) : '',
    google ? stringValue(google['thoughtSignature']) : '',
    stringValue(tool['thought_signature']),
    stringValue(tool['thoughtSignature']),
  )
}

function openAIReasoningSignatureProvider(detail: Record<string, unknown>): string {
  const provider = stringValue(detail['provider']).trim().toLowerCase()
  if (provider !== '') return provider
  const typeName = firstNonEmptyString(stringValue(detail['type']), stringValue(detail['format'])).toLowerCase()
  if (typeName.includes('google') || typeName.includes('gemini')) return SIGNATURE_PROVIDER_GEMINI
  if (typeName.includes('anthropic') || typeName.includes('claude')) return 'anthropic'
  if (typeName.includes('openai')) return 'openai'
  return ''
}

function eventHasOutput(event: CanonicalStreamEvent): boolean {
  return (event.delta ?? '') !== '' || (event.reasoning_delta ?? '') !== '' || (event.refusal_delta ?? '') !== ''
    || (event.tool_name ?? '') !== '' || (event.tool_arguments_delta ?? '') !== '' || (event.tool_arguments_done ?? '') !== ''
    || event.content_part !== undefined || event.output_item !== undefined
    || (event.response?.output?.length ?? 0) > 0
}

export class ChatCompletionsStreamDecoder {
  private responseID = ''
  private model = ''
  private terminal = false
  private sawWireEvent = false
  private sawOutput = false
  private readonly tools = new Map<number, ToolCallState>()
  private readonly toolOrder: number[] = []
  private readonly finishedChoices = new Set<number>()
  private readonly seenChoices = new Set<number>()

  getTerminal(): boolean {
    return this.terminal
  }

  getSawWireEvent(): boolean {
    return this.sawWireEvent
  }

  getSawOutput(): boolean {
    return this.sawOutput
  }

  private baseEvent(type: string, raw: Record<string, unknown>): CanonicalStreamEvent {
    return { type, response_id: this.responseID, model: this.model, raw }
  }

  decode(event: SSEEvent): CanonicalStreamEvent[] {
    const data = event.data.trim()
    if (data === '') return []
    this.sawWireEvent = true
    if (data === '[DONE]') {
      if (this.terminal) return []
      this.terminal = true
      return [{ type: EVENT_RESPONSE_COMPLETED, response_id: this.responseID, model: this.model }]
    }
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(data) as Record<string, unknown>
    } catch (error) {
      throw new Error(`decode SSE JSON event: ${(error as Error).message}`)
    }
    if (!asRecord(raw)) return []
    if (stringValue(raw['type']) === '' && event.event.trim() !== '') {
      raw['type'] = event.event.trim()
    }

    const events = this.decodeChat(raw)
    for (const item of events) {
      if (!item.response_id) item.response_id = this.responseID
      if (!item.model) item.model = this.model
      if (eventHasOutput(item)) this.sawOutput = true
    }
    return events
  }

  private decodeChat(raw: Record<string, unknown>): CanonicalStreamEvent[] {
    this.responseID = firstNonEmptyString(stringValue(raw['id']), this.responseID)
    this.model = firstNonEmptyString(stringValue(raw['model']), this.model)
    const createdAt = intValue(raw['created'])
    const events: CanonicalStreamEvent[] = []
    const usage = usageFromRawMap(asRecord(raw['usage']))
    if (usage) {
      const usageEvent = this.baseEvent(EVENT_USAGE_DELTA, raw)
      usageEvent.usage = usage
      usageEvent.created_at = createdAt
      events.push(usageEvent)
    }

    const terminalEvents: CanonicalStreamEvent[] = []
    for (const choiceValue of asArray(raw['choices']) ?? []) {
      const choice = asRecord(choiceValue)
      if (!choice) continue
      const choiceIndex = intValue(choice['index'])
      this.seenChoices.add(choiceIndex)
      let delta = asRecord(choice['delta'])
      if (!delta) delta = asRecord(choice['message'])
      delta ??= {}
      const role = stringValue(delta['role'])
      if (role !== '') {
        const roleEvent = this.baseEvent(EVENT_RESPONSE_IN_PROGRESS, raw)
        roleEvent.role = role
        roleEvent.choice_index = choiceIndex
        roleEvent.created_at = createdAt
        events.push(roleEvent)
      }
      events.push(...this.contentEvents(delta['content'], choiceIndex, raw))

      const reasoning = firstNonEmptyString(
        stringValue(delta['reasoning_content']),
        stringValue(delta['reasoning']),
        stringValue(delta['thinking']),
      )
      if (reasoning !== '') {
        const reasoningEvent = this.baseEvent(EVENT_REASONING_DELTA, raw)
        reasoningEvent.choice_index = choiceIndex
        reasoningEvent.reasoning_delta = reasoning
        events.push(reasoningEvent)
      }
      const refusal = stringValue(delta['refusal'])
      if (refusal !== '') {
        const refusalEvent = this.baseEvent(EVENT_REFUSAL_DELTA, raw)
        refusalEvent.choice_index = choiceIndex
        refusalEvent.refusal_delta = refusal
        events.push(refusalEvent)
      }
      const details = asArray(delta['reasoning_details'])
      if (details) {
        for (const detailValue of details) {
          const detail = asRecord(detailValue)
          if (!detail) continue
          const text = firstNonEmptyString(stringValue(detail['text']), stringValue(detail['content']))
          if (text !== '') {
            const textEvent = this.baseEvent(EVENT_REASONING_DELTA, raw)
            textEvent.choice_index = choiceIndex
            textEvent.reasoning_delta = text
            events.push(textEvent)
          }
          const signature = firstNonEmptyString(stringValue(detail['signature']), stringValue(detail['data']))
          if (signature !== '') {
            const signatureEvent = this.baseEvent(EVENT_REASONING_SIGNATURE_DELTA, raw)
            signatureEvent.choice_index = choiceIndex
            signatureEvent.reasoning_signature_delta = signature
            signatureEvent.reasoning_signature_provider = openAIReasoningSignatureProvider(detail)
            events.push(signatureEvent)
          }
        }
      }
      const signature = stringValue(delta['reasoning_signature'])
      if (signature !== '') {
        const signatureEvent = this.baseEvent(EVENT_REASONING_SIGNATURE_DELTA, raw)
        signatureEvent.choice_index = choiceIndex
        signatureEvent.reasoning_signature_delta = signature
        signatureEvent.reasoning_signature_provider = stringValue(delta['reasoning_signature_provider'])
        events.push(signatureEvent)
      }
      const audio = asRecord(delta['audio'])
      if (audio) {
        const part: CanonicalContentPart = {
          type: CONTENT_AUDIO,
          audio_base64: firstNonEmptyString(stringValue(audio['data']), stringValue(audio['audio_data'])),
          audio_url: firstNonEmptyString(stringValue(audio['url']), stringValue(audio['audio_url'])),
          text: stringValue(audio['transcript']),
          media_type: firstNonEmptyString(stringValue(audio['format']), stringValue(audio['mime_type'])),
          raw: audio,
        }
        const audioEvent = this.baseEvent(EVENT_CONTENT_PART_ADDED, raw)
        audioEvent.choice_index = choiceIndex
        audioEvent.content_part = part
        events.push(audioEvent)
      }
      const toolCalls = asArray(delta['tool_calls'])
      if (toolCalls) {
        events.push(...this.decodeToolCalls(toolCalls, choiceIndex, raw))
      }

      const finishReason = stringValue(choice['finish_reason'])
      if (finishReason !== '') {
        this.finishedChoices.add(choiceIndex)
        for (const toolIndex of this.toolOrder) {
          const state = this.tools.get(toolIndex)
          if (!state || state.arguments.length === 0) continue
          const doneEvent = this.baseEvent(EVENT_FUNCTION_CALL_ARGUMENTS_DONE, raw)
          doneEvent.choice_index = choiceIndex
          doneEvent.tool_call_index = toolIndex
          doneEvent.tool_call_id = state.id
          doneEvent.tool_name = state.name
          doneEvent.tool_arguments_done = state.arguments
          terminalEvents.push(doneEvent)
        }
        const completedEvent = this.baseEvent(EVENT_RESPONSE_COMPLETED, raw)
        completedEvent.choice_index = choiceIndex
        completedEvent.finish_reason = finishReason
        completedEvent.created_at = createdAt
        terminalEvents.push(completedEvent)
      }
    }
    if (this.seenChoices.size > 0 && this.allChoicesFinished()) {
      this.terminal = true
    }
    return [...events, ...terminalEvents]
  }

  private allChoicesFinished(): boolean {
    for (const index of this.seenChoices) {
      if (!this.finishedChoices.has(index)) return false
    }
    return true
  }

  private decodeToolCalls(toolCalls: unknown[], choiceIndex: number, raw: Record<string, unknown>): CanonicalStreamEvent[] {
    const events: CanonicalStreamEvent[] = []
    for (const toolValue of toolCalls) {
      const tool = asRecord(toolValue)
      if (!tool) continue
      const toolIndex = intValue(tool['index'])
      let state = this.tools.get(toolIndex)
      if (!state) {
        state = { id: '', name: '', arguments: '', added: false }
        this.tools.set(toolIndex, state)
        this.toolOrder.push(toolIndex)
      }
      const fn = asRecord(tool['function']) ?? {}
      const signature = openAIGoogleThoughtSignature(tool)
      if (signature !== '') {
        const signatureEvent = this.baseEvent(EVENT_REASONING_SIGNATURE_DELTA, raw)
        signatureEvent.choice_index = choiceIndex
        signatureEvent.tool_call_index = toolIndex
        signatureEvent.reasoning_signature_delta = signature
        signatureEvent.reasoning_signature_provider = SIGNATURE_PROVIDER_GEMINI
        events.push(signatureEvent)
      }
      state.id = firstNonEmptyString(stringValue(tool['id']), state.id)
      state.name = firstNonEmptyString(stringValue(fn['name']), state.name)
      if (!state.added && (state.id !== '' || state.name !== '')) {
        state.added = true
        const addedEvent = this.baseEvent(EVENT_FUNCTION_CALL_ADDED, raw)
        addedEvent.choice_index = choiceIndex
        addedEvent.tool_call_index = toolIndex
        addedEvent.tool_call_id = state.id
        addedEvent.tool_name = state.name
        events.push(addedEvent)
      }
      const argumentsText = stringValue(fn['arguments'])
      if (argumentsText !== '') {
        state.arguments += argumentsText
        const deltaEvent = this.baseEvent(EVENT_FUNCTION_CALL_ARGUMENTS_DELTA, raw)
        deltaEvent.choice_index = choiceIndex
        deltaEvent.tool_call_index = toolIndex
        deltaEvent.tool_call_id = state.id
        deltaEvent.tool_name = state.name
        deltaEvent.tool_arguments_delta = argumentsText
        events.push(deltaEvent)
      }
    }
    return events
  }

  private contentEvents(value: unknown, choiceIndex: number, raw: Record<string, unknown>): CanonicalStreamEvent[] {
    if (typeof value === 'string') {
      if (value === '') return []
      const textEvent = this.baseEvent(EVENT_TEXT_DELTA, raw)
      textEvent.choice_index = choiceIndex
      textEvent.delta = value
      return [textEvent]
    }
    const parts = interfaceToContentParts(value)
    const events: CanonicalStreamEvent[] = []
    parts.forEach((part, index) => {
      const event = this.baseEvent(EVENT_CONTENT_PART_ADDED, raw)
      event.choice_index = choiceIndex
      event.content_index = index
      switch (part.type) {
        case CONTENT_TEXT:
          event.type = EVENT_TEXT_DELTA
          event.delta = part.text ?? ''
          break
        case CONTENT_REASONING:
          event.type = EVENT_REASONING_DELTA
          event.reasoning_delta = firstNonEmptyString(part.reasoning_text ?? '', part.text ?? '')
          break
        case CONTENT_REFUSAL:
          event.type = EVENT_REFUSAL_DELTA
          event.refusal_delta = part.text ?? ''
          break
        default:
          event.content_part = part
      }
      if (eventHasOutput(event)) {
        events.push(event)
      }
    })
    return events
  }
}
