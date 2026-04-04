# Elysia A.I. Development Roadmap

## 文档用途

本文档用于记录 **Elysia A.I.** 的**长期开发进度**、阶段性结论、当前真实状态、未完成事项与下一步施工计划。

它和其他文档的职责区别如下：

- `elysia-ai-top-level-design.md`
  - 负责记录稳定的顶层设计、核心抽象、长期架构原则
- `elysia-ai-core-contracts.md`
  - 负责记录 `packages/core` 的核心契约、类型、接口与实现边界
- `elysia-ai-development-roadmap.md`
  - 负责记录项目推进过程中的**开发进度、阶段成果、当前缺口、接下来该做什么**

这份文档适合在以下场景使用：

- 多窗口协作开发时快速同步当前进度
- 回顾“我们已经做了什么”
- 明确“当前已经拍板了哪些架构和工程结论”
- 判断“哪些东西已经不是讨论阶段，而是已经开始落地”
- 指引下一阶段优先实现什么

---

## 项目当前总体状态

截至当前，**Elysia A.I. 已经完成架构定型，并进入核心抽象与最小运行链路的早期实现阶段。**

项目已经不再是：

> “一个想法 / 一个概念性插件目录”

而是已经进入：

> “一个正式的、多包、多插件、可持续推进的虚拟生命运行框架工程”

当前真实状态可以概括为：

1. 顶层设计已经基本定型
2. monorepo 工程骨架与根配置已经开始真正成型
3. 主包分层与职责边界已经拍板
4. `packages/core` 的第一批核心类型 / schema / 接口已经完成第一轮落地
5. `packages/core` 与 `packages/runtime` 已经出现第一批默认内存实现
6. `packages/runtime` 已经从纯接口推进到最小默认实现阶段
7. 最近一轮工作的重点已经从“继续搭目录”切换到“修通工程链路并开始打通 body → runtime”

---

## 一、当前已拍板的核心结论

### 1. Elysia A.I. 的本质不是聊天插件，而是虚拟生命运行框架

已明确：

- 它不是 ChatLuna 风格的 room/history/prompt 中心系统
- 它不是普通“对话壳”
- 它的主系统不是对话层，而是生命运行时
- 对话只是生命行为的一种外显形式

### 2. 工程结构采用 monorepo，多包按能力域划分

已明确当前主包分层方向为：

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

这意味着项目不是把所有东西堆在一个插件里，而是按能力边界拆分为多个正式包。

### 3. 当前遵循“多包 + 多插件”路线

当前结论是：

- `core` 是纯契约 / 类型 / 接口库
- 其他能力包在长期上按**插件化入口**设计
- 不能把整个系统重新塌缩成“一个大插件”

### 4. `brain` 与 `model-gateway` 必须分离

已确认：

#### `brain`
负责：
- 统一认知请求抽象
- 统一认知响应抽象
- 向上层暴露统一模型能力接口

可以理解为：

> Brain 负责“我要问什么”。

#### `model-gateway`
负责：
- 管理模型配置
- 管理 provider / endpoint
- 决定请求走哪个渠道
- 真正发出模型请求
- 统一 provider 差异

可以理解为：

> Model Gateway 负责“这个请求到底怎么发给哪个模型”。

两者不能合并成一个“大模型请求包”。

### 5. `dialogue` 当前仍保留顶级主包地位

逻辑上说话属于行为的一种，但工程上目前仍允许：

- `dialogue` 保持为顶级主包
- 后续通过依赖关系和内部职责来维持语义一致性

### 6. `elysia-api` 不默认作为独立 channel

已确认：

- `model-gateway` 的 channels 中不默认放 `elysia-api`
- 如果最终请求打到 `elysia-api` 后端，本质上仍可能属于：
  - OpenAI
  - Gemini
  - Claude
  - OpenAI-compatible
- 除非未来 `elysia-api` 暴露真正独立的统一协议，否则不把它视为默认独立 provider type

### 7. `docs/` 是开发协作基础设施的一部分

已明确：

- `docs/` 不是用户帮助目录
- `docs/` 是项目架构记忆层
- 文档不是附属品，而是项目长期协作的一部分

---

## 二、当前已确定的技术栈

当前拍板的技术栈结论如下：

- **语言**：TypeScript
- **运行环境**：Node.js
- **宿主框架**：Koishi
- **包管理**：Yarn workspace
- **任务编排**：Turborepo
- **配置与校验**：YAML + Zod
- **主数据库**：MongoDB
- **缓存与调度辅助**：Redis
- **日志**：pino
- **测试**：Vitest

同时已明确：

- MongoDB 是长期主存储
- Redis 负责缓存、冷却、锁、信号等辅助能力
- 不是 Redis 做主存储、Mongo 兜底

