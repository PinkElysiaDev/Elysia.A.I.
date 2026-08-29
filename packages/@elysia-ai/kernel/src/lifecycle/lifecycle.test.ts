import { describe, expect, it } from 'vitest'
import { LifecycleManager } from './lifecycle.js'

describe('LifecycleManager', () => {
  it('相位按序推进，处理器按注册顺序执行', async () => {
    const lifecycle = new LifecycleManager()
    const calls: string[] = []
    lifecycle.onPhase('ready', () => calls.push('ready-1'))
    lifecycle.onPhase('ready', () => calls.push('ready-2'))
    lifecycle.onPhase('started', () => calls.push('started'))
    expect(lifecycle.currentPhase).toBe('constructed')
    await lifecycle.transition('ready')
    await lifecycle.transition('started')
    expect(lifecycle.currentPhase).toBe('started')
    expect(calls).toEqual(['ready-1', 'ready-2', 'started'])
  })

  it('回退/停留迁移被拒绝', async () => {
    const lifecycle = new LifecycleManager()
    await lifecycle.transition('ready')
    await expect(lifecycle.transition('constructed')).rejects.toThrow(/backwards/)
    await expect(lifecycle.transition('ready')).rejects.toThrow(/backwards/)
  })

  it('迟到处理器立即以当前相位补回调', async () => {
    const lifecycle = new LifecycleManager()
    await lifecycle.transition('started')
    const calls: string[] = []
    lifecycle.onPhase('ready', (phase) => calls.push(`late:${phase}`))
    expect(calls).toEqual(['late:started'])
  })

  it('单个处理器失败不阻断后续处理器，但 transition 汇总抛错', async () => {
    const lifecycle = new LifecycleManager()
    const calls: string[] = []
    lifecycle.onPhase('ready', () => {
      throw new Error('handler boom')
    })
    lifecycle.onPhase('ready', () => calls.push('survivor'))
    await expect(lifecycle.transition('ready')).rejects.toThrow(/1 handler failure/)
    expect(lifecycle.currentPhase).toBe('ready')
    expect(calls).toEqual(['survivor'])
  })

  it('并发 transition 链式排队：相位按序推进不交错（Review F5）', async () => {
    const lifecycle = new LifecycleManager()
    const observedPhases: KernelLifecyclePhase[] = []
    lifecycle.onPhase('ready', async () => {
      observedPhases.push(`ready@${lifecycle.currentPhase}`)
    })
    lifecycle.onPhase('started', () => {
      observedPhases.push(`started@${lifecycle.currentPhase}`)
    })
    // 两个并发迁移：started 与 ready。排队后等价于依次执行：
    // 第一个推进到 started；第二个（ready）此刻已是回退，按规则拒绝。
    const [startedResult, readyResult] = await Promise.allSettled([
      lifecycle.transition('started'),
      lifecycle.transition('ready'),
    ])
    expect(startedResult.status).toBe('fulfilled')
    expect(readyResult.status).toBe('rejected')
    expect(lifecycle.currentPhase).toBe('started')
    expect(observedPhases).toEqual(['ready@ready', 'started@started'])
  })
})
