import { describe, expect, it } from 'vitest'
import { TraceRecorder } from './trace.js'

describe('TraceRecorder', () => {
  it('span 嵌套成树：stage 下的 hook span', async () => {
    const recorder = new TraceRecorder()
    await recorder.span('stage:perception', async () => {
      await recorder.span('hook:perception#per', async () => {
        recorder.record({ kind: 'custom', action: 'analyzed' })
      })
    })
    recorder.finish()
    expect(recorder.root.children).toHaveLength(1)
    expect(recorder.root.children[0].name).toBe('stage:perception')
    expect(recorder.root.children[0].children[0].name).toBe('hook:perception#per')
    expect(recorder.root.children[0].children[0].status).toBe('ok')
  })

  it('span 抛错标记 error 状态并重抛', async () => {
    const recorder = new TraceRecorder()
    await expect(recorder.span('bad', async () => {
      throw new Error('kaput')
    })).rejects.toThrow('kaput')
    expect(recorder.root.children[0].status).toBe('error')
    expect(recorder.root.children[0].error).toBe('kaput')
  })

  it('finish 回调汇聚且幂等；fail 标记根错误', () => {
    const roots: unknown[] = []
    const recorder = new TraceRecorder((root) => roots.push(root))
    recorder.finish()
    recorder.finish()
    expect(roots).toHaveLength(1)
    expect(roots[0].status).toBe('ok')

    const failed = new TraceRecorder((root) => roots.push(root))
    failed.fail(new Error('pipeline died'))
    expect(roots[1].status).toBe('error')
    expect(roots[1].error).toBe('pipeline died')
  })
})
