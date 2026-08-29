import type {
  DialogueResult,
  DialogueTask,
} from '@elysia-ai/core'
import type { PlatformMessage } from '../types/index.js'

export interface PlatformSendTarget {
  platform?: string
  botId?: string
  guildId?: string
  channelId?: string
  userId?: string
  habitatId?: string
  sourceStimulusId?: string
}

export interface PlatformSendTask {
  target: PlatformSendTarget
  content: string
  metadata?: Record<string, unknown>
}

export interface MessageSender {
  send(task: PlatformSendTask): Promise<void>
}

export interface OutboundRoute {
  sourceStimulusId: string
  message: PlatformMessage
  send(content: string): Promise<void>
}

const DEFAULT_MAX_ROUTES = 500

/**
 * body 层短期输出路由表。
 *
 * 当前阶段 dialogue.completed 只携带 sourceStimulusIds，不直接携带 Koishi session。
 * 因此 body 在接收输入时记录 stimulusId → 平台输出路由，
 * 输出时再通过 sourceStimulusId 找回发送目标。
 *
 * 这是 body 内部的短期桥接状态，不作为长期事实源。
 */
export class OutboundRouteRegistry {
  private routes = new Map<string, OutboundRoute>()

  constructor(private readonly maxRoutes = DEFAULT_MAX_ROUTES) {}

  remember(route: OutboundRoute): void {
    this.routes.set(route.sourceStimulusId, route)

    if (this.routes.size <= this.maxRoutes) return

    const oldestKey = this.routes.keys().next().value
    if (oldestKey) {
      this.routes.delete(oldestKey)
    }
  }

  get(sourceStimulusId: string): OutboundRoute | undefined {
    const direct = this.routes.get(sourceStimulusId)
    if (direct) return direct

    // followup 重放的 stimulus id 形如 "<原id>:followup:<ts>"，不在本表登记。
    // 剥掉后缀回退查原始入站消息的路由，延迟回复才能发回原会话（P1-7）。
    const marker = sourceStimulusId.indexOf(':followup:')
    if (marker > 0) {
      return this.routes.get(sourceStimulusId.slice(0, marker))
    }
    return undefined
  }

  clear(): void {
    this.routes.clear()
  }

  get size(): number {
    return this.routes.size
  }
}

export function createPlatformSendTaskFromDialogue(
  task: DialogueTask,
  result: DialogueResult,
  route?: OutboundRoute
): PlatformSendTask {
  const sourceStimulusId = route?.sourceStimulusId ?? task.sourceStimulusIds[0]

  return {
    target: {
      platform: route?.message.platform,
      botId: route?.message.botId,
      guildId: route?.message.guildId,
      channelId: route?.message.channelId,
      userId: route?.message.userId,
      habitatId: task.habitatId,
      sourceStimulusId,
    },
    content: result.output,
    metadata: {
      taskId: result.taskId,
      dialogueMode: task.mode,
      sourceStimulusIds: task.sourceStimulusIds,
      sourceMessageId: route?.message.id,
    },
  }
}

export class RouteMessageSender implements MessageSender {
  constructor(private readonly routes: OutboundRouteRegistry) {}

  async send(task: PlatformSendTask): Promise<void> {
    const sourceStimulusId = task.target.sourceStimulusId
    if (!sourceStimulusId) {
      throw new Error('sourceStimulusId is required for route-based sending')
    }

    const route = this.routes.get(sourceStimulusId)
    if (!route) {
      throw new Error(`Outbound route not found for stimulus "${sourceStimulusId}"`)
    }

    await route.send(task.content)
  }
}
