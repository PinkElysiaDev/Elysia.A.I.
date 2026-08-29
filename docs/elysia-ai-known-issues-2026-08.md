# Elysia A.I. 已知问题清单（2026-08 审查）

本清单来自 2026-08-19 的全项目代码审查（主链路 / 运行时持久化 / 模型网关协议三层）。
**P0（5 项）与 P1（10 项）已在本轮修复并附带回归测试**；以下为**暂不修复的低危项（P2）**，
按模块归类，供后续迭代认领。位置均相对 `packages/`。

## 已修复（概要）

| 级别 | 问题 | 修复点 |
| --- | --- | --- |
| P0 | body 不过滤 bot 自身消息 → 自言自语死循环 | `elysia-ai-body/src/adapters/koishi/koishi-body-adapter.ts` |
| P0 | cognition/dialogue 会话 scopeKey 格式不一致 → 连续性信号恒 0 | `@elysia-ai/shared/src/conversation-scope.ts`（新增唯一实现） |
| P0 | Mongo 调度任务/投影规则仓储未接线；loadFromRepository 无调用方 | `elysia-ai-runtime/src/index.ts`、`store/mongo-runtime-repositories.ts` |
| P0 | enforceMaxEntries 把 archived 计入上限 → 活跃记忆被逐步清空 | `@elysia-ai/memory/src/index.ts` |
| P0 | anthropic encode 不合并连续同角色/透传非法字段/tool_use.id 无兜底 | `@elysia-ai/protocol-anthropic/src/encode.ts` |
| P1 | DialogueTask 丢 actorId/habitatId/threadId | `@elysia-ai/behavior/src/action-builder.ts`、`execution-plan.ts` |
| P1 | buffer/followup 三重断裂（桶计数恒 1 / 到期不走路由 / 发送路由缺失） | `bucket.ts`（新）、`runtime.ts`、`sender/index.ts`、`execution-plan.ts` |
| P1 | 崩溃后 running 任务永久丢失 | `scheduler/index.ts recoverInterruptedTasks` |
| P1 | 并发读-改-写丢更新 | `runtime.ts` receiveStimulus 按 habitat 串行化 |
| P1 | cognition 门控依赖插件加载顺序 | behavior 保守跳过 + wrapper 探测 cognition 服务 |
| P1 | responses finishReason 返回生命周期状态 | `providers/utils.ts normalizeResponsesFinishReason` |
| P1 | 音频部件键名/格式错误（audio→input_audio、URL 当 base64、MIME 当 format） | protocol-openai / protocol-responses encode |
| P1 | enableReply 配置无消费逻辑 | `@elysia-ai/behavior/src/index.ts` |
| P1 | Koishi 元素标记未剥离即进感知/LLM | `session-to-platform-message.ts` |
| P1 | memory/bond 本地 Map 无界增长 + 陈旧合并覆盖远端 | Mongo 仓储写后逐出 + 更新前刷新 |
| 附带 | DefaultBrainService 丢失自定义 ContextBudgetPlanner 注入（扁平化重构回归） | `@elysia-ai/brain/src/index.ts` |
| 附带 | 测试基线大面积红：koishi mock 缺 cordis set/get/reflect.alias；测试用旧 provider 类型名/旧配置形状 | `__mocks__/koishi.ts`、30+ 测试文件 |

## P2 待办清单

### body / 主链

1. **stimulus.id 无平台命名空间**（`elysia-ai-body/src/adapters/koishi/session-to-platform-message.ts`）：
   同一 runtime 挂多 bot/多平台时 messageId 撞车 → OutboundRouteRegistry 相互覆盖、缓存踩踏、重复回复。
   建议 id 规范化为 `${platform}:${channelId}:${messageId}` 或 `${platform}:${messageId}`。
2. **OutboundRouteRegistry 是 FIFO 而非 LRU**（`elysia-ai-body/src/sender/index.ts`）：容量 500，高流量群 +
   慢 LLM（timeoutMs 可到 6 分钟）下早期 route 被逐出 → 回复静默丢失；重复 set 不刷新位置。
3. **threadId = replyToMessageId 语义滥用**（`normalize/session-to-stimulus.ts`）：引用任何人的消息都被当作
   "回复 bot"获得 salience 加成，且对话历史被按"被引用消息 id"切割。建议 isReply 仅在引用目标是本 bot
   消息时为 true；threadId 改用平台的真实话题 id。
4. **AI 感知串行阻塞整条链、无并发背压**（`@elysia-ai/perception/src/index.ts`）：开启 aiEnhanced 后一条
   消息的感知 LLM 调用最坏挂 6 分钟，期间整链停摆；多消息并发无队列/限流。
