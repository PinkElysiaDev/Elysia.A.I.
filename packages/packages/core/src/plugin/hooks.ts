/**
 * Elysia A.I. 插件 Hook 接口
 * 
 * 插件通过注册 hook 来参与生命流水线的处理过程。
 * 每个 hook 绑定到特定的处理阶段（stage），在阶段触发时执行。
 */

import type { PipelineContext } from './pipeline-context.js'

/**
 * 可用的处理阶段（stage）列表
 * 
 * 每个 stage 对应生命流水线上的一个处理节点
 */
export type ElysiaStage =
  | 'body.message.normalized'    // body 层完成消息标准化后
  | 'stimulus.received'          // runtime 收到 stimulus 后
  | 'perception.filter'          // perception 做注意力筛选时
  | 'perception.completed'       // perception 完成后
  | 'homeostasis.tick'           // homeostasis 每次状态更新时
  | 'homeostasis.updated'        // homeostasis 完成更新后
  | 'cognition.reasoning'        // cognition 推理过程中
  | 'cognition.completed'        // cognition 完成推理后
  | 'behavior.candidates'        // behavior 生成候选行为时
  | 'behavior.selected'          // behavior 选定行为后
  | 'dialogue.before.render'     // dialogue 渲染前
  | 'dialogue.after.render'      // dialogue 渲染完成后

/**
 * 插件 Hook 接口
 * 
 * 插件通过实现此接口来参与特定阶段的处理流程。
 * 
 * @typeParam TCore 当前阶段的核心数据类型
 */
export interface ElysiaPluginHook<TCore = unknown> {
  /**
   * 此 hook 挂载的处理阶段
   */
  stage: ElysiaStage | string

  /**
   * hook 执行函数
   * 插件在此函数中读取 ctx.core 并向 ctx.ext[namespace] 写入扩展数据
   */
  run(ctx: PipelineContext<TCore>): Promise<void> | void
}

/**
 * 插件 Hook 执行器
 * 按优先级顺序执行所有注册的 hooks
 */
export async function executeHooks<TCore>(
  ctx: PipelineContext<TCore>,
  hooks: Array<ElysiaPluginHook<TCore>>
): Promise<void> {
  for (const hook of hooks) {
    await hook.run(ctx)
  }
}
