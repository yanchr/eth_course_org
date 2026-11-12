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

function categoryStats(
  map: Map<string, number>,
  global: MeanSd,
  subjectId: string,
  category: string,
): MeanSd {
  const values: number[] = []
  for (const [key, minutes] of map) {
    const [sid, , loggedCategory] = key.split('\0')
    if (sid === subjectId && loggedCategory === category && minutes > 0) values.push(minutes)
  }
  if (values.length >= 2) return sampleMeanSd(values)
  if (values.length === 1) return { mean: values[0], sd: global.sd, n: 1 }
  return { mean: global.mean, sd: global.sd, n: 0 }
}

/**
 * Means are additive per category, even when categories were logged in disjoint weeks.
 * SD uses paired complete weeks when possible and per-category fallback otherwise.
 */
export function combinedTodoStats(
  sessions: StudySession[],
  subjectId: string,
  categories: string[],
): MeanSd {
  const C = categories.length
  if (C === 0) return { mean: 0, sd: 0, n: 0 }

  const map = buildCategoryWeekMinutes(sessions)
  const global = globalBaseline(sessions)
  const individual = categories.map((category) => categoryStats(map, global, subjectId, category))
  const mean = individual.reduce((sum, stats) => sum + stats.mean, 0)

  const subjectWeeks = new Set<number>()
  for (const key of map.keys()) {
    const [sid, week] = key.split('\0')
    if (sid === subjectId) subjectWeeks.add(Number(week))
  }
  const pairedTotals = [...subjectWeeks].flatMap((week) => {
    const values = categories.map((category) => map.get(categoryWeekKey(subjectId, week, category)) ?? 0)
    return values.every((minutes) => minutes > 0)
      ? [values.reduce((sum, minutes) => sum + minutes, 0)]
      : []
  })
  if (pairedTotals.length >= 2) {
    return { mean, sd: sampleMeanSd(pairedTotals).sd, n: pairedTotals.length }
  }

  const sd = individual.every((stats) => stats.n === 1)
    ? individual.reduce((sum, stats) => sum + stats.sd, 0)
    : Math.sqrt(individual.reduce((sum, stats) => sum + stats.sd ** 2, 0))
  return { mean, sd, n: Math.min(...individual.map((stats) => stats.n)) }
}

/** Target work minutes: custom override, quantized lecture hours, or round(μ + multiplier × σ). */
export function todoTargetMinutes(item: PlannedTodoItem, sessions: StudySession[]): number {
  if (item.customDurationMinutes != null && item.customDurationMinutes > 0) {
    return Math.round(item.customDurationMinutes)
  }
  const { mean, sd } = combinedTodoStats(sessions, item.subjectId, item.categories)
  if (item.breakStyle === 'lecture') {
    const lectureHours = Math.max(1, Math.round(mean / 55))
    return 45 * lectureHours
  }
  return Math.max(5, Math.round(mean + item.sdMultiplier * sd))
}

export function sdMultiplierLabel(multiplier: number): string {
  if (multiplier === 0) return 'Avg'
  return `Avg + ${multiplier} SD`
}

export function todoLabel(categories: string[]): string {
  return categories.join(' ^ ')
}