---

## 三、已建立的工程与文档基础设施

### 1. 文档体系已建立

当前已建立并使用：

- `docs/elysia-ai-top-level-design.md`
- `docs/elysia-ai-core-contracts.md`
- `docs/elysia-ai-development-roadmap.md`

### 2. monorepo 根仓库骨架与第一轮工程配置已建立

`external/elysia-ai` 当前已经具备以下根目录工程文件或目录：

- `.eslintrc.cjs`
- `.prettierrc`
- `turbo.json`
- `tsconfig.base.json`
- `tsconfig.json`
- `package.json`
- `docs/`
- `scripts/`

其中已经开始落地的根级工程职责包括：

- workspace 根配置
- TypeScript 基础配置
- monorepo 根 references 配置
- 根级 build / dev / lint / test 脚本轮廓

### 3. 主包目录骨架已建立

`packages/` 下已建立主要能力包目录，并具备第一轮基础结构。

当前已存在的主包包括：

- `packages/core`
- `packages/runtime`
- `packages/body`
- `packages/perception`
- `packages/homeostasis`
- `packages/cognition`
- `packages/persona`
- `packages/behavior`
- `packages/dialogue`
- `packages/brain`
- `packages/model-gateway`
- `packages/observatory`
- `packages/shared`

---

## 四、当前代码实现进度

这一节记录的是**已经进入代码层面**的进展，而不是纯结构讨论。

---

### 4.1 `packages/core` 当前进度

`core` 是当前最先开始正式落地的主包。

#### 已完成的类型定义

当前已经开始落地或已定义的核心对象包括：

- `LifeInstance`
- `Habitat`
- `Bond`
- `Thread`
- `Stimulus`

其中，项目已经明确：

- 不再使用 room 作为核心抽象
- 不以聊天历史数组作为主要状态容器
- 以虚拟生命视角重新组织基础对象

#### 已完成的 schema 落地

当前已经开始落地或已补齐对应 Zod schema 的对象包括：

- `LifeInstance`
- `Habitat`
- `Bond`
- `Thread`
- `Stimulus`

这意味着 `core` 已经不再停留于“概念命名”阶段，而是开始形成可校验契约。

#### 已完成的基础接口抽象

当前已经开始落地的基础接口包括：

- Event Bus 接口
- Event Map 接口
- Life Repository 接口
- State Repository 接口
- Trace Repository 接口
- Brain 抽象接口
- Model Gateway 抽象接口
- 基础错误类型导出
- `core` 统一导出入口

#### 已完成的默认实现

当前已经在 `core` 内开始出现默认实现：

- `MemoryEventBus`

这意味着 `core` 已经不再只是“只有契约，没有实现”，而是开始提供：

> “接口 + 最小默认实现”

#### 当前结论

`core` 当前已经进入：

> “第一批核心契约已完成落地，并出现了第一批默认实现，但整体仍处于早期核心层建设阶段”

---

### 4.2 `packages/runtime` 当前进度

`runtime` 已经从最小接口级实现推进到了最小默认实现阶段。

当前已开始落地的内容包括：

- `RuntimeContext`
- `LifeRegistry`
- `HabitatRegistry`
- `Scheduler` 最小接口方向
- `Runtime` 主运行时对象轮廓
- `Lifecycle` 最小接口方向
- `Manifest` 最小接口方向
- `runtime` 顶层导出与插件入口轮廓

#### 已完成的默认实现

当前已经完成或已落地的最小默认实现包括：

- `MemoryLifeRegistry`
- `MemoryHabitatRegistry`
- `DefaultRuntime`

其中 `DefaultRuntime` 已经具备最小行为能力：

- 持有 `context`
- 持有 `lifeRegistry`
- 持有 `habitatRegistry`
- 能接收 `Stimulus`
- 能在收到刺激后发出 `stimulus.received` 事件

#### 当前结论

`runtime` 当前状态是：

- 生命周期对象轮廓已开始定义
- 注册中心轮廓已开始定义
- 第一版默认内存实现已经出现
- 但还没有真正接上 `body`
- 也还没有形成完整的运行闭环

---

### 4.3 `packages/body` 当前进度

`body` 当前已经从空目录推进到最小输入输出桥接雏形阶段。

当前已开始落地的内容包括：

- `body` 顶层入口轮廓
- 平台消息类型定义方向
- `sessionToStimulus` 标准化函数
- 输出 sender 抽象方向

这意味着 `body` 已经开始承担：

- 外部平台事件 → 内部刺激对象
- 内部行为结果 → 外部平台输出

这一层的桥接职责。

#### 已完成的最小接线

当前 `body` 已额外完成：

