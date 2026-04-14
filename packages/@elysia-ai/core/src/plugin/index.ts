/**
 * Elysia A.I. Plugin 标准接口统一导出
 * 
 * 此模块提供插件开发所需的所有标准接口：
 * - ElysiaPluginManifest：插件身份与能力声明
 * - PipelineContext：流水线统一容器
 * - ElysiaPluginHook：流水线 hook 接口
 */

export type { ElysiaLayer, ElysiaPluginManifest } from './manifest.js'
export type {
  PipelineTraceEntry,
  PipelineContext,
} from './pipeline-context.js'
export { createPipelineContext, writePluginExt } from './pipeline-context.js'
export type { ElysiaStage, ElysiaPluginHook } from './hooks.js'
export { executeHooks } from './hooks.js'
