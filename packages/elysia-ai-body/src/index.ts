import { Context, Schema } from 'koishi'
import type { BodyService } from '@elysia-ai/core'
import { NS_DIALOGUE_OUTPUT, STAGE_SENDER } from '@elysia-ai/core'
import type { Runtime } from 'koishi-plugin-elysia-ai-runtime'
import { getRequiredElysiaService, registerElysiaService } from '@elysia-ai/shared'
import { KoishiBodyAdapter } from './adapters/koishi/index.js'
import {
  createPlatformSendTaskFromDialogue,
  OutboundRouteRegistry,
  RouteMessageSender,
} from './sender/index.js'

export const name = 'elysia-ai-body'

// 声明对 runtime 的必需依赖：cordis 会在 elysia.runtime 就绪后再跑本插件 apply。
export const inject = ['elysia.runtime']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export interface BodyPluginService extends BodyService {}

declare module 'koishi' {
  interface Context {
    'elysia.runtime'?: Runtime
    'elysia-ai-runtime'?: Runtime
    'elysia.body'?: BodyPluginService
    'elysia-ai-body'?: BodyPluginService
  }
}

export { handlePlatformMessage } from './message-handler.js'
export * from './types/index.js'
export * from './normalize/session-to-stimulus.js'
export * from './sender/index.js'
export * from './adapters/koishi/index.js'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('elysia-ai-body')

  logger.info('body plugin apply started', {
    plugin: 'elysia-ai-body',
    phase: 'apply',
  })

  const runtime = getRequiredElysiaService<Runtime>(ctx, {
    formalName: 'elysia.runtime',
    legacyName: 'elysia-ai-runtime',
    logger,
    plugin: 'elysia-ai-body',
    description: 'runtime service',
  })

  if (!runtime) {
    return
  }

  logger.debug('runtime dependency resolved for body plugin', {
    plugin: 'elysia-ai-body',
    phase: 'apply',
  })

  const outboundRoutes = new OutboundRouteRegistry()
  const sender = new RouteMessageSender(outboundRoutes)

  const bodyService: BodyPluginService = {
    getOutboundRoutes() { return outboundRoutes },
    getSender() { return sender },
    getDiagnostics() {
      return {
        plugin: 'elysia-ai-body',
        enabled: true,
        ready: true,
        serviceName: 'elysia.body',
      }
    },
  }

  // kernel 兼容治理：sender 阶段钩子（Phase 2 落地，事件兜底先行）。
  const unregisterManifest = runtime.context.manifests?.register({
    name: 'elysia-ai-body',
    version: '0.2.0',
    services: { provides: ['elysia.body'], consumes: ['elysia.runtime'] },
    stages: { hooks: ['sender'] },
  })

  registerElysiaService(ctx, {
    formalName: 'elysia.body',
    legacyName: 'elysia-ai-body',
    service: bodyService,
    logger,
    plugin: 'elysia-ai-body',
  })

  const adapter = new KoishiBodyAdapter(ctx, runtime, {
    ...config,
    outboundRoutes,
  })
  adapter.registerListeners()

  // 发送逻辑：sender 阶段钩子与事件兜底两条路径共用。
  const sendOutput = async (output: import('@elysia-ai/core').CoreEventMap['dialogue.output.created']): Promise<void> => {
    const { task, result } = output

    if (task.mode !== 'reply-now') {
      logger.debug('body sender skipped non-reply dialogue output', {
        plugin: 'elysia-ai-body',
        phase: 'sender',
        mode: task.mode,
        stimulusId: output.stimulusId,
        outputId: output.outputId,
      })
      return
    }

    const sourceStimulusId = output.stimulusId
    const route = sourceStimulusId ? outboundRoutes.get(sourceStimulusId) : undefined
    const sendTask = createPlatformSendTaskFromDialogue(task, result, route)

    try {
      await runtime.context.eventBus.emit('sender.started', { task: sendTask })
      await sender.send(sendTask)
      await runtime.context.eventBus.emit('sender.completed', { task: sendTask })
      await runtime.context.eventBus.emit('body.message.sent', { task: sendTask })

      logger.info('body sender completed dialogue output', {
        plugin: 'elysia-ai-body',
        phase: 'sender',
        stimulusId: sourceStimulusId,
        outputId: output.outputId,
        channelId: sendTask.target.channelId,
        outputLength: sendTask.content.length,
      })
    } catch (error) {
      await runtime.context.eventBus.emit('sender.failed', { task: sendTask, error })
      await runtime.context.eventBus.emit('body.message.failed', { task: sendTask, error })

      logger.error('body sender failed dialogue output', error, {
        plugin: 'elysia-ai-body',
        phase: 'sender',
        stimulusId: sourceStimulusId,
        outputId: output.outputId,
        channelId: sendTask.target.channelId,
      })
    }
  }

  // ── 装配：sender 阶段钩子优先（读共享上下文累积的输出），事件兜底 ──
  const pipeline = runtime.context.pipeline
  const disposeDialogueOutput = pipeline
    ? pipeline.registerHook({
        stage: STAGE_SENDER,
        owner: 'elysia-ai-body',
        async run(pctx) {
          const outputs = pctx.read<import('@elysia-ai/core').CoreEventMap['dialogue.output.created'][]>(NS_DIALOGUE_OUTPUT) ?? []
          for (const output of outputs) {
            await sendOutput(output)
          }
        },
      })
    : runtime.context.eventBus.on('dialogue.output.created', (output) => sendOutput(output))

  logger.info('body adapter registered', {
    plugin: 'elysia-ai-body',
    phase: 'adapter',
  })

  ctx.on('dispose', () => {
    disposeDialogueOutput()
    outboundRoutes.clear()
    adapter.removeListeners()
    logger.info('body adapter disposed', {
      plugin: 'elysia-ai-body',
      phase: 'dispose',
    })
  })
}
