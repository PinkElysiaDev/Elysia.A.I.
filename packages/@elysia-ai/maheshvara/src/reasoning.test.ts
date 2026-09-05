import { describe, expect, it } from 'vitest'
import {
  MAHESHVARA_PROTOCOL_VERSION,
  MAHESHVARA_REASONING_ENVELOPE_V1,
  MAHESHVARA_REASONING_ENVELOPE_V2,
  decodeMaheshvaraReasoningEnvelope,
  encodeMaheshvaraReasoningEnvelope,
} from './reasoning.js'

describe('Maheshvara reasoning envelope v2', () => {
  it('出站铸造 v2 信封并随载 provider/model', () => {
    const envelope = encodeMaheshvaraReasoningEnvelope('思考', 'ct-1', [{ type: 'summary_text', text: '摘要' }], 'openai', 'gpt-5')
    expect(envelope.startsWith(MAHESHVARA_REASONING_ENVELOPE_V2)).toBe(true)

    const decoded = decodeMaheshvaraReasoningEnvelope(envelope)
    expect(decoded).toBeDefined()
    expect(decoded!.version).toBe('2')
    expect(decoded!.text).toBe('思考')
    expect(decoded!.encrypted_content).toBe('ct-1')
    expect(decoded!.provider).toBe('openai')
    expect(decoded!.model).toBe('gpt-5')
    expect(MAHESHVARA_PROTOCOL_VERSION).toBe('2')
  })

  it('v1 信封保持只读兼容', () => {
    // 手工构造 v1 信封（无 provider/model）
    const payload = JSON.stringify({ version: '1', text: '旧思考', encrypted_content: 'ct-old' })
    const bytes = new TextEncoder().encode(payload)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const v1 = MAHESHVARA_REASONING_ENVELOPE_V1 + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const decoded = decodeMaheshvaraReasoningEnvelope(v1)
    expect(decoded).toBeDefined()
    expect(decoded!.version).toBe('1')
    expect(decoded!.encrypted_content).toBe('ct-old')
    expect(decoded!.provider).toBeUndefined()
  })

  it('version 与前缀不匹配或密文为空时拒绝', () => {
    const forged = MAHESHVARA_REASONING_ENVELOPE_V2 + Buffer.from(
      JSON.stringify({ version: '1', encrypted_content: 'ct' }),
    ).toString('base64url')
    expect(decodeMaheshvaraReasoningEnvelope(forged)).toBeUndefined()

    const empty = encodeMaheshvaraReasoningEnvelope('t', '  ')
    expect(empty).toBe('')
  })

  it('deltaVsAccumulated：相等无输出 / 前缀补后缀 / 发散整体替换', async () => {
    const { deltaVsAccumulated } = await import('./maheshvara.js')
    expect(deltaVsAccumulated('ab', 'ab')).toEqual({ delta: '', replaced: false })
    expect(deltaVsAccumulated('ab', 'abcd')).toEqual({ delta: 'cd', replaced: false })
    expect(deltaVsAccumulated('ab', 'xy')).toEqual({ delta: 'xy', replaced: true })
  })
})
