/**
 * 测试 harness：不起完整 Koishi app 就能装配单个插件/模块。
 *
 * 提供 kernel 全套原语的内存实现（事件总线、管线调度器、上下文存储、
 * 生命周期、manifest 注册表），插件测试把被测模块的 wire 函数挂到
 * harness 上即可驱动管线并断言事件与上下文。
 */

import { MemoryEventBus } from '../events/memory-event-bus.js'
import type { EventBus } from '../events/event-bus.js'
import { LifecycleManager } from '../lifecycle/lifecycle.js'
import { PipelineRunner } from '../pipeline/runner.js'
import { RequestContextStore, createRequestContext } from '../pipeline/context.js'
import { PluginManifestRegistry, type KernelPluginManifest } from '../registry/manifest.js'

export interface KernelHarness<EventMap extends object> {
  bus: EventBus<EventMap>
  runner: PipelineRunner<unknown>
  contexts: RequestContextStore
  lifecycle: LifecycleManager
  manifests: PluginManifestRegistry
  /** 便捷：创建请求上下文并跑一遍管线（trace 完成回调可选）。 */
  runPipeline<TCore>(options: {
    id: string
    core: TCore
    stages?: string[]
    onTraceFinished?: (root: import('../trace/trace.js').TraceSpan) => void
  }): Promise<void>
  /** 便捷：注册 manifest + 记录待注销句柄，disposeHarness 一并清理。 */
  register(manifest: KernelPluginManifest): void
}

export function createHarness<EventMap extends object>(): KernelHarness<EventMap> {
  const bus = new MemoryEventBus<EventMap>()
  const runner = new PipelineRunner<unknown>({
    onError: (error, meta) => {
      console.error('[elysia-ai-kernel:harness] pipeline hook failed', { ...meta, error })
    },
  })
  const contexts = new RequestContextStore()
  const lifecycle = new LifecycleManager()
  const manifests = new PluginManifestRegistry()
  const disposers: Array<() => void> = []

  return {
    bus,
    runner,
    contexts,
    lifecycle,
    manifests,
    async runPipeline(options) {
      const context = createRequestContext<unknown>({
        id: options.id,
        core: options.core,
        onTraceFinished: options.onTraceFinished,
      })
      try {
        await runner.run(context, options.stages ? { stages: options.stages } : {})
      } finally {
        context.trace.finish()
      }
    },
    register(manifest) {
      disposers.push(manifests.register(manifest))
    },
  }
}

/** harness 不内置 dispose 聚合（各原语自行 GC）；此函数预留给宿主扩展。 */
export function disposeHarness(harness: KernelHarness<object>): void {
  void harness
}
