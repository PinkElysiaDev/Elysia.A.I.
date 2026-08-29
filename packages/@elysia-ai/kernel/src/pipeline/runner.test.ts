import { describe, expect, it } from 'vitest'
import { PipelineTopologyError, sortStages } from './stage.js'
import { PipelineRunner } from './runner.js'
import { createRequestContext } from './context.js'

describe('sortStages 拓扑排序', () => {
  it('before/after 声明决定顺序，与输入次序无关', () => {
    const stagesA = [
      { name: 'dialogue', after: ['behavior'] },
      { name: 'behavior', after: ['cognition'] },
      { name: 'perception' },
      { name: 'cognition', after: ['perception'] },
    ]
    const stagesB = [stagesA[2], stagesA[0], stagesA[3], stagesA[1]]
    expect(sortStages(stagesA)).toEqual(['perception', 'cognition', 'behavior', 'dialogue'])
    expect(sortStages(stagesB)).toEqual(sortStages(stagesA))
  })

  it('before 与 after 双向声明等价', () => {
    const viaAfter = sortStages([
      { name: 'b', after: ['a'] },
      { name: 'a' },
    ])
    const viaBefore = sortStages([
      { name: 'a', before: ['b'] },
      { name: 'b' },
    ])
    expect(viaAfter).toEqual(viaBefore)
  })

  it('同约束阶段按名称字典序破平（确定性）', () => {
    const order = sortStages([{ name: 'zeta' }, { name: 'alpha' }, { name: 'mid' }])
    expect(order).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('引用未声明阶段视为隐式阶段参与排序', () => {
    const order = sortStages([
      { name: 'perception' },
      { name: 'cognition', after: ['perception', 'emotion'] },
      { name: 'emotion', after: ['perception'] },
    ])
    expect(order.indexOf('emotion')).toBeGreaterThan(order.indexOf('perception'))
    expect(order.indexOf('cognition')).toBeGreaterThan(order.indexOf('emotion'))
  })

  it('环检测抛出 PipelineTopologyError', () => {
    expect(() => sortStages([
      { name: 'a', after: ['b'] },
      { name: 'b', after: ['a'] },
    ])).toThrow(PipelineTopologyError)
  })
})

describe('PipelineRunner', () => {
  function makeRunner() {
    const runner = new PipelineRunner<{ value: string }>()
    for (const stage of [
      { name: 'perception' },
      { name: 'cognition', after: ['perception'] },
      { name: 'behavior', after: ['cognition'] },
      { name: 'dialogue', after: ['behavior'] },
    ]) {
      runner.registerStage(stage)
    }
    return runner
  }

  it('钩子按阶段拓扑序执行；顺序与钩子注册次序无关', async () => {
    const calls: string[] = []
    const wireA = (runner: PipelineRunner<{ value: string }>) => {
      runner.registerHook({ stage: 'cognition', owner: 'cog', run: () => calls.push('cognition') })
      runner.registerHook({ stage: 'perception', owner: 'per', run: () => calls.push('perception') })
    }
    const wireB = (runner: PipelineRunner<{ value: string }>) => {
      runner.registerHook({ stage: 'dialogue', owner: 'dia', run: () => calls.push('dialogue') })
      runner.registerHook({ stage: 'behavior', owner: 'beh', run: () => calls.push('behavior') })
    }
    const runner1 = makeRunner()
    wireA(runner1); wireB(runner1)
    const runner2 = makeRunner()
    wireB(runner2); wireA(runner2)

    await runner1.run(createRequestContext({ id: 'r1', core: { value: 'x' } }))
    await runner2.run(createRequestContext({ id: 'r2', core: { value: 'x' } }))
    expect(calls).toHaveLength(8)
    expect(calls.slice(0, 4)).toEqual(['perception', 'cognition', 'behavior', 'dialogue'])
    expect(calls.slice(4)).toEqual(['perception', 'cognition', 'behavior', 'dialogue'])
  })

  it('同阶段内按 priority 升序执行', async () => {
    const runner = makeRunner()
    const calls: string[] = []
    runner.registerHook({ stage: 'perception', priority: 200, run: () => calls.push('late') })
    runner.registerHook({ stage: 'perception', priority: 10, run: () => calls.push('early') })
    runner.registerHook({ stage: 'perception', run: () => calls.push('default') })
    await runner.run(createRequestContext({ id: 'p1', core: {} }))
    expect(calls).toEqual(['early', 'default', 'late'])
  })

  it('ctx.stop() 跳过后续阶段', async () => {
    const runner = makeRunner()
    const calls: string[] = []
    runner.registerHook({ stage: 'cognition', owner: 'cog', run: (ctx) => {
      calls.push('cognition')
      ctx.stop('low salience')
    } })
    runner.registerHook({ stage: 'behavior', run: () => calls.push('behavior') })
    const ctx = createRequestContext({ id: 's1', core: {} })
    await runner.run(ctx)
    expect(calls).toEqual(['cognition'])
    expect(ctx.stopped).toBe(true)
    expect(ctx.stopReason).toBe('low salience')
  })

  it('钩子抛错默认冒泡终止；isolate 钩子错误被吞并回调 onError', async () => {
    const calls: string[] = []
    const errors: Array<{ stage: string, owner?: string }> = []
    const watched = new PipelineRunner<{ value: string }>({
      onError: (error, meta) => errors.push(meta),
    })
    for (const stage of [{ name: 'a' }, { name: 'b', after: ['a'] }]) {
      watched.registerStage(stage)
    }
    watched.registerHook({
      stage: 'a', owner: 'flaky', isolate: true,
      run: () => {
        calls.push('flaky')
        throw new Error('boom')
      },
    })
    watched.registerHook({ stage: 'a', owner: 'ok', run: () => calls.push('ok') })
    watched.registerHook({ stage: 'b', run: () => calls.push('b') })
    await watched.run(createRequestContext({ id: 'w1', core: {} }))
    expect(calls).toEqual(['flaky', 'ok', 'b'])
    expect(errors).toEqual([{ stage: 'a', owner: 'flaky' }])

    const strict = makeRunner()
    strict.registerHook({ stage: 'perception', run: () => {
      throw new Error('fatal')
    } })
    strict.registerHook({ stage: 'cognition', run: () => calls.push('should-not-run') })
    await expect(strict.run(createRequestContext({ id: 'w2', core: {} }))).rejects.toThrow('fatal')
    expect(calls).not.toContain('should-not-run')
  })

  it('stages 子集运行保持拓扑序（分段执行）', async () => {
    const runner = makeRunner()
    const calls: string[] = []
    for (const [stage, owner] of [['perception', 'per'], ['cognition', 'cog'], ['behavior', 'beh'], ['dialogue', 'dia']] as const) {
      runner.registerHook({ stage, owner, run: () => calls.push(owner) })
    }
    // 第一段：刺激级；第二段：生命级。
    await runner.run(createRequestContext({ id: 'seg1', core: {} }), { stages: ['perception'] })
    await runner.run(createRequestContext({ id: 'seg2', core: {} }), { stages: ['cognition', 'behavior', 'dialogue'] })
    expect(calls).toEqual(['per', 'cog', 'beh', 'dia'])
  })
})
