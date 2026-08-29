/**
 * Phase 18 Scheduler 最小闭环集成测试
 *
 * 验证 Scheduler 作为数字生命“未来行为调度层”的最小能力：
 * 1. 可创建并查询 scheduled task
 * 2. tick() 只执行 due task
 * 3. completed task 不会重复执行
 * 4. failed task 会记录 attempts 与 lastError
 * 5. cancelled task 不会执行
 * 6. follow-up task 可通过 payload.stimulus 重新注入 stimulus.received
 */

import { afterEach, describe, expect, it } from 'vitest'
import type {
  CoreEventMap,
  ScheduledTask,
  Stimulus,
} from '../packages/@elysia-ai/core/src/index.js'
import { createDefaultRuntime, type Runtime } from '../packages/elysia-ai-runtime/src/runtime.js'
import {
  DefaultSchedulerService,
  MemoryScheduledTaskRepository,
} from '../packages/elysia-ai-runtime/src/scheduler/index.js'

function createStimulus(id: string): Stimulus {
  return {
    id,
    type: 'system',
    timestamp: Date.now(),
    habitatId: 'habitat-phase18',
    actorId: 'scheduler-phase18',
    channelId: 'channel-phase18',
    platform: 'qq',
    botId: 'bot-phase18',
    payload: {
      content: 'follow-up stimulus',
    },
  }
}

