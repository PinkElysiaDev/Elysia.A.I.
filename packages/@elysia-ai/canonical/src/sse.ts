/**
 * 与传输无关的 SSE（Server-Sent Events）帧解析器。
 *
 * 语义逐行对齐 Elysia-Api（Go）`backend/relay/sse_helpers.go` 的
 * SSEEventReader.scan()，包括以下实战踩坑后的兜底行为：
 * - 多行 `data:` 按 SSE 规范用换行拼接；
 * - 行尾 `\r`（CRLF）剥离，且容忍 `\r` 与 `\n` 落在不同网络分片里；
 * - `:` 开头的注释行忽略；
 * - 字段名后仅剥离一个可选空格（规范行为，第二个空格属于值）；
 * - retry 字段必须是完整非负整数（等价 Go strconv.ParseInt 对
 *   TrimSpace 后整串的严格解析），否则忽略但计入"已有字段"；
 * - 部分非标服务器不带 `data:` 前缀直接吐裸 JSON 或裸 `[DONE]`：
 *   当且仅当当前事件尚未积累任何字段时，这样的行立即作为 data 触发事件；
 * - 未知字段名的行按 data 保留（Go 默认分支行为，保真优先）。
 *
 * 本模块只做纯字符串处理，不触碰任何 I/O；字节流到字符串的解码、
 * 超时与取消属于传输层（@elysia-ai/client / 网关）的职责。
 */

/** 一个装配完成的 SSE 事件。data 为多行 data: 字段以换行拼接的结果。 */
export interface SSEEvent {
  /** event: 字段值，未出现时为空字符串。 */
  readonly event: string
  /** data: 字段内容（多行以 \n 拼接），可能为空字符串。 */
  readonly data: string
  /** id: 字段值，未出现时为空字符串。 */
  readonly id: string
  /** retry: 字段值（毫秒）。未出现、非整数或为负时为 undefined。 */
  readonly retryMs?: number
}

/** 单行长度上限，对齐 Go 侧 SSEBufMax（16MB），防御无界缓冲。 */
export const DEFAULT_MAX_LINE_LENGTH = 16 * 1024 * 1024

export interface SSEParserOptions {
  /** 允许的最大单行长度（字符数），超出抛出 SSEParserError。默认 16MB。 */
  maxLineLength?: number
}

/** 行长超限。调用方应将其视为流损坏，终止连接。 */
export class SSEParserError extends Error {
  constructor(
    message: string,
    public readonly lineLength: number,
    public readonly limit: number,
  ) {
    super(message)
    this.name = 'SSEParserError'
  }
}

function isValidJSON(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** 等价 Go strconv.ParseInt(strings.TrimSpace(v), 10, 64)：整串必须是整数。 */
function parseRetryMillis(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^[+-]?\d+$/.test(trimmed)) return undefined
  const ms = Number.parseInt(trimmed, 10)
  return Number.isSafeInteger(ms) && ms >= 0 ? ms : undefined
}

/**
 * 增量式 SSE 解析器。把任意来源的字符串分片喂给 push()，
 * 取回期间装配完成的事件；流结束时调用 end() 取回尾部残余。
 *
 * ```ts
 * const parser = new SSEParser()
 * for (const event of parser.push(chunk)) handle(event)
 * for (const event of parser.end()) handle(event)
 * ```
 */
export class SSEParser {
  private buffer = ''
  private eventName = ''
  private eventId = ''
  private retryMs: number | undefined
  private dataLines: string[] = []
  private hasFields = false
  private readonly maxLineLength: number

  constructor(options: SSEParserOptions = {}) {
    this.maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH
  }

  /** 喂入一个字符串分片，返回由该分片触发完成的事件（可能为空）。 */
  push(chunk: string): SSEEvent[] {
    if (typeof chunk !== 'string' || chunk === '') return []
    this.buffer += chunk

    const events: SSEEvent[] = []
    let newlineAt = this.buffer.indexOf('\n')
    while (newlineAt >= 0) {
      const line = this.buffer.slice(0, newlineAt)
      this.buffer = this.buffer.slice(newlineAt + 1)
      this.checkLineLength(line.length)
      events.push(...this.processLine(line))
      newlineAt = this.buffer.indexOf('\n')
    }
    // 未终结的半行随分片持续增长，同样受上限保护。
    this.checkLineLength(this.buffer.length)
    return events
  }

  /** 通知流结束：处理最后的无换行残行，并冲刷未以空行收尾的挂起事件。 */
  end(): SSEEvent[] {
    const events: SSEEvent[] = []
    if (this.buffer !== '') {
      const line = this.buffer
      this.buffer = ''
      events.push(...this.processLine(line))
    }
    const tail = this.emitPending()
    if (tail) events.push(tail)
    return events
  }

  private checkLineLength(length: number): void {
    if (length > this.maxLineLength) {
      throw new SSEParserError(
        `SSE line length ${length} exceeds limit ${this.maxLineLength}`,
        length,
        this.maxLineLength,
      )
    }
  }

  /** 处理一条以 \n 终结（或流末尾无 \n）的原始行，可能产出 0 或 1 个事件。 */
  private processLine(rawLine: string): SSEEvent[] {
    // 仅在行已完整（\n 已到）或流已结束时才剥 \r，避免误伤 "\r | \n" 分片。
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    if (line === '') {
      const event = this.emitPending()
      return event ? [event] : []
    }
    if (line.startsWith(':')) return []

    const colonAt = line.indexOf(':')
    const field = colonAt === -1 ? line : line.slice(0, colonAt)
    let value = colonAt === -1 ? '' : line.slice(colonAt + 1)
    if (colonAt !== -1 && value.startsWith(' ')) value = value.slice(1)

    switch (field) {
      case 'event':
        this.eventName = value
        this.hasFields = true
        return []
      case 'data':
        this.dataLines.push(value)
        this.hasFields = true
        return []
      case 'id':
        this.eventId = value
        this.hasFields = true
        return []
      case 'retry': {
        const ms = parseRetryMillis(value)
        if (ms !== undefined) this.retryMs = ms
        this.hasFields = true
        return []
      }
      default: {
        const trimmed = line.trim()
        if (!this.hasFields && (trimmed === '[DONE]' || isValidJSON(trimmed))) {
          this.dataLines.push(trimmed)
          const event = this.emitPending()
          return event ? [event] : []
        }
        this.dataLines.push(line)
        this.hasFields = true
        return []
      }
    }
  }

  /** 空行或流结束时冲挂起事件；什么字段都没有时不产出。 */
  private emitPending(): SSEEvent | null {
    if (!this.hasFields && this.dataLines.length === 0) return null
    const event: SSEEvent = {
      event: this.eventName,
      data: this.dataLines.join('\n'),
      id: this.eventId,
      retryMs: this.retryMs,
    }
    this.eventName = ''
    this.eventId = ''
    this.retryMs = undefined
    this.dataLines = []
    this.hasFields = false
    return event
  }
}

/**
 * 便捷封装：把任意异步字符串分片序列（如 transport 层逐 chunk 解码后的
 * ReadableStream / AsyncIterable）解析为 SSE 事件流。仍不含任何 I/O。
 */
export async function* readSSE(chunks: AsyncIterable<string>): AsyncGenerator<SSEEvent> {
  const parser = new SSEParser()
  for await (const chunk of chunks) {
    for (const event of parser.push(chunk)) yield event
  }
  for (const event of parser.end()) yield event
}
