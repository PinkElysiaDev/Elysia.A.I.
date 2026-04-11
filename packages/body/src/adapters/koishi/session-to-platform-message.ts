import type { Session } from 'koishi'
import type { PlatformMessage } from '../../types/index.js'

/**
 * 将 Koishi session 转换为 PlatformMessage
 * 
 * @param session Koishi 会话对象
 * @returns 平台无关的消息格式
 */
export function sessionToPlatformMessage(session: Session): PlatformMessage {
  const quote = (session.quote as { id?: string } | undefined) ?? undefined

  return {
    id: String(session.messageId ?? session.id),
    platform: session.platform,
    botId: session.selfId ?? '',
    guildId: session.guildId,
    channelId: session.channelId,
    userId: session.userId,
    content: session.content ?? '',
    timestamp: session.timestamp,
    replyToMessageId: quote?.id ? String(quote.id) : undefined,
    isDirectMessage: !session.guildId,
    isMentioned: Array.isArray(session.elements)
      ? session.elements.some((element) => element.type === 'at')
      : false,
  }
}
