import { describe, expect, it } from 'vitest'
import { RequestContextStore, createRequestContext } from './context.js'

describe('RequestContext', () => {
  it('命名空间写入与读取；trace 记录 context-write', () => {
    const ctx = createRequestContext({ id: 'c1', core: { stimulusId: 's1' } })
    ctx.write('perception', { intent: 'greeting' })
    expect(ctx.read<{ intent: string }>('perception')).toEqual({ intent: 'greeting' })
    const records = ctx.trace.getRecords().filter((record) => record.kind === 'context-write')
    expect(records).toHaveLength(1)
    expect(records[0].namespace).toBe('perception')
  })

  it('子上下文沿父链回溯读取；同命名空间本地覆盖父值', () => {
    const parent = createRequestContext({ id: 'stim-1', core: { level: 'stimulus' } })
    parent.write('perception', { intent: 'question' })
    const child = createRequestContext({ id: 'stim-1:life-2', core: { level: 'life' }, parent })
    expect(child.read<{ intent: string }>('perception')).toEqual({ intent: 'question' })
    child.write('cognition', { salience: 0.9 })
    parent.write('cognition', { salience: 0.1 })
    expect(parent.read<{ salience: number }>('cognition')).toEqual({ salience: 0.1 })
    expect(child.read<{ salience: number }>('cognition')).toEqual({ salience: 0.9 })
  })

  it('forNamespace 视图限定读写自身命名空间', () => {
    const ctx = createRequestContext({ id: 'c2', core: {} })
    const view = ctx.forNamespace('emotion')
    view.set({ mood: 0.8 })
    expect(view.get<{ mood: number }>()).toEqual({ mood: 0.8 })
    expect(ctx.read<{ mood: number }>('emotion')).toEqual({ mood: 0.8 })
  })

  it('stop 标记与 trace 记录', () => {
    const ctx = createRequestContext({ id: 'c3', core: {} })
    expect(ctx.stopped).toBe(false)
    ctx.stop('not worth responding')
    expect(ctx.stopped).toBe(true)
    expect(ctx.stopReason).toBe('not worth responding')
    expect(ctx.trace.getRecords().some((record) => record.kind === 'pipeline-stop')).toBe(true)
  })
})

describe('RequestContextStore', () => {
  it('create/get/delete 与 sweep 超龄清理', async () => {
    const store = new RequestContextStore({ maxAgeMs: 5 })
    store.create({ id: 'a', core: {}, trace: createRequestContext({ id: 'trace-helper', core: {} }).trace })
    expect(store.get('a')).toBeDefined()
    store.create({ id: 'b', core: {}, trace: createRequestContext({ id: 'trace-helper2', core: {} }).trace })
    expect(store.size).toBe(2)
    expect(store.delete('a')).toBe(true)
    expect(store.size).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(store.sweep()).toBe(1)
    expect(store.size).toBe(0)
  })
})
