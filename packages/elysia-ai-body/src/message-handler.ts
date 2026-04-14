/**
 * body 层核心消息处理函数
 *
 * 此文件只包含纯逻辑函数，不依赖 Koishi。
 * 可以在测试中直接导入，无需 mock Koishi 模块。
 *
 * 设计说明：
 * - handlePlatformMessage：外部平台消息 → Stimulus → runtime 的统一入口
 * - 与 KoishiBodyAdapter 共享同一个 platformMessageToStimulus() 函数
 * - body 层不做任何行为判断（要不要回复），只负责消息接收和转换
 */

import type { PlatformMessage } from './types/index.js'
import { platformMessageToStimulus } from './normalize/session-to-stimulus.js'
import type { Runtime } from 'koishi-plugin-elysia-ai-runtime'

/**
 * 处理平台消息并注入 runtime
 *
 * 这是 body 层的核心入口函数，负责：
 * 1. 将平台无关消息（PlatformMessage）转换为系统内部刺激（Stimulus）
 * 2. 将刺激注入运行中的 runtime
 *
 * 使用统一的 platformMessageToStimulus() 进行转换，
 * 与 KoishiBodyAdapter 共享同一转换路径，确保行为一致。
 *
 * @param runtime 已启动的 runtime 实例
 * @param message 平台无关的消息对象
 */
export async function handlePlatformMessage(
  runtime: Runtime,
  message: PlatformMessage
): Promise<void> {
  // 统一通过 platformMessageToStimulus 构造 Stimulus
  // 与 KoishiBodyAdapter 共享同一转换函数，避免行为分叉
  const stimulus = platformMessageToStimulus(message)
  await runtime.receiveStimulus(stimulus)
}
