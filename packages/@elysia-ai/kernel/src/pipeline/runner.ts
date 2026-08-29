/**
 * 管线调度器：按拓扑序执行阶段，阶段内按优先级执行钩子。
 *
 * 这是"命令走阶段、事实走事件"双轨模型的命令侧：
 * - 钩子声明 `stage + priority`（数值小者先执行，默认 100）；
 * - 阶段顺序由 before/after DAG 决定，与注册/加载顺序无关；
 * - 任一钩子 ctx.stop() 后跳过后续阶段（低显著性丢弃等）；
 * - 钩子抛错默认中断本次运行并向上冒泡（处理步骤失败是命令侧错误，
 *   与事件侧的监听者隔离语义相反）；
 * - 每阶段自动生成 trace span。
 */

import type { RequestContext } from './context.js'
import { filterStagesInOrder, sortStages, PipelineTopologyError, type PipelineStage } from './stage.js'

export interface PipelineHook<TCore = unknown> {
  /** 挂载的阶段名；可以是宿主声明的阶段，也可以是第三方引入的隐式阶段。 */
  stage: string
  /** 执行优先级，数值小者先执行。默认 100。 */
  priority?: number
  /** 归属标识（插件 manifest 名），用于诊断与 trace。 */
  owner?: string
  /** 是否吞掉钩子错误（默认 false：错误冒泡终止本次管线）。 */
  isolate?: boolean
  run(ctx: RequestContext<TCore>): void | Promise<void>
}

export interface PipelineRunOptions {
  /** 只执行这些阶段（保持拓扑序）；缺省执行全部。用于分段运行（per-stimulus / per-life）。 */
  stages?: string[]
}

interface RegisteredHook<TCore> extends PipelineHook<TCore> {
  seq: number
}

export class PipelineRunner<TCore = unknown> {
  private readonly stages = new Map<string, PipelineStage>()
  private readonly hooks = new Map<string, RegisteredHook<TCore>>()
  private nextSeq = 0
  private cachedOrder: string[] | undefined
  private readonly onError?: (error: unknown, meta: { stage: string, owner?: string }) => void

  constructor(options: { onError?: (error: unknown, meta: { stage: string, owner?: string }) => void } = {}) {
    this.onError = options.onError
  }

  /** 注册阶段；同名重复注册以先注册者为准。返回注销函数。 */
  registerStage(stage: PipelineStage): () => void {
    if (!this.stages.has(stage.name)) {
      this.stages.set(stage.name, stage)
      this.cachedOrder = undefined
    }
    return () => {
      this.stages.delete(stage.name)
      this.cachedOrder = undefined
    }
  }

  /** 注册钩子。返回注销函数。 */
  registerHook(hook: PipelineHook<TCore>): () => void {
    const registered: RegisteredHook<TCore> = { ...hook, seq: this.nextSeq++ }
    const key = `h${registered.seq}`
    this.hooks.set(key, registered)
    this.cachedOrder = undefined
    return () => {
      this.hooks.delete(key)
      this.cachedOrder = undefined
    }
  }

  /** 当前拓扑序（缓存；注册变更后失效）。排序失败抛 PipelineTopologyError。 */
  getStageOrder(): string[] {
    this.cachedOrder ??= sortStages([...this.stages.values()])
    return [...this.cachedOrder]
  }

  /** 按 stage 名取钩子（阶段内按 priority 升序、同优先级按注册序稳定排列）。 */
  getHooksForStage(stage: string): PipelineHook<TCore>[] {
    return [...this.hooks.values()]
      .filter((hook) => hook.stage === stage)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.seq - b.seq)
      .map(({ seq: _seq, ...hook }) => hook)
  }

  /**
   * 执行管线：按拓扑序遍历阶段，逐阶段执行钩子。
   * ctx.stop() 后跳过剩余阶段；钩子错误（非 isolate）冒泡终止。
   * 结束后对"有钩子但未出现在本次执行阶段集合"的阶段输出 debug 日志
   * （挂载到从未注册阶段的钩子可观测，不再静默跳过）。
   */
  async run(ctx: RequestContext<TCore>, options: PipelineRunOptions = {}): Promise<void> {
    const order = options.stages
      ? filterStagesInOrder([...this.stages.values()], new Set(options.stages))
      : this.getStageOrder()
    const executed = new Set(order)

    for (const stage of order) {
      if (ctx.stopped) return
      const hooks = this.getHooksForStage(stage)
      if (hooks.length === 0) continue
      await ctx.trace.span(`stage:${stage}`, async () => {
        for (const hook of hooks) {
          if (ctx.stopped) return
          const label = hook.owner ? `${stage}#${hook.owner}` : stage
          try {
            await ctx.trace.span(`hook:${label}`, () => hook.run(ctx), {
              stage,
              owner: hook.owner,
              priority: hook.priority ?? 100,
            })
          } catch (error) {
            this.onError?.(error, { stage, owner: hook.owner })
            if (!hook.isolate) throw error
          }
        }
      })
    }

    if (!options.stages) return
    const stageWithHooks = new Set<string>()
    for (const hook of this.hooks.values()) {
      stageWithHooks.add(hook.stage)
    }
    for (const stage of stageWithHooks) {
      if (!executed.has(stage)) {
        console.debug('[elysia-ai-kernel:pipeline] hooks registered for a stage outside this run', {
          plugin: 'elysia-ai-kernel',
          phase: 'pipeline',
          stage,
          hint: 'stage not registered, or excluded by the stages subset',
        })
      }
    }
  }
}

export { PipelineTopologyError, type PipelineStage }
