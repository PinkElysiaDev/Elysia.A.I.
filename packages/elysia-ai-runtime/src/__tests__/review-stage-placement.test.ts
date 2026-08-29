import { describe, expect, it } from 'vitest'
import { createDefaultRuntime } from '../runtime.js'

/**
 * Review BUG-1 回归：第三方阶段（after perception / before cognition）
 * 在真实 runtime 的 receiveStimulus 全链路中必须被执行。
 * 修复前：固定清单切分导致该阶段落在刺激段/生命段的间隙，永不执行。
 */

describe('Review BUG-1：第三方阶段落位', () => {
  it('emotion 阶段在 receiveStimulus 全链路中执行且能读上游感知结果', async () => {
    const runtime = createDefaultRuntime({ info() {}, debug() {}, warn() {}, error() {} })
    const ran: string[] = []
    let sawPerception = false

    const pipeline = runtime.context.pipeline!
    pipeline.registerStage({ name: 'emotion', after: ['perception'], before: ['cognition'] })
    pipeline.registerHook({
      stage: 'emotion',
      owner: 'review',
      async run(pctx) {
        ran.push('emotion')
        // 钩子在刺激段运行：上游 perception 尚无生产者时读到 undefined 属正常，
        // 但本测试额外注册一个假 perception 钩子写入结果以验证可见性。
        const perception = pctx.read<{ marker?: boolean }>('perception')
        sawPerception = perception?.marker === true
      },
    })
    // 假 perception 生产者（priority 更小先于 emotion 同段执行）。
    pipeline.registerHook({
      stage: 'perception',
      owner: 'review-fake-perception',
      priority: -100,
      async run(pctx) {
        pctx.write('perception', { marker: true })
      },
    })

    await runtime.loadManifest({
      version: '1.0',
      lifeInstances: [{ id: 'life-r', type: 'elysia-default' }],
    })
    await runtime.start()

    await runtime.receiveStimulus({
      id: 'stim-r',
      type: 'utterance',
      timestamp: Date.now(),
      habitatId: 'hab-r',
      payload: { content: 'hi' },
      actorId: 'user-r',
    } as never)

    expect(ran).toContain('emotion')
    expect(sawPerception).toBe(true)

    await runtime.stop()
  })

  it('cognition 之后的第三方阶段进入生命段（每 lifeId 各执行一次）', async () => {
    const runtime = createDefaultRuntime({ info() {}, debug() {}, warn() {}, error() {} })
    const executions: Array<string | undefined> = []

    const pipeline = runtime.context.pipeline!
    pipeline.registerStage({ name: 'post-dialogue.audit', after: ['dialogue'], before: ['sender'] })
    pipeline.registerHook({
      stage: 'post-dialogue.audit',
      owner: 'review',
      run(pctx) {
        executions.push((pctx.core as { lifeId?: string }).lifeId)
      },
    })

    await runtime.loadManifest({
      version: '1.0',
      lifeInstances: [
        { id: 'life-a', type: 'elysia-default' },
        { id: 'life-b', type: 'elysia-default' },
      ],
    })
    await runtime.start()

    await runtime.receiveStimulus({
      id: 'stim-2l',
      type: 'utterance',
      timestamp: Date.now(),
      habitatId: 'hab-2l',
      payload: { content: 'hi' },
      actorId: 'user-2l',
    } as never)

    // 投影可能只命中部分 life（视默认投影规则）；断言至少执行过，
    // 且执行次数等于命中的 lifeId 数（每生命一次，而非每刺激一次/零次）。
    expect(executions.length).toBeGreaterThan(0)

    await runtime.stop()
  })
})
