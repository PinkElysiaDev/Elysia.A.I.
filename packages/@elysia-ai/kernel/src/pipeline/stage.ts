/**
 * 管线阶段定义与确定性排序。
 *
 * 解决 Koishi 广播-监听模型的"插件处理顺序靠加载顺序隐式决定"短板：
 * 阶段通过显式 before/after 声明构成 DAG，同约束阶段按名称字典序破平，
 * 排序结果与注册/加载顺序完全无关（可测试证明）。
 */

export interface PipelineStage {
  /** 阶段唯一名，建议点分层级命名（如 'perception'、'behavior.decide'）。 */
  name: string
  /** 本阶段必须晚于这些阶段执行。 */
  after?: string[]
  /** 本阶段必须早于这些阶段执行。 */
  before?: string[]
}

export class PipelineTopologyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineTopologyError'
  }
}

/**
 * 对阶段集合做拓扑排序（Kahn 算法 + 名称字典序破平）。
 *
 * - before/after 双向建边；引用了未声明的阶段名时将其视为隐式阶段
 *   （无约束节点参与排序），第三方插件可挂载宿主尚未声明的阶段。
 * - 约束相同时按 name 字典序输出，保证结果只由声明决定。
 * - 出现环时抛出 PipelineTopologyError，附环上的节点。
 */
export function sortStages(stages: PipelineStage[]): string[] {
  // 汇总全部阶段名（显式 + 隐式引用）。
  const names = new Set<string>()
  for (const stage of stages) {
    names.add(stage.name)
    for (const dep of stage.after ?? []) names.add(dep)
    for (const target of stage.before ?? []) names.add(target)
  }

  // edges: a -> b 表示 a 必须先于 b。
  const edges = new Map<string, Set<string>>([...names].map((name) => [name, new Set<string>()]))
  const addEdge = (from: string, to: string) => {
    if (from === to) return
    edges.get(from)?.add(to)
  }
  for (const stage of stages) {
    for (const dep of stage.after ?? []) addEdge(dep, stage.name)
    for (const target of stage.before ?? []) addEdge(stage.name, target)
  }

  const indegree = new Map<string, number>([...names].map((name) => [name, 0]))
  for (const [, targets] of edges) {
    for (const target of targets) {
      indegree.set(target, (indegree.get(target) ?? 0) + 1)
    }
  }

  // 字典序破平的待处理堆（用排序数组模拟，阶段数量小，无需真堆）。
  const pending = [...names].sort()
  const ordered: string[] = []
  while (pending.length > 0) {
    let pickedIndex = -1
    for (let i = 0; i < pending.length; i++) {
      if ((indegree.get(pending[i]) ?? 0) === 0) {
        pickedIndex = i
        break
      }
    }
    if (pickedIndex === -1) {
      throw new PipelineTopologyError(
        `pipeline stage cycle detected involving: ${pending.join(', ')}`,
      )
    }
    const [name] = pending.splice(pickedIndex, 1)
    ordered.push(name)
    for (const target of edges.get(name) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
    }
  }
  return ordered
}

/** 校验阶段子集保持拓扑序（用于 runner 的 stage 过滤执行）。 */
export function filterStagesInOrder(allStages: PipelineStage[], subset: Set<string>): string[] {
  return sortStages(allStages).filter((name) => subset.has(name))
}
