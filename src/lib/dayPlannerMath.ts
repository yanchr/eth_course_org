import type { PlannedTodoItem, StudySession } from '../types'

export interface MeanSd {
  mean: number
  sd: number
  /** Number of weekly samples used for the combined todo (before fallback). */
  n: number
}

/** Key: `${subjectId}\0${week}\0${category}` → minutes. */
export function categoryWeekKey(subjectId: string, week: number, category: string): string {
  return `${subjectId}\0${week}\0${category}`
}

/** Allocate each session evenly across its categories; sum minutes per (subject, week, category). */
export function buildCategoryWeekMinutes(sessions: StudySession[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    if (s.categories.length === 0) continue
    const shareMin = s.durationMs / s.categories.length / 60000
    for (const category of s.categories) {
      const key = categoryWeekKey(s.subjectId, s.week, category)
      map.set(key, (map.get(key) ?? 0) + shareMin)
    }
  }
  return map
}

function sampleMeanSd(values: number[]): MeanSd {
  const n = values.length
  if (n === 0) return { mean: 0, sd: 0, n: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / n
  if (n === 1) return { mean, sd: 0, n: 1 }
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
  return { mean, sd: Math.sqrt(variance), n }
}

/**
 * Global baseline across all (subjectId, category, week) weekly totals.
 * Empty study history → mean 60 min, sd 0.
 */
export function globalBaseline(sessions: StudySession[]): MeanSd {
  const map = buildCategoryWeekMinutes(sessions)
  if (map.size === 0) return { mean: 60, sd: 0, n: 0 }
  return sampleMeanSd([...map.values()])
}

/**
 * Combined weekly totals T_{C,w} = sum_{c in C} t_{c,w} for weeks with T > 0,
 * then 3-tier hierarchical μ/σ fallback.
 */
export function combinedTodoStats(
  sessions: StudySession[],
  subjectId: string,
  categories: string[],
): MeanSd {
  const C = categories.length
  if (C === 0) return { mean: 0, sd: 0, n: 0 }

  const map = buildCategoryWeekMinutes(sessions)
  const weeks = new Set<number>()
  for (const key of map.keys()) {
    const [sid, weekStr] = key.split('\0')
    if (sid === subjectId) weeks.add(Number(weekStr))
  }

  const totals: number[] = []
  for (const week of weeks) {
    let total = 0
    for (const category of categories) {
      total += map.get(categoryWeekKey(subjectId, week, category)) ?? 0
    }
    if (total > 0) totals.push(total)
  }

  const global = globalBaseline(sessions)
  const n = totals.length

  if (n >= 2) {
    const stats = sampleMeanSd(totals)
    return stats
  }
  if (n === 1) {
    return { mean: totals[0], sd: global.sd * C, n: 1 }
  }
  return { mean: global.mean * C, sd: global.sd * C, n: 0 }
}

/** Target work minutes: custom override, or round(μ + multiplier × σ). */
export function todoTargetMinutes(item: PlannedTodoItem, sessions: StudySession[]): number {
  if (item.customDurationMinutes != null && item.customDurationMinutes > 0) {
    return Math.round(item.customDurationMinutes)
  }
  const { mean, sd } = combinedTodoStats(sessions, item.subjectId, item.categories)
  return Math.max(5, Math.round(mean + item.sdMultiplier * sd))
}

export function sdMultiplierLabel(multiplier: number): string {
  if (multiplier === 0) return 'Avg'
  return `Avg + ${multiplier} SD`
}

export function todoLabel(categories: string[]): string {
  return categories.join(' ^ ')
}