- `packages/body/package.json`
- `packages/body/tsconfig.json`
- `handlePlatformMessage(runtime, message)`

其中 `handlePlatformMessage()` 已经能够：

- 接收 `PlatformMessage`
- 调用 `sessionToStimulus()` 生成 `Stimulus`
- 调用 `runtime.receiveStimulus(stimulus)`

#### 当前结论

`body` 目前属于：

> “最小输入标准化与 body → runtime 注入入口已经形成，但 Koishi 适配和发送链路仍未真正打通”

---

### 4.4 `packages/model-gateway` 当前进度

`model-gateway` 已经从纯目录骨架进入第一轮结构定义阶段。

当前已开始落地的内容包括：

- 顶层入口
- config 目录方向
- registry 目录方向
- routing 目录方向
- 最小 router 结果对象与接口轮廓

#### 当前结论

`model-gateway` 当前已经具备：

- 包级入口
- 最小配置 / 注册 / 路由结构轮廓

但尚未具备：

- provider 配置模型
- 请求下发实现
- provider normalize
- 真正 channel 适配实现

---

### 4.5 `packages/brain` 当前进度

`brain` 当前仍处于最小入口与接口配套阶段。

已明确：

- 它不是 provider 管理器
- 它不是底层渠道请求发送器
- 它必须依赖 `model-gateway` 完成真正模型调用

当前更偏向：

> “认知请求抽象层已经明确，包级落地仍处于早期阶段”

---

### 4.6 `packages/behavior` 当前进度

`behavior` 当前更多停留在包级入口轮廓和职责确认阶段。

已确认：

- 它不能被忽略
- 它不是“以后再说”的附属包
- 在多包多插件路线下，它最终也需要插件化入口和明确职责边界

当前尚未开始真正实现：

- candidate 生成
- selection
- action 执行编排
- proactive 行为

---

### 4.7 其他能力层当前状态

以下包目前仍主要处于骨架 / 预留阶段：

- `perception`
- `homeostasis`
- `cognition`
- `persona`
- `dialogue`
- `observatory`
- `shared`

当前这些包的主要意义仍然是：

- 锁定长期分层结构
- 预留后续正式实现边界
- 避免未来再回头拆大包

---

## 五、当前阶段性判断

基于当前实际代码状态，可以将项目进展划分为如下判断：

### 已经完成的事情

- 顶层设计定型
- 架构边界拍板
- 技术栈拍板
- monorepo 根仓库升级
- 多主包结构建立
- `core` 第一批核心契约完成第一轮落地
- `core` 已出现 `MemoryEventBus`
- `runtime` 已出现 `MemoryLifeRegistry`
- `runtime` 已出现 `MemoryHabitatRegistry`
- `runtime` 已出现 `DefaultRuntime`
- `core/runtime` 的一轮工程配置已开始成型
- `runtime` 的第一轮工程级 bug 已被定位并完成主要修复
- `body -> runtime` 的最小真实接线已经完成
- `createDefaultRuntime()` 默认装配入口已经完成

### 尚未完成的事情

- 还没有完整的多 Bot 事件接入
- 还没有 life instance 声明加载
- 还没有 runtime lifecycle 主流程
- 还没有最小可运行生命闭环
- 还没有真实 Koishi 输入输出链路
- 还没有最小 `behavior`
- 还没有 mock `brain`
- 还没有 mock `model-gateway`
- 还没有 sender 输出链
- 还没有正式数据库实现
- 还没有 Redis 辅助能力落地
- 还没有 observability / trace 的实际写入实现

### 当前最重要的现实结论

当前项目最需要的已经不是继续补空目录，而是：

> **在已经形成的契约层和默认实现层之上，开始打通第一条真实主干链路。**

---

## 六、当前尚未完成的主要事项

---

### 6.1 根仓库层面

当前已经开始完成：

- 根 `package.json` 已经从单插件模板调整为 workspace 根配置
- 根 `tsconfig.json` 已经从单包模板调整为 monorepo references 配置
- 根 `tsconfig.base.json` 已经开始承担共享 TS 配置职责

但仍需继续确认和完善：

- workspace 是否重新扩展回完整 `packages/*`
- `turbo.json` 中任务管线是否完整
- 各包 `package.json` / `tsconfig.json` / build 脚本是否统一
- lint / test / build 基线是否一致
- 其他包的 package / tsconfig 是否都已补齐

---

### 6.2 `packages/core`

虽然 `core` 已经开始实现，但仍未完成：

- 部分核心对象仍未完全定型
- `Projection`、`BehaviorCandidate` 等仍未正式形成稳定代码契约
- Event Bus 已有默认实现，但 Repository 仍只有抽象，没有内存版或数据库版实现
- Brain / Model Gateway 的核心契约仍只是最小轮廓
- 核心导出是否完整仍需持续检查
- 编译产物输出策略仍需整理，避免产物落到源码目录附近

