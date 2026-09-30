import { DAYS, type Day } from '../types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Parses a YYYY-MM-DD string as a local-time date (avoids UTC off-by-one). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function weekRange(startDate: string, week: number): { start: Date; end: Date } {
  const start = addDays(parseISODate(startDate), (week - 1) * 7)
  return { start, end: addDays(start, 6) }
}

const ddmm = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`

/** "14.09 – 20.09" */
export function formatWeekRange(startDate: string, week: number): string {
  const { start, end } = weekRange(startDate, week)
  return `${ddmm(start)} – ${ddmm(end)}`
}

export function dateForDay(startDate: string, week: number, day: Day): Date {
  return addDays(weekRange(startDate, week).start, DAYS.indexOf(day))
}

export function formatDayDate(date: Date): string {
  return ddmm(date)
}

/** 1-based week containing `today`; 0 before the semester, weekCount + 1 after it. */
export function rawWeekIndex(startDate: string, weekCount: number, today = new Date()): number {
  const start = parseISODate(startDate)
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.floor((midnight.getTime() - start.getTime()) / MS_PER_DAY)
  if (diff < 0) return 0
  const week = Math.floor(diff / 7) + 1
  return week > weekCount ? weekCount + 1 : week
}

export function currentWeek(startDate: string, weekCount: number, today = new Date()): number {
  return Math.min(Math.max(rawWeekIndex(startDate, weekCount, today), 1), weekCount)
}

export function todayDay(today = new Date()): Day {
  return DAYS[(today.getDay() + 6) % 7]
}

const RANGE_SEPARATOR = /\s*[-–—]\s*|\s+/

/** "10", "10:15", "10.15", "10h15" and "1015" all read as minutes since midnight. */
function timeToMinutes(part: string | undefined): number | null {
  const m = part?.trim().match(/^(\d{1,2})[:.h]?(\d{2})?$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function formatMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Parses "10:15-12:00", "10-12", "10.15 – 12", "1015 1200" into minutes since midnight. */
export function parseTimeRange(time: string): { start: number; end: number } | null {
  const parts = time.trim().split(RANGE_SEPARATOR)
  const start = timeToMinutes(parts[0])
  if (start === null) return null
  const end = timeToMinutes(parts[1]) ?? start + 105
  return { start, end: Math.max(end, start + 30) }
}

/** Tidies typed input into "HH:MM-HH:MM"; anything unreadable is left as the user wrote it. */
export function normalizeTimeRange(time: string): string {
  const trimmed = time.trim()
  const parts = trimmed.split(RANGE_SEPARATOR)
  if (parts.length > 2) return trimmed
  const start = timeToMinutes(parts[0])
  if (start === null) return trimmed
  if (parts.length === 1) return formatMinutes(start)
  const end = timeToMinutes(parts[1])
  return end === null ? trimmed : `${formatMinutes(start)}-${formatMinutes(end)}`
}
