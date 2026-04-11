# Elysia A.I. Development Roadmap

## 文档用途

本文档用于记录 **Elysia A.I.** 的当前开发状态、已完成事项、当前主战场与下一阶段计划。

它与其他文档的分工如下：

- `elysia-ai-top-level-design.md`
  - 记录稳定的顶层设计、核心分层、长期架构原则
- `elysia-ai-core-contracts.md`
  - 记录 `packages/core` 的正式类型、接口、事件与抽象边界
- `elysia-ai-development-roadmap.md`
  - 记录“现在做到哪里了、当前最重要的问题是什么、接下来先做什么”

**本文件正文只保留当前有效的开发状态与计划。**  
仍有价值的历史试错、阶段修正和工程经验，会在文末以附录形式保留。

---

## 一、项目当前状态（简版）

截至当前，Elysia A.I. 已经不再处于“概念讨论”阶段，而是进入：

> **主干契约持续收口、运行时主链逐步落地、正式能力包尚未完整实现** 的阶段。

可以用下面 4 句话概括当前状态：

1. **架构方向已经稳定**
   - 项目明确是“虚拟生命运行框架”，不是普通聊天插件
   - 多包分层方案已经确定，不再回退为单大包

2. **主干基础设施已经建立**
   - monorepo 根结构、workspace、turbo、基础 tsconfig 已形成
   - docs 已成为协作基础设施的一部分

3. **输入主链已经打通到 behavior**
   - body 已能把外部输入转成正式 `Stimulus`
   - runtime 已能传播真实 `Stimulus`
   - behavior 已能基于真实刺激做第一轮 planner 规划

4. **完整能力链仍未落地**
   - dialogue / brain / model-gateway 还没有形成真实执行链
   - 状态层、长期能力层、持久化层和 observability 仍未完整实现

---

## 二、当前有效的架构结论

### 2.1 项目定位
Elysia A.I. 的核心不是对话界面，而是：

> **一个以刺激、状态、行为和表达为主线的虚拟生命运行框架。**

### 2.2 主包分层
当前长期保留的主包包括：

- `core`
- `runtime`
- `body`
- `perception`
- `homeostasis`
- `cognition`
- `persona`
- `behavior`
- `dialogue`
- `brain`
- `model-gateway`
- `observatory`
- `shared`

### 2.3 核心分工
- `core`
  - 公共协议层，定义类型、schema、事件、抽象接口
- `runtime`
  - 运行时上下文、生命周期、注册中心、刺激接收与分发
- `body`
  - 外部世界与内部系统的输入输出桥接
- `behavior`
  - 刺激组织、信号计算、程序路由、响应计划生成
- `dialogue`
  - 对话任务执行层
- `brain`
  - 认知请求抽象层
- `model-gateway`
  - provider / model / routing / request / response 的统一出口

### 2.4 `brain` 与 `model-gateway` 必须分离
- `brain` 负责“我要问什么”
- `model-gateway` 负责“这个请求到底怎么发给哪个模型”

这条边界仍然有效，不应合并。

### 2.5 `dialogue` 仍保留顶级主包地位
虽然表达逻辑上属于行为的一部分，但工程上当前仍保留为顶级主包，便于形成稳定的执行边界。

---

## 三、当前代码进度（按主包）

## 3.1 `packages/core`
### 当前已完成
- 第一批核心对象类型：
  - `LifeInstance`
  - `Habitat`
  - `Bond`
  - `Thread`
  - `Stimulus`
- 对应 schema 已开始落地
- Event Bus 抽象与默认 `MemoryEventBus`
- 第一批 repository 抽象：
  - `LifeRepository`
  - `StateRepository`
  - `TraceRepository`
  - `StimulusRepository`
  - `BondRepository`
- 正式化的 dialogue / brain / gateway 契约：
  - `DialogueTask`
  - `DialogueResult`
  - `DialogueService`
  - `BrainRequest`
  - `BrainResponse`
  - `BrainCapability`
  - `BrainService`
  - `ModelGatewayRequest`
  - `ModelGatewayResponse`
  - `ProviderDescriptor`
  - `RoutingResult`
  - `ModelUsage`
  - `ModelGatewayService`