---

### 6.3 `packages/runtime`

当前已经完成：

- 默认 `Runtime` 实现
- 默认 `LifeRegistry` 实现
- 默认 `HabitatRegistry` 实现
- `createDefaultRuntime()` 默认装配入口
- 最小 typed event bus 默认装配方案

仍未完成：

- lifecycle 真正开始 / 停止流程
- scheduler 真正调度逻辑
- manifest / life instance 声明装载逻辑
- 插件入口 `apply()` 的真实挂载逻辑
- 多 Bot 事件接入后的实际实例分发

---

### 6.4 `packages/body`

当前已经完成：

- `PlatformMessage`
- `sessionToStimulus()`
- `handlePlatformMessage(runtime, message)` 最小接线函数
- body 包的基础 package / tsconfig 工程配置

仍未完成：

- Koishi session 到 `PlatformMessage` 的正式适配
- `sessionToStimulus` 的完整字段映射策略
- sender 的 Koishi 输出适配
- body 插件入口里的真实接线
- 多 Bot 输入事件的正式接入

---

### 6.5 `packages/behavior`

仍未完成：

- `BehaviorCandidate` 正式定义
- selection 策略
- 是否回应判断
- 最小行为执行流程
- 主动行为策略

---

### 6.6 `packages/brain`

仍未完成：

- 正式请求结构
- 正式响应结构
- capability 抽象
- 与 behavior / dialogue 的清晰调用关系
- 与 `model-gateway` 的实际连接

---

### 6.7 `packages/model-gateway`

仍未完成：

- provider config model
- provider registry 完整定义
- routing 规则
- request / response normalization
- channel 实际实现
- openai / gemini / claude / openai-compatible 具体适配

---

### 6.8 其他能力层

仍未开始或尚未开始正式实现：

- `perception` 的最小刺激解析
- `homeostasis` 的最小状态机
- `cognition` 的最小推理组织层
- `persona` 的最小人格状态对象
- `dialogue` 的最小输出渲染
- `observatory` 的 trace / inspect / debug 实现

---

### 6.9 数据与基础设施

仍未完成：

- MongoDB 正式 repository 实现
- Redis cooldown / lock / signal 等辅助能力
- 日志体系接线
- 测试基线建立
- 最小 e2e 测试闭环

---

## 七、建议采用的阶段划分

为了避免文档继续停留在“阶段 0 已完成”这种一次性记录方式，后续统一按下面的阶段来维护。

---

### 阶段 A：架构定型与工程骨架建立
**状态：已基本完成**

已完成内容：

- 项目定位明确
- 主包分层明确
- 技术栈明确
- 文档体系建立
- monorepo 根仓库建立
- 包骨架建立

阶段结论：

> 这一阶段已经完成，不应再作为主工作重心。

---

### 阶段 B：核心契约落地
**状态：进行中**

目标：

- 让 `packages/core` 成为稳定的契约层
- 把概念真正写成类型、schema、接口、导出

当前已完成：

- 第一批核心类型开始落地
- 第一批 schema 开始落地
- repository / bus / brain / gateway 接口开始落地

仍需完成：

- 补全剩余核心契约
- 清理命名和导出
- 形成更稳定的一版 core API

阶段结论：

> 当前项目正处于这个阶段的后半段。

---

### 阶段 C：主干运行时最小实现
**状态：进行中，当前主战场**

目标：

- 给 `runtime`、`body`、`behavior`、`brain`、`model-gateway` 补上最小默认实现
- 建立最小可运行主干链路

当前已完成：

- `MemoryEventBus`
- `MemoryLifeRegistry`
- `MemoryHabitatRegistry`
- `DefaultRuntime`
- `core/runtime` 第一轮工程链修复

建议要实现的最小闭环：

1. 外部消息进入 `body`
2. `body` 生成 `Stimulus`
3. `runtime` 接收并分发刺激
4. `behavior` 决定是否产生响应
5. `brain` 组织模型请求
6. `model-gateway` 返回模型结果
7. `body` sender 发送结果

阶段结论：

> 这一阶段已经开始，不再只是“下一步该做”，而是“正在做但尚未打通闭环”。

---

### 阶段 D：状态、人格、感知与对话能力补全
**状态：未开始**

目标：

- 开始补 perception / homeostasis / persona / dialogue
- 让生命行为不只是“收到一句话就回复一句话”

---

### 阶段 E：持久化、观测与生产级能力
**状态：未开始**

目标：