describe('Phase 18 Scheduler 最小闭环集成测试', () => {
  let runtime: Runtime | undefined

  afterEach(async () => {
    if (runtime?.getState() === 'running') await runtime.stop()
    runtime = undefined
  })

  it('可创建并查询 scheduled task', async () => {
    runtime = createDefaultRuntime()

    const createdEvents: CoreEventMap['scheduler.task.created'][] = []
    runtime.context.eventBus.on('scheduler.task.created', (payload) => {
      createdEvents.push(payload)
    })

    const task = await runtime.scheduler.schedule({
      id: 'task-phase18-create',
      type: 'followup',
      runAt: 1000,
      target: {
        lifeId: 'life-phase18',
        habitatId: 'habitat-phase18',
      },
      priority: 10,
      payload: {
        reason: 'unit-test',
      },
    })

    expect(task.id).toBe('task-phase18-create')
    expect(task.status).toBe('pending')
    expect(task.priority).toBe(10)

    await expect(runtime.scheduledTaskRepository.getById('task-phase18-create')).resolves.toEqual(task)
    await expect(runtime.scheduler.listTasks()).resolves.toEqual([task])
    expect(createdEvents).toEqual([{ taskId: 'task-phase18-create', task }])
  })

  it('tick() 只执行 due task，且按 priority 从高到低执行', async () => {
    const repository = new MemoryScheduledTaskRepository()
    const executedTaskIds: string[] = []
    runtime = createDefaultRuntime({
      scheduledTaskRepository: repository,
    })

    runtime.scheduler = new DefaultSchedulerService(
      repository,
      runtime.context.eventBus,
      {
        followup: async (task) => {
          executedTaskIds.push(task.id)
        },
      },
      runtime.context.logger,
    )

    await runtime.scheduler.schedule({
      id: 'task-phase18-future',
      type: 'followup',
      runAt: 2000,
    })
    await runtime.scheduler.schedule({
      id: 'task-phase18-low',
      type: 'followup',
      runAt: 1000,
      priority: 1,
    })
    await runtime.scheduler.schedule({
      id: 'task-phase18-high',
      type: 'followup',
      runAt: 1000,
      priority: 100,
    })

    const results = await runtime.scheduler.tick(1000)

    expect(results).toHaveLength(2)
    expect(executedTaskIds).toEqual(['task-phase18-high', 'task-phase18-low'])

    expect((await repository.getById('task-phase18-high'))?.status).toBe('completed')
    expect((await repository.getById('task-phase18-low'))?.status).toBe('completed')
    expect((await repository.getById('task-phase18-future'))?.status).toBe('pending')
  })

  it('completed task 不会重复执行', async () => {
    const repository = new MemoryScheduledTaskRepository()
    let executedCount = 0
    runtime = createDefaultRuntime({
      scheduledTaskRepository: repository,
    })

    runtime.scheduler = new DefaultSchedulerService(
      repository,
      runtime.context.eventBus,
      {
        followup: async () => {
          executedCount += 1
        },
      },
      runtime.context.logger,
    )

    await runtime.scheduler.schedule({
      id: 'task-phase18-once',
      type: 'followup',
      runAt: 1000,
    })

    await runtime.scheduler.tick(1000)
    await runtime.scheduler.tick(1000)

    expect(executedCount).toBe(1)
    expect((await repository.getById('task-phase18-once'))?.status).toBe('completed')
  })

  it('failed task 会记录 attempts 与 lastError', async () => {
    const repository = new MemoryScheduledTaskRepository()
    runtime = createDefaultRuntime({
      scheduledTaskRepository: repository,
    })

    runtime.scheduler = new DefaultSchedulerService(
      repository,
      runtime.context.eventBus,
      {
        followup: async () => {
          throw new Error('phase18 failure')
        },
      },
      runtime.context.logger,
    )

    const failedEvents: CoreEventMap['scheduler.task.failed'][] = []
    runtime.context.eventBus.on('scheduler.task.failed', (payload) => {
      failedEvents.push(payload)
    })

    await runtime.scheduler.schedule({
      id: 'task-phase18-failed',
      type: 'followup',
      runAt: 1000,
      maxAttempts: 1,
    })

    const results = await runtime.scheduler.tick(1000)
    const failed = await repository.getById('task-phase18-failed')

    expect(results).toHaveLength(1)
    expect(results[0].completed).toBe(false)
    expect(failed?.status).toBe('failed')
    expect(failed?.attempts).toBe(1)
    expect(failed?.lastError).toBe('phase18 failure')
    expect(failedEvents).toHaveLength(1)
    expect(failedEvents[0].taskId).toBe('task-phase18-failed')
  })

  it('cancelled task 不会执行', async () => {
    const repository = new MemoryScheduledTaskRepository()
    let executed = false
    runtime = createDefaultRuntime({
      scheduledTaskRepository: repository,
    })

    runtime.scheduler = new DefaultSchedulerService(
      repository,
      runtime.context.eventBus,
      {
        followup: async () => {
          executed = true
        },
      },
      runtime.context.logger,
    )

    await runtime.scheduler.schedule({
      id: 'task-phase18-cancelled',
      type: 'followup',
      runAt: 1000,
    })
    await runtime.scheduler.cancel('task-phase18-cancelled', 'test cancellation')

    const results = await runtime.scheduler.tick(1000)
    const cancelled = await repository.getById('task-phase18-cancelled')

    expect(results).toEqual([])
    expect(executed).toBe(false)
    expect(cancelled?.status).toBe('cancelled')
    expect(cancelled?.metadata?.['cancelReason']).toBe('test cancellation')
  })

  it('follow-up task 到期走完整 receiveStimulus 主链（P1-7：stimulus.received + projection.routed）', async () => {
    runtime = createDefaultRuntime()
    await runtime.start()

    const stimulusEvents: CoreEventMap['stimulus.received'][] = []
    runtime.context.eventBus.on('stimulus.received', (payload) => {
      stimulusEvents.push(payload)
    })
    const routedEvents: CoreEventMap['projection.routed'][] = []
    runtime.context.eventBus.on('projection.routed', (payload) => {
      routedEvents.push(payload)
    })

    const stimulus = createStimulus('stim-phase18-followup')
    await runtime.scheduler.schedule({
      id: 'task-phase18-followup',
      type: 'followup',
      runAt: 1000,
      payload: {
        stimulus,
      },
    })

    await runtime.scheduler.tick(1000)

    expect(stimulusEvents).toEqual([{
      stimulusId: 'stim-phase18-followup',
      stimulus,
    }])
    // followup 重放必须经过投影路由，cognition/behavior 才会被触发
    expect(routedEvents).toHaveLength(1)
    expect(routedEvents[0].stimulusId).toBe('stim-phase18-followup')
    expect((await runtime.scheduledTaskRepository.getById('task-phase18-followup'))?.status).toBe('completed')
  })

  it('expired task 会标记为 expired 且不执行 handler', async () => {
    const repository = new MemoryScheduledTaskRepository()
    let executed = false
    runtime = createDefaultRuntime({
      scheduledTaskRepository: repository,
    })

    runtime.scheduler = new DefaultSchedulerService(
      repository,
      runtime.context.eventBus,
      {
        followup: async () => {
          executed = true
        },
      },
      runtime.context.logger,
    )

    const expiredEvents: CoreEventMap['scheduler.task.expired'][] = []
    runtime.context.eventBus.on('scheduler.task.expired', (payload) => {
      expiredEvents.push(payload)
    })

    await runtime.scheduler.schedule({
      id: 'task-phase18-expired',
      type: 'followup',
      runAt: 1000,
      expiresAt: 999,
    })

    const results = await runtime.scheduler.tick(1000)
    const expired = await repository.getById('task-phase18-expired') as ScheduledTask

    expect(results).toHaveLength(1)
    expect(results[0].completed).toBe(false)
    expect(executed).toBe(false)
    expect(expired.status).toBe('expired')
    expect(expiredEvents).toEqual([{
      taskId: 'task-phase18-expired',
      task: expired,
    }])
  })
})

