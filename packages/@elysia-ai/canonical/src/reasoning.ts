/**
 * 跨厂商 thought signature 的中立处理：
 * - canonicalSignatureForProvider：签名只在同厂商间透传（Anthropic→Anthropic 等），
 *   跨厂商一律丢弃，避免上游校验失败。
 * - Maheshvara reasoning envelope：Elysia-Api 自有的跨协议加密推理载荷封装
 *   （base64url 的 JSON 信封），用于把 Claude 的 encrypted_content / Gemini 的
 *   加密思考在协议间无损搬运。
 * 对齐 maheshvara_reasoning.go。
 */

import type { CanonicalReasoningSummary } from './canonical.js'

export const MAHESHVARA_PROTOCOL_VERSION = '1'
export const MAHESHVARA_REASONING_ENVELOPE_V1 = 'maheshvara-reasoning-v1:'
export const MAHESHVARA_REASONING_MAX_BYTES = 4 << 20

/** 签名仅在同厂商目标下透传，否则返回空串。 */
export function canonicalSignatureForProvider(
  signature: string | undefined,
  sourceProvider: string | undefined,
  targetProvider: string,
): string {
  const trimmed = (signature ?? '').trim()
  if (trimmed === '') return ''
  if ((sourceProvider ?? '').trim().toLowerCase() !== targetProvider.trim().toLowerCase()) return ''
  return trimmed
}

interface MaheshvaraReasoningEnvelope {
  version: string
  text?: string
  encrypted_content: string
  summary?: CanonicalReasoningSummary[]
}

// base64url 编解码走 Web 标准 btoa/atob（Node 16+ 与浏览器均有全局实现），
// 保证本包在 Node 与浏览器环境都不依赖 Buffer。

function toBase64URL(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64URL(encoded: string): string {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeMaheshvaraReasoningEnvelope(
  text: string,
  encryptedContent: string,
  summary: CanonicalReasoningSummary[] = [],
): string {
  if (encryptedContent.trim() === '') return ''
  const payload = JSON.stringify({
    version: MAHESHVARA_PROTOCOL_VERSION,
    text: text || undefined,
    encrypted_content: encryptedContent,
    summary: summary.length > 0 ? summary : undefined,
  })
  if (payload.length > MAHESHVARA_REASONING_MAX_BYTES) return ''
  return MAHESHVARA_REASONING_ENVELOPE_V1 + toBase64URL(payload)
}

export function decodeMaheshvaraReasoningEnvelope(value: string): MaheshvaraReasoningEnvelope | undefined {
  if (!value.startsWith(MAHESHVARA_REASONING_ENVELOPE_V1)) return undefined
  const payload = value.slice(MAHESHVARA_REASONING_ENVELOPE_V1.length)
  if (payload === '') return undefined
  try {
    const decoded = fromBase64URL(payload)
    if (decoded.length === 0 || decoded.length > MAHESHVARA_REASONING_MAX_BYTES) return undefined
    const parsed = JSON.parse(decoded) as MaheshvaraReasoningEnvelope
    if (typeof parsed.encrypted_content !== 'string') return undefined
    return parsed
  } catch {
    return undefined
  }
}