- `CoreEventMap` 已补入主链事件：
  - runtime 生命周期事件
  - `stimulus.received`
  - `behavior.selected`
  - `dialogue.*`
  - `brain.*`
  - `gateway.*`

### 当前判断
`core` 已经不再只是“基础对象 + 早期接口”，而是：

> **开始形成可支撑 dialogue / brain / model-gateway 正式分层开发的主链契约基线。**

### 当前仍未完成
- `Projection`、`BehaviorCandidate` 等对象仍未完全定型
- 部分 schema 仍需与最新正式对象继续对齐
- repository 目前仍只有抽象，没有默认实现
- 仍需继续压缩与清理历史遗留的旧契约痕迹

---

## 3.2 `packages/runtime`
### 当前已完成
- `RuntimeContext`
- `LifeRegistry`
- `HabitatRegistry`
- `DefaultRuntime`
- `createDefaultRuntime()`
- 最小生命周期主流程：
  - `start()`
  - `stop()`
  - `getState()`
  - `isRunning()`
- manifest 加载入口
- 接收并传播真实 `Stimulus`
- 发出 `stimulus.received`
- 发出 runtime 生命周期事件
- 第一批 runtime 日志

### 当前判断
`runtime` 已经具备：

> **最小运行时主干**

但还没有进入“完整运行时能力层”阶段。

### 当前仍未完成
- life routing
- scheduler 真正调度
- manifest 深化治理
- 更完整的运行期状态管理
- 宿主交付层最终收口

---

## 3.3 `packages/body`
### 当前已完成
- `PlatformMessage`
- `sessionToPlatformMessage()`
- `PlatformMessage -> Stimulus` 的第一轮正式转换
- `handlePlatformMessage(runtime, message)`
- `KoishiBodyAdapter`
- body 插件入口 `apply()`
- body 输入链日志

### 当前判断
`body` 已经不再是空壳，而是：

> **开始承担 Koishi 宿主输入接入与 Stimulus 标准化桥接职责。**

### 当前仍未完成
- `StimulusBuilder / StimulusNormalizer` 进一步收束
- sender 正式输出链
- 多 Bot / 多平台输入治理细化

---

## 3.4 `packages/behavior`
### 当前已完成
- 正式类型：
  - `StimulusScope`
  - `StimulusBucket`
  - `StimulusSignal`
  - `ProgramRoutingDecision`
  - `ResponsePlan`
  - `BehaviorPlanningContext`
- 第一轮实现：
  - `resolveStimulusScope()`
  - signal 计算
  - program routing
  - `ResponsePlan` 生成
- behavior 插件入口已接入：
  - 监听 `stimulus.received`
  - 计算 `scope / signal / decision / plan`
  - 发出 `behavior.selected`

### 当前判断
`behavior` 已经形成：

> **真实 stimulus -> planner payload 的第一轮正式主干**

但还只是第一轮 planner，不是完整行为系统。

### 当前仍未完成
- 真实 bucket / buffer 池
- AI enhanced interpretation
- `ResponsePlan -> dialogue / memory / scheduler` 的执行链
- 候选行为与行为执行编排

---

## 3.5 `packages/dialogue`
### 当前已完成
- `core` 层的 `DialogueTask / DialogueResult / DialogueService` 契约

### 当前仍未完成
- 正式 dialogue 包实现
- `ResponsePlan -> DialogueTask` 转换
- dialogue 执行主流程
- 与 brain 的正式连接

---

## 3.6 `packages/brain`
### 当前已完成
- 正式请求/响应/能力抽象已经进入 `core`

### 当前仍未完成
- 包级正式实现
- capability 驱动逻辑
- 与 dialogue 的正式协作
- 与 model-gateway 的实际连接

---

## 3.7 `packages/model-gateway`
### 当前已完成
- 正式请求/响应/provider/routing 抽象已经进入 `core`

### 当前仍未完成
- provider registry
- routing 规则
- request / response normalization
- channel 实现
- 至少一套真实 provider 接入

---

## 3.8 其他能力层
以下包仍主要处于预留 / 骨架阶段：

- `perception`
- `homeostasis`
- `cognition`
- `persona`
- `observatory`
- `shared`

---

## 四、当前真正的主战场