5. **perception mention 实体正则 `@(\S+)` 永不命中**（`@elysia-ai/perception/src/rules.ts`）：Koishi 已把 @
   转成元素；P1-14 剥离后 content 中会再现 `@name` 文本，此正则可能开始命中，但其捕获的是剥离后的展示名
   而非用户 id，语义需要重新设计（可消费 `payload.mentionedUserIds`）。
6. **perception maxInputTokens 声明未实现**（`@elysia-ai/perception/src/ai-enhanced.ts`）：超长消息原样进 LLM。
7. **outputId 多 life 冲突**（`@elysia-ai/dialogue/src/index.ts`）：同一 stimulus 路由到多个 life 时
   `dialogue.output.created` 的 outputId 相同，observatory 追踪会混流。建议拼入 lifeId。

### model-gateway / protocol

8. **fetchWithTimeout 只保护到响应头**（`providers/utils.ts`）：`res.json()` 慢速/挂死无限期等待，
   timeoutMs 形同虚设。建议把 body 读取纳入 AbortController 保护。
9. **每次重试 attempt 都计入熔断**（`model-gateway/src/index.ts`）：`maxRetries=3` + `failureThreshold=3`
   时单次请求即可 circuit-open 30 秒，"连续失败"语义被放大。建议按"请求级"而非"attempt 级"计数。
10. **非 ProviderError 一律视为可重试**（`isRetryableError`）：`res.json()` 的 SyntaxError（如 200 返回
    HTML）会重试 3 次并计入熔断。
11. **gemini API key 走 URL query 且未编码**（`providers/gemini.ts`）：密钥进入错误消息/代理日志；`model`
    也未 encodeURIComponent。建议改用 `x-goog-api-key` 头。
12. **anthropic 流式 usage 需消费端合并**（`protocol-anthropic/src/stream.ts`）：message_start 带
    input_tokens、message_delta 只带 output_tokens，以"最后一个 usage 事件"为准会把输入统计为 0。
13. **流式 cached_tokens 不解析**（`canonical/src/parts.ts usageFromRawMap`）：不读
    `prompt_tokens_details.cached_tokens`（非流式路径已处理）。
14. **ChatCompletionsStreamDecoder 工具状态跨 choice 共享**（`protocol-openai/src/stream.ts`）：`n>1` 时
    两个 choice 的同名 index 工具参数互相拼接。
15. **Gemini 流式 content_index 跨 chunk 重置**（`protocol-gemini/src/stream.ts`）：按 chunk 内 partIndex
    编号，消费方按 content_index 聚合会错乱。
16. **responses encode 静默丢弃无 id/name 的 tool call**（`protocol-responses/src/encode.ts`）：丢弃后对应
    function_call_output 失配 → 上游 400。可参照 openai 侧合成 id。
17. **协议间工具 arguments 类型不一致**：anthropic decode 产出对象、openai/gemini 产出 JSON 字符串；
    encode 侧只认字符串，对象参数静默变成 `'{}'`。建议 canonical 层统一为字符串并在 anthropic decode 处
    JSON.stringify。

### runtime / 状态层

18. **observatory 脱敏把 DAG 共享引用误判为循环**（`@elysia-ai/observatory/src/service.ts` sanitizeValue）：
    `seen` WeakSet 递归返回后不清除；同一对象被 payload 两处引用时第二处变 `'[Circular]'`，trace 缺字段。
19. **homeostasis 衰减按事件次数而非时间**：群聊高频时能量秒级衰减到底、完全静默时永不衰减；behavior 层
    可能把 mood 推到负值而 plugin 层 clamp 到 [0,1]，两套值域写者不一致。
20. **调度 tickOnce 用批首陈旧 now 判过期**（`scheduler/index.ts`）：批量执行耗时长时排在后面的任务用旧
    时间戳判断 expiresAt，刚过期几秒的任务仍会执行。影响极小（1s 粒度）。
21. **lazyMongoCollection 缓存被拒绝的连接 Promise**（`@elysia-ai/shared/src/mongo-connector.ts`）：首次
    连接失败后终身瘫痪、close 时 rethrow。当前无调用方（潜伏死代码），启用前需修。
22. **fallback 链对 defaultSlot 请求不生效**（`model-gateway/src/index.ts`）：`request.slot` 为空时即使
    为 defaultSlot 配置了 slots 映射也不走 fallback。

### 工程质量

23. **多处源文件注释 GBK/UTF-8 双重编码乱码**（behavior/runtime/homeostasis/bond/brain 的 index.ts 等）：
    某次提交用错误编码保存；不影响运行但持续污染 diff，建议一次性转码修复。
24. **docs 引用已删除的导出**：`elysia-ai-koishi-integration-guide.md` 仍引用 `preflightMemoryConfig` 等
    已随持久化架构收敛删除的 API。