- MongoDB / Redis 正式接入
- observatory 能力落地
- logger / test / trace / debug 基线建立

---

## 八、接下来建议的优先级顺序

### 第一优先级：把 `runtime` 从“最小实现”推进到“可被接线使用”

建议优先补：

- `createDefaultRuntime()` 或等价默认工厂
- runtime 插件入口中的最小挂载逻辑
- runtime 默认装配方式说明

### 第二优先级：打通 `body -> runtime`

这是当前最值得优先推进的真实链路，包括：

- `sessionToStimulus`
- stimulus 注入 `DefaultRuntime.receiveStimulus()`
- body 与 runtime 的最小对接

### 第三优先级：补一个极简 `behavior`

建议最小策略是：

- 监听 `stimulus.received`
- 对 `utterance` 产生最简单的回应决策

### 第四优先级：补 mock `brain` 与 mock `model-gateway`

至少做到：

- `brain` 能生成最小请求对象
- `model-gateway` 能返回 mock 文本结果

### 第五优先级：补最小 sender，形成第一条闭环

至少做到：

- 有一条 Koishi 输入
- 能转成 `Stimulus`
- 能流经 runtime
- 能触发最小行为
- 能得到 mock 回复
- 能输出到外部平台

### 第六优先级：再开始扩展高级能力层

在主干闭环没打通前，不建议过早深挖：

- persona
- memory
- proactive
- observatory
- 持久化细节

---

## 九、后续协作窗口接手说明

如果新的协作窗口需要快速接手当前工作，请优先阅读：

1. `docs/elysia-ai-top-level-design.md`
2. `docs/elysia-ai-development-roadmap.md`
3. `docs/elysia-ai-core-contracts.md`

接手时必须先明确当前真实状态：

> **架构已经拍板，骨架已经建立，`core` 等主干包已经进入第一轮代码落地，但系统还没有最小可运行闭环。**

这意味着后续最重要的工作不是：

- 再次重谈项目定位
- 再次调整大层级目录
- 再次把包塌缩回一个大插件

而是：

- 继续把契约写完整
- 给主干包补最小实现
- 打通第一条真实运行链路

---

## 十、最近一轮已完成事项补充

最近一轮开发中，已额外完成以下内容：

### 1. `core` 新增默认事件总线实现
已完成：

- `MemoryEventBus`

### 2. `runtime` 新增默认内存实现与默认装配入口
已完成：

- `MemoryLifeRegistry`
- `MemoryHabitatRegistry`
- `DefaultRuntime`
- `createDefaultRuntime()`

### 3. `body` 新增最小输入接线
已完成：

- `packages/body/package.json`
- `packages/body/tsconfig.json`
- `handlePlatformMessage(runtime, message)`

### 4. `runtime` 第一轮工程级 bug 排查与修复
已完成：

- 将 `external/elysia-ai/package.json` 从单插件模板调整为 workspace 根配置
- 将 `external/elysia-ai/tsconfig.json` 调整为 monorepo 根 references 配置
- 补齐 `packages/core/tsconfig.json`
- 调整 `packages/runtime/tsconfig.json`
- 调整 `packages/body/tsconfig.json`
- 放宽 `EventBus` / `MemoryEventBus` 的泛型约束
- 处理空 `package.json` 导致的 workspace / npm / tsc 扫描阻塞问题

### 5. 本轮新增内容补充

本轮开发中，在上次记录的基础上，额外完成了以下内容：

#### runtime 生命周期主流程
已完成：
- 扩展 `Lifecycle` 接口（新增 `getState / start / stop / isRunning`）
- 实现 `MinimalLifecycle` 类（含完整状态机：idle → starting → running → stopping → stopped）
- 集成到 `DefaultRuntime`（现在具备真实 start/stop 能力）
- 更新 `CoreEventMap`（新增 `runtime.starting / runtime.started / runtime.stopping / runtime.stopped`）

#### 多 Bot 事件正式接入
已完成：
- 建立 `packages/body/src/adapters/koishi/` 目录
- 实现 `sessionToPlatformMessage()`（Koishi session → PlatformMessage）
- 实现 `KoishiBodyAdapter` 类（监听 Koishi message 事件，转为 Stimulus 注入 runtime）
- 实现 `body/src/index.ts` 的 `apply()` 函数（获取 runtime 实例、创建适配器、注册监听）
- 实现 `runtime/src/index.ts` 的 `apply()` 函数（创建 DefaultRuntime，挂到 ctx，启动 runtime）

#### 扩展协议与开发生态设计
已完成：
- 新建插件开发规范文档 `docs/elysia-ai-plugin-development-spec.md`
- 顶层设计文档新增第 24 节（扩展协议与开发生态）
- 设计了命名空间配置 + 流水线注入点的组合扩展机制
- 设计了 PipelineContext 统一容器思路