当前项目最重要的工作，不是继续增加新目录，也不是继续抽象讨论，而是：

> **把已经形成的主干契约、输入主链和行为主链继续收口，并推进到 dialogue / brain / model-gateway 的正式实现层。**

当前主战场可以概括为 3 条线：

### 4.1 主干契约线
继续稳定：
- `Stimulus`
- `behavior.selected`
- `dialogue.*`
- `brain.*`
- `gateway.*`
- `DialogueTask / DialogueResult / DialogueService`
- `BrainService`
- `ModelGatewayService`
- `StimulusRepository / BondRepository`

### 4.2 输入与计划线
继续收口：
- body 中的 `StimulusBuilder / StimulusNormalizer`
- behavior 中的 bucket / buffer / signal / route / plan 主链
- runtime 中的 life routing 与运行时治理

### 4.3 正式执行链
开始从契约进入实现：
- `ResponsePlan -> DialogueTask`
- `DialogueService`
- `BrainService`
- `ModelGatewayService`
- 最终输出与 sender

---

## 五、当前不该优先做的事情

在上面三条主线没有收口前，以下内容不应抢优先级：

- 复杂 persona 设计
- 长期记忆算法细节
- Mongo / Redis 生产级实现
- observatory 全量实现
- 大量 UI / demo 导向开发
- 为了“先跑通”而引入大量临时 mock 主链路

这些内容都重要，但不该早于主链契约与正式执行链。

---

## 六、下一阶段计划

## 6.1 近期优先级（当前建议）
### 第一优先级：`dialogue` 第一轮正式实现
目标：
- 消费 `behavior.selected`
- 生成 `DialogueTask`
- 形成 `dialogue.started / completed / failed` 主链

### 第二优先级：`ResponsePlan -> DialogueTask` 转换层
目标：
- 把现有 behavior planner 输出真正接到 dialogue 入口

### 第三优先级：brain / gateway 包实现起步
目标：
- 让 `DialogueService` 后面开始有真实认知链可接
- 不是继续只停留在 core 契约层

### 第四优先级：body/runtime/behavior 继续收口
目标：
- 补齐 StimulusBuilder / Normalizer
- 补齐 bucket / buffer
- 补 runtime routing

---

## 6.2 阶段性执行顺序
建议按下面顺序推进：

1. 先实现 `dialogue`
2. 再接 `brain`
3. 再接 `model-gateway`
4. 同时并行收口 body/runtime/behavior 中仍明显未完成的正式结构
5. 最后再推进状态层与长期能力层

---

## 七、当前阶段一句话总结

截至当前，最准确的状态是：

> **Elysia A.I. 已经完成架构定型、输入主链落地和第一轮行为规划主干；`core` 已形成 dialogue / brain / model-gateway 的正式契约基线，下一步应进入 dialogue 第一轮正式实现，而不是继续停留在抽象层或最小演示导向。**

---

## 附录 A：保留的历史经验

本节保留仍有价值但不应继续污染正文主线的历史试错信息。

### A.1 Koishi 宿主接入经验
已验证以下事实仍然有效：

- 宿主入口包不能只按普通 workspace 包处理
- 源码层编译通过不等于 Koishi Loader 可稳定加载
- 发布层必须独立考虑入口字段、exports 与产物对齐

历史上真实出现过：

- `ERR_UNSUPPORTED_DIR_IMPORT`
- `ERR_MODULE_NOT_FOUND`
- `TypeError: Class extends value #<Object> is not a constructor or null`

这些记录说明：
- NodeNext 相对导入规则不能放松
- 插件交付形态必须独立治理
- Loader 兼容性不能只靠源码层修复

---

### A.2 monorepo 路径解析经验
当前已经验证：

- `workspace + package name + exports + references`
  可以作为主干跨包解析基础
- 不应继续依赖根级 `paths` 作为长期主方案

---

### A.3 roadmap 维护原则
从现在开始，本文件只保留：
- 当前有效状态
- 当前主战场
- 下一阶段计划
- 少量必要历史经验附录

不再继续堆积：
- “本轮新增内容补充”
- “又一轮修正”
- “旧判断 + 新判断并存”
- 大量重复的阶段性追加文本
