/**
 * 网关内部请求（DialogueMessage）→ maheshvara 请求的桥接。
 * DialogueMessage.content 目前是纯字符串；映射为单个 text 部件，
 * 由各协议 encode 侧决定是否折叠回字符串（OpenAI 系）或 text block（Claude/Gemini）。
 * 将来 DialogueMessage 扩展为多模态部件数组时，只需替换这一个文件。
 */

import type { DialogueMessage } from '@elysia-ai/core'
import type { MaheshvaraRequest } from '@elysia-ai/maheshvara'
import { CONTENT_TEXT } from '@elysia-ai/maheshvara'
import type { ProviderRequest } from './types.js'

export interface MaheshvaraBridgeParams {
  model: string
  maxTokens: number
  temperature: number
}

export function toMaheshvaraRequest(request: ProviderRequest, params: MaheshvaraBridgeParams): MaheshvaraRequest {
  return {
    model: params.model,
    messages: toMaheshvaraMessages(request.messages),
    max_output_tokens: params.maxTokens,
    temperature: params.temperature,
  }
}

export function toMaheshvaraMessages(messages: DialogueMessage[]): MaheshvaraRequest['messages'] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content === '' ? [] : [{ type: CONTENT_TEXT, text: message.content }],
    ...(message.name ? { name: message.name } : {}),
  }))
}
