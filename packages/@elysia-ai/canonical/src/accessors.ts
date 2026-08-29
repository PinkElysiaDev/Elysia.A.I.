/**
 * 对未定形 JSON（JSON.parse 的产物）的防御式访问器。
 * 对齐 Elysia-Api Go 侧 stringValue / boolValue / numberValue / intValue 等
 * 工具的语义：取不到就是零值，绝不抛异常。
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function boolValue(value: unknown): boolean {
  return value === true
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

export function intValue(value: unknown): number {
  return numberValue(value) ?? 0
}

export function int64Value(value: unknown): number {
  return numberValue(value) ?? 0
}

export function firstNonEmptyString(...values: string[]): string {
  for (const value of values) {
    if (value !== '') return value
  }
  return ''
}

export function firstNonNilValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== null && value !== undefined) return value
  }
  return null
}

export function stringSlice(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string') out.push(item)
  }
  return out
}

/** 任意值 → 字符串：字符串原样，其余 JSON 序列化（Go contentValueToString）。 */
export function contentValueToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 从多个候选键里取第一个非空值（Go firstNonValue）。 */
export function firstNonValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== null && record[key] !== undefined) return record[key]
  }
  return null
}
