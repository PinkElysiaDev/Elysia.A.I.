
export interface MessageSender {
  send(channelId: string, content: string): Promise<void>
}