---

### 6. 基于顶层设计文档的 Phase 1 完成度判断

按照 `docs/elysia-ai-top-level-design.md` 第 19 节 Phase 1 的正式定义，第一阶段目标是完成：

- `elysia-ai-core`
- `elysia-ai-runtime`
- `elysia-ai-body`
- 核心类型定义
- runtime 生命周期
- 多 Bot 事件接入
- 生命体实例声明加载
- stimulus 分发总线
- typed event bus 抽象

当前对照结果如下：

#### 已完成
- 核心类型定义（第一轮）
- typed event bus 抽象
- stimulus 分发总线的最小基础
- `core` / `runtime` / `body` 的第一轮最小骨架
- `body -> runtime` 的最小输入接线

#### 尚未完成
- runtime 生命周期主流程
- 多 Bot 事件正式接入
- 生命体实例声明加载
- runtime 插件入口的真实挂载
- 以 Phase 1 为验收标准的完整基础运行闭环

#### 正式判断
> **Phase 1 尚未完成，但已经进入后半段。**

### 6. 当前阶段结论更新

截至当前，Elysia A.I. 已经完成了：

- 顶层设计定型
- 核心职责边界拍板
- 技术栈拍板
- monorepo 根仓库升级
- 主包骨架建立
- 文档体系建立
- `core` 第一批核心对象 / schema / 接口落地
- `core` 第一批默认实现出现
- `runtime` 第一批默认内存实现出现
- `runtime` 默认装配入口出现
- `body -> runtime` 最小接线出现
- `runtime/body` 第一轮工程链路修复基本完成

这意味着项目已经从：

> “讨论结构”

正式进入：

> “主干骨架实现已经开始，并已完成输入进入运行时的第一段链路”

但在将 `runtime/body` 真正接入 Koishi 宿主时，新增暴露出一个重要现实：

> **“源码层可编译” 与 “Koishi 宿主可加载” 是两个不同层级的验收标准。**

也就是说，项目当前不能只以：

- TypeScript 编译通过
- monorepo build 成功
- 单一 `lib/index.js` 产物存在

作为 runtime/body 的完成判断。

对 Koishi 宿主入口包而言，新的最低验收标准必须包含：

1. 包名与插件元信息符合 Koishi 插件生态约定
2. 源码层满足 NodeNext / Node ESM 相对导入规则
3. 发布层满足 **Koishi 标准双产物插件形态**：
   - `lib/index.cjs`
   - `lib/index.mjs`
   - `lib/index.d.ts`
   - `exports.require/import/types`
4. `koishi start` 时实际被 Loader 成功加载

因此，从本轮开始，roadmap 对 `runtime/body` 的判断需要更新为：

> **当前已经完成“源码层和 monorepo 层”的主要修复，但尚未完成“Koishi 宿主交付层”的最终收口。**

后续这份文档应持续更新，不再只记录“某一个阶段的总结”，而是作为整个项目的**长期开发进度总表**来维护。

---

## 十一、Koishi 宿主接入修正结论（新增）

### 11.1 新增结论：runtime/body 是“宿主入口包”，不是普通内部包

这一结论已经通过真实接入故障验证成立。

虽然 `core` / `runtime` / `body` 都在 monorepo 中，但它们的性质不同：

- `core`：更接近纯内部契约库
- `runtime` / `body`：是会被 Koishi Loader 直接加载的宿主入口包

所以，`runtime/body` 不能只按普通 workspace 包处理，必须按 **Koishi 插件包**处理。

---

### 11.2 已暴露的真实问题类型

在实际接入 Koishi 后，已经出现过以下类型的错误：

#### A. Node ESM 相对导入问题
- `ERR_UNSUPPORTED_DIR_IMPORT`
- `ERR_MODULE_NOT_FOUND`

这说明源码中的：
- 目录导入
- 无扩展名相对导入

在 Node ESM 运行时不可接受。

#### B. Koishi Loader 宿主兼容问题
- `TypeError: Class extends value #<Object> is not a constructor or null`

这说明即使源码层修复到 NodeNext，也仍然存在：

> 插件包整体交付形态与 Koishi Loader 的实际加载路径不完全兼容

也就是：

- 单一 ESM 产物并不稳妥
- 仍需转向标准 Koishi 双产物插件包形态

---

### 11.3 对 runtime/body 的完成标准修正

从现在开始，`runtime` 与 `body` 的“阶段完成”标准更新如下：

#### 旧标准（已废弃）
- 代码 build 成功
- 包能 resolve
- 能在 workspace 中被引用

