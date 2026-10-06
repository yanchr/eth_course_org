import type { ActiveStudy, StudySession } from '../types'

export function activeElapsedMs(active: ActiveStudy, now = Date.now()): number {
  return active.accumulatedMs + (active.resumedAt === null ? 0 : Math.max(0, now - active.resumedAt))
}

export interface WeekTime {
  week: number
  ms: number
}

export interface SubjectTime {
  subjectId: string
  totalMs: number
  /** Weeks with recorded time, ascending. */
  weeks: WeekTime[]
  /** totalMs / weeks with recorded time. */
  avgPerWeekMs: number
}

export interface TaskTime {
  subjectId: string
  week: number
  category: string
  ms: number
}

export interface StudyStats {
  totalMs: number
  weeks: WeekTime[]
  avgPerWeekMs: number
  /** Most studied first. */
  subjects: SubjectTime[]
  /** Most studied first. */
  tasks: TaskTime[]
  /** Time split onto todos / distinct todos with time. */
  avgPerTaskMs: number
}

function sortedWeeks(map: Map<number, number>): WeekTime[] {
  return [...map].map(([week, ms]) => ({ week, ms })).sort((a, b) => a.week - b.week)
}

const add = <K>(map: Map<K, number>, key: K, ms: number) => map.set(key, (map.get(key) ?? 0) + ms)

export function studyStats(sessions: StudySession[]): StudyStats {
  let totalMs = 0
  const weeks = new Map<number, number>()
  const subjects = new Map<string, { totalMs: number; weeks: Map<number, number> }>()
  const tasks = new Map<string, TaskTime>()

  for (const s of sessions) {
    totalMs += s.durationMs
    add(weeks, s.week, s.durationMs)

    let subject = subjects.get(s.subjectId)
    if (!subject) {
      subject = { totalMs: 0, weeks: new Map() }
      subjects.set(s.subjectId, subject)
    }
    subject.totalMs += s.durationMs
    add(subject.weeks, s.week, s.durationMs)

    if (s.categories.length === 0) continue
    const share = s.durationMs / s.categories.length
    for (const category of s.categories) {
      const key = JSON.stringify([s.subjectId, s.week, category])
      const task = tasks.get(key)
      if (task) task.ms += share
      else tasks.set(key, { subjectId: s.subjectId, week: s.week, category, ms: share })
    }
  }

  const taskList = [...tasks.values()].sort((a, b) => b.ms - a.ms)
  const taskMs = taskList.reduce((sum, t) => sum + t.ms, 0)

  return {
    totalMs,
    weeks: sortedWeeks(weeks),
    avgPerWeekMs: weeks.size ? totalMs / weeks.size : 0,
    subjects: [...subjects]
      .map(([subjectId, s]) => ({
        subjectId,
        totalMs: s.totalMs,
        weeks: sortedWeeks(s.weeks),
        avgPerWeekMs: s.totalMs / s.weeks.size,
      }))
      .sort((a, b) => b.totalMs - a.totalMs),
    tasks: taskList,
    avgPerTaskMs: taskList.length ? taskMs / taskList.length : 0,
  }
}

export function taskAverageKey(subjectId: string, category: string): string {
  return `${subjectId}\0${category}`
}

/** Mean recorded time for each todo, over the weeks that have time logged for it. */
export function taskAverages(sessions: StudySession[]): Map<string, number> {
  const grouped = new Map<string, { sum: number; weeks: number }>()
  for (const task of studyStats(sessions).tasks) {
    const key = taskAverageKey(task.subjectId, task.category)
    const group = grouped.get(key)
    if (group) {
      group.sum += task.ms
      group.weeks += 1
    } else grouped.set(key, { sum: task.ms, weeks: 1 })
  }
  const averages = new Map<string, number>()
  for (const [key, group] of grouped) averages.set(key, group.sum / group.weeks)
  return averages
}

/** "14:05" in local time, the value format of `<input type="time">`. */
export function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Local Date from a YYYY-MM-DD day and an HH:MM time; null if either is unreadable. */
export function combineDateTime(day: string, time: string): Date | null {
  const d = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const t = time.match(/^(\d{2}):(\d{2})/)
  if (!d || !t) return null
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
}

/**
 * Start and end of a from–to entry on one day. An end at or before the start is read as
 * running past midnight into the next day.
 */
export function timeSpan(day: string, from: string, to: string): { start: Date; end: Date } | null {
  const start = combineDateTime(day, from)
  const end = combineDateTime(day, to)
  if (!start || !end) return null
  if (end <= start) end.setDate(end.getDate() + 1)
  return { start, end }
}

/** "Mon 05.10 · 14:05–15:20" */
export function formatSessionSpan(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt)
  const end = new Date(endedAt)
  const day = start.toLocaleDateString('en-GB', { weekday: 'short' })
  const date = `${String(start.getDate()).padStart(2, '0')}.${String(start.getMonth() + 1).padStart(2, '0')}`
  return `${day} ${date} · ${toTimeInput(start)}–${toTimeInput(end)}`
}

/** "1h 12m", "8m", "<1m" */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return ms > 0 ? '<1m' : '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

/** "1:02:05" / "02:05" for a running clock. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