// ─────────────────────────────────────────────────
// P1-8：崩溃残留 running 任务的启动回收
// ─────────────────────────────────────────────────

describe('P1-8 recoverInterruptedTasks', () => {
  let runtime: Runtime | undefined

  afterEach(async () => {
    if (runtime?.getState() === 'running') await runtime.stop()
    runtime = undefined
  })

  it('start() 回收上次进程残留的 running 任务：未达上限重置 pending，已达上限置 failed', async () => {
    const repository = new MemoryScheduledTaskRepository()
    await repository.save({
      id: 'task-stale-retry',
      type: 'followup',
      status: 'running',
      target: {},
      runAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
      priority: 0,
      payload: {},
      attempts: 0,
      maxAttempts: 3,
    })
    await repository.save({
      id: 'task-stale-dead',
      type: 'followup',
      status: 'running',
      target: {},
      runAt: 1000,
      createdAt: 1000,
      updatedAt: 1000,
      priority: 0,
      payload: {},
      attempts: 3,
      maxAttempts: 3,
    })

    runtime = createDefaultRuntime({ scheduledTaskRepository: repository })
    await runtime.start()

    const retryTask = await repository.getById('task-stale-retry')
    expect(retryTask?.status).toBe('pending')
    expect(retryTask?.attempts).toBe(1)
    expect(retryTask?.lastError).toContain('interrupted by restart')

    const deadTask = await repository.getById('task-stale-dead')
    expect(deadTask?.status).toBe('failed')
  })

  it('恢复出的 pending 任务会被调度循环执行', async () => {
    const repository = new MemoryScheduledTaskRepository()
    const stimulus = createStimulus('stim-stale-run')
    await repository.save({
      id: 'task-stale-run',
      type: 'followup',
      status: 'running',
      target: {},
      runAt: 1,
      createdAt: 1,
      updatedAt: 1,
      priority: 0,
      payload: { stimulus },
      attempts: 0,
      maxAttempts: 3,
    })

    runtime = createDefaultRuntime({ scheduledTaskRepository: repository })
    await runtime.start()

    // start 恢复为 pending 且 runAt=now；tick 应执行它
    const results = await runtime.scheduler.tick(Date.now())
    expect(results.some((result) => result.taskId === 'task-stale-run' && result.completed)).toBe(true)
  })
})

// ─────────────────────────────────────────────────
// P1-9：同 habitat 刺激串行处理
// ─────────────────────────────────────────────────

describe('P1-9 receiveStimulus habitat 串行化', () => {
  let runtime: Runtime | undefined

  afterEach(async () => {
    if (runtime?.getState() === 'running') await runtime.stop()
    runtime = undefined
  })

  it('同一 habitat 的 projection.routed 严格按到达顺序串行执行', async () => {
    runtime = createDefaultRuntime()
    await runtime.start()

    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const dispose = runtime.context.eventBus.on('projection.routed', (payload) => {
      if (payload.stimulusId === 'stim-ser-1') {
        order.push('start-1')
        return new Promise<void>((resolve) => { releaseFirst = resolve })
      }
      order.push(`routed-${payload.stimulusId}`)
      return undefined
    })

    const first = runtime.receiveStimulus({ ...createStimulus('stim-ser-1'), habitatId: 'habitat-ser' } as never)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = runtime.receiveStimulus({ ...createStimulus('stim-ser-2'), habitatId: 'habitat-ser' } as never)
    await new Promise((resolve) => setTimeout(resolve, 10))

    // 第二条必须被排队，直到第一条的 routed 监听器放行
    expect(order).toEqual(['start-1'])
    releaseFirst?.()
    await Promise.all([first, second])
    expect(order).toEqual(['start-1', 'routed-stim-ser-2'])
    dispose()
  })
})