#### 新标准（正式生效）
- package 名称符合 Koishi 插件生态习惯
- package.json 含标准字段：
  - `main`
  - `module`
  - `typings`
  - `exports`
  - `koishi`
- 源码层 NodeNext 兼容
- 产物层输出双格式：
  - `index.cjs`
  - `index.mjs`
  - `index.d.ts`
- `koishi start` 时可以被 Koishi Loader 实际加载成功

---

### 11.4 当前状态重新评估

#### 已完成
- 包名已开始向 Koishi 标准插件命名迁移
- package 元信息已开始补齐
- NodeNext 源码层修复已经启动
- runtime/body/core 的若干关键相对导入已修正
- 测试文件已从正式包构建中排除

#### 尚未完成
- runtime/body 的双产物（cjs + mjs）输出
- package.json 的最终标准 exports 收口
- Koishi Loader 下的最终成功加载验证

#### 正式判断
> **runtime/body 当前处于“Koishi 宿主交付适配阶段”，尚未完成最终宿主验收。**

---

### 11.5 后续工作包修正

针对 `runtime/body`，必须新增一个单独的工作包：

#### 工作包：Koishi Packaging Contract 收口

目标：
- 让 `runtime/body` 成为真正可被 Koishi 发布、识别、加载的标准插件包

需要完成：
1. package.json 标准化
2. dual output（cjs + mjs）
3. exports 标准化
4. NodeNext 源码规则修复收尾
5. `koishi start` 实机加载验证

#### 验收标准
- `require.resolve('<plugin>/package.json')` 成功
- `koishi start` 成功加载
- 不再出现：
  - `ERR_UNSUPPORTED_DIR_IMPORT`
  - `ERR_MODULE_NOT_FOUND`
  - `Class extends value #<Object> is not a constructor`

---

### 11.6 对 Phase 1 的判断修正

原本 Phase 1 的判断偏向：

- core/runtime/body 的最小闭环

现在必须补充一条：

> **如果 runtime/body 还不能以标准 Koishi 插件形态被宿主稳定加载，则 Phase 1 不能算真正完成。**

因此当前更准确的判断是：

- Phase 1 的“内部工程链”已接近完成
- 但 Phase 1 的“宿主接入链”仍未完成
- 所以 Phase 1 **仍然未正式完结**

---

## 十二、对齐标准 Koishi monorepo 的整改工作包（新增）

这一节用于把当前项目从“自定义 monorepo 工程”继续推进到“更标准、更接近 Koishi 官方实践的 monorepo 项目”。

这里不讨论顶层理念，而只讨论：

- 当前还差什么
- 为什么差
- 应该按什么顺序整改

---

### 12.1 当前总体判断

当前 `elysia-ai` 已经具备：

- 根 workspace
- packages 分层
- turbo 编排
- TypeScript + Vitest + docs 体系
- runtime/body/core 的第一轮实现

所以它已经不是“杂乱项目”，而是：

> **一个有明确架构方向、但工程规范尚未完全收口的 Koishi 宿主型 monorepo。**

与标准 Koishi monorepo 的差距，不在于“有没有 packages 目录”，而在于：

1. 根 workspace 范围还不够标准化
2. 宿主入口包与内部库包还没有完全分层治理
3. 宿主入口包交付形态还未完全收口
4. 测试还没有充分覆盖宿主接入层
5. 根仓库和各包的元信息还不够完整

---

### 12.2 P0：宿主入口包标准化收口

#### 目标
让 `runtime` / `body` 真正成为：

> **标准 Koishi 插件包，而不是只是在 workspace 内部可编译的包。**

#### 必须完成
- 标准插件命名
- `main/module/typings`
- `exports.require/import/types`
- `koishi` 元信息
- `peerDependencies.koishi`
- 双产物：
  - `lib/index.cjs`
  - `lib/index.mjs`
  - `lib/index.d.ts`

#### 当前状态
- 已识别问题
- 已开始从单 ESM 产物向双产物迁移
- 但仍需继续以“宿主实际加载成功”为最终验收

#### 验收标准
- `require.resolve('<plugin>/package.json')` 成功
- `koishi start` 成功加载
- 无以下报错：
  - `ERR_UNSUPPORTED_DIR_IMPORT`
  - `ERR_MODULE_NOT_FOUND`
  - `Class extends value #<Object> is not a constructor`

---

### 12.3 P1：根 workspace 范围标准化

#### 当前问题
根 `workspaces` 如果只列出少数包，例如只包含：

- `core`
- `runtime`
- `body`

那么会带来：

- build graph 不完整
- 新包接入要频繁修改根配置
- monorepo 与工具链对“全仓有哪些包”感知不一致

#### 整改方向
统一改为：

```json
"workspaces": [
  "packages/*"
]
```

