/**
 * 迷你 semver 区间匹配（kernel 零依赖，不引外部 semver 库）。
 * 支持组合：精确 "0.1.0"、插入符 "^0.1.0"、波浪号 "~0.1.0"、
 * 比较符 ">=0.1.0"、上限 "<0.2.0"，空格分隔表示 AND，"||" 表示 OR。
 * 仅用于 manifest 兼容性告警，不追求完整 semver 语义（预发布标签按非空处理）。
 */

function parseVersion(version: string): [number, number, number, string?] {
  const trimmed = version.trim().replace(/^v/, '')
  const [core, prerelease] = trimmed.split('-', 2)
  const parts = core.split('.').map((part) => Number.parseInt(part, 10))
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, prerelease]
}

function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch, aPre] = parseVersion(a)
  const [bMajor, bMinor, bPatch, bPre] = parseVersion(b)
  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  if (aPatch !== bPatch) return aPatch - bPatch
  // 无预发布 > 有预发布；两个都有预发布按字典序（粗略）。
  if (aPre === undefined && bPre === undefined) return 0
  if (aPre === undefined) return 1
  if (bPre === undefined) return -1
  return aPre < bPre ? -1 : aPre > bPre ? 1 : 0
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const match = comparator.match(/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/)
  if (!match) return true
  const [, operator, target] = match
  const cmp = compareVersions(version, target)
  switch (operator) {
    case '>=': return cmp >= 0
    case '<=': return cmp <= 0
    case '>': return cmp > 0
    case '<': return cmp < 0
    case '=': return cmp === 0
    case '~': {
      const [major, minor] = parseVersion(target)
      const [vMajor, vMinor] = parseVersion(version)
      return cmp >= 0 && vMajor === major && vMinor === minor
    }
    case '^': {
      const [major, minor] = parseVersion(target)
      const [vMajor, vMinor] = parseVersion(version)
      if (major > 0) return cmp >= 0 && vMajor === major
      return cmp >= 0 && vMinor === minor // ^0.x.y 锁定 minor
    }
    default: return cmp === 0
  }
}

/** 判断 version 是否满足 range（如 "^0.1.0"、">=0.1.0 <0.2.0"、"0.1.0 || ^0.2.0"）。 */
export function satisfiesRange(version: string, range: string): boolean {
  const versionNormalized = version.trim().replace(/^v/, '')
  return range.split('||').some((alternative) => {
    const comparators = alternative.trim().split(/\s+/).filter(Boolean)
    if (comparators.length === 0) return true
    return comparators.every((comparator) => satisfiesComparator(versionNormalized, comparator))
  })
}