#### 目标
- 所有能力包自动进入工程图谱
- perception / cognition / persona / observatory 等不再是“名义存在、工程未接入”
- 更符合标准 workspace 设计习惯

#### 验收标准
- 根 build graph 能识别所有 `packages/*`
- 新增能力包不需要再改根 workspace 声明

---

### 12.4 P1：定义“宿主入口包 / 内部库包”双模板

#### 当前问题
现在包虽然都在 `packages/` 里，但角色还没完全工程化区分：

- 哪些是宿主入口插件
- 哪些是内部契约库
- 哪些是未来可能独立发布的能力包

#### 整改方向
建立两套正式模板：

##### A. 宿主入口包模板
适用于：
- `runtime`
- `body`

要求：
- `koishi-plugin-*`
- 双产物
- `exports`
- `peerDependencies.koishi`
- `koishi` 元信息

##### B. 内部库包模板
适用于：
- `core`
- `shared`
- 暂时不直接写入 `koishi.yml` 的能力包

要求：
- 清晰 `types`
- 稳定 `exports`
- 明确是否允许外部消费

#### 验收标准
- 所有包都能被归类到明确模板
- package.json 结构不再混杂和随意演化

---

### 12.5 P1：统一 build 策略

#### 当前问题
现在项目中已经同时存在：
- `tsc`
- `NodeNext`
- `turbo`
- 宿主入口双产物需求

如果不尽快统一，会导致：
- 有些包只适合内部构建
- 有些包适合宿主加载
- 但工程规则没有明确分层

#### 整改方向
正式固定为：

##### 内部库包
- `tsc`

##### 宿主入口包
- `tsc --emitDeclarationOnly`
- `esbuild` 输出 `cjs + mjs`

##### 根层
- `turbo` 只负责任务编排

#### 验收标准
- build 规则可被文档化
- 所有开发窗口都按同一套路新增/修改包
- 不再出现“某包为什么只出 index.js、某包为什么要双产物”的混乱

---

### 12.6 P2：补宿主集成测试

#### 当前问题
当前测试主要偏向：
- unit test
- 局部逻辑 test
- runtime/body 的最小行为测试

但对标准 Koishi monorepo 来说还不够。  
缺的是：

- 插件入口测试
- 宿主集成测试
- Loader 层验证

#### 整改方向
至少增加三类验证：

1. **单元测试**
   - 保持现有做法

2. **插件入口测试**
   - `apply(ctx)` 是否正常挂载
   - ctx 扩展是否正确

3. **宿主加载验证**
   - `koishi start`
   - loader 实际可加载

#### 验收标准
- 不是只知道“函数没错”
- 而是知道“宿主层真的能跑”

---

### 12.7 P2：补齐根仓库与包元信息

#### 当前问题
部分自动化行为（如 clone、识别、发布、消费）会受这些字段影响：

- `repository`
- `homepage`
- `bugs`
- `author`
- `files`
- `exports`

如果缺失，会导致：
- 工具推断不稳定
- clone/scaffold 行为不一致
- monorepo 根身份不够清晰

#### 整改方向
根仓库和关键包都补齐元信息，至少对：

- 根仓库
- `runtime`
- `body`
- `core`

先补齐。

#### 验收标准
- 根仓库 identity 清晰
- 工具链对项目的识别更稳定
- package metadata 更接近标准 Koishi 工程

---

### 12.8 P3：后续工具链风格进一步收口

#### 说明
这不是当前阻塞项，但值得保留为中后期工程治理目标。

可选方向包括：
- 进一步吸收 Koishi 生态里更统一的脚本命名风格
- 视需要引入更标准的 build helpers
- 统一 publish / release / changelog 策略

这一层应建立在前面 P0/P1/P2 已经完成之后，而不是提前处理。

---

### 12.9 建议执行顺序（正式版）

按优先级，推荐固定执行顺序如下：

1. **P0：runtime/body 宿主收口**
2. **P1：workspace 全量化**
3. **P1：双模板包规范**
4. **P1：统一 build 策略**
5. **P2：宿主集成测试**
6. **P2：根仓库与包元信息补齐**
7. **P3：工具链进一步标准化**

---

### 12.10 结论

对齐标准 Koishi monorepo 的关键，不是“目录看起来像不像”，而是：

> **宿主入口包、内部库包、workspace 根、build 策略、测试策略是否真正形成一套稳定且一致的工程规范。**

当前 `elysia-ai` 已经具备正确方向，但还没有完全收口。  
因此，从 roadmap 的角度，下一阶段最重要的任务不是再扩展新能力，而是：

> **先完成标准化整改，让现有架构成为真正稳定可持续演进的 Koishi monorepo。**
