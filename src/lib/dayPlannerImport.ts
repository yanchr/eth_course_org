import type { ActivityPreset, Day, Subject } from '../types'
import { DAYS } from '../types'
import { currentWeek, formatMinutes, parseISODate, parseTimeRange } from './semester'
import { slotLabel, slotsForDay } from './schedule'

/** Weekday (Mon–Sun) for a YYYY-MM-DD local date. */
export function dayOfIsoDate(iso: string): Day {
  const date = parseISODate(iso)
  return DAYS[(date.getDay() + 6) % 7]
}

/**
 * Convert that day's university schedule slots into one-off fixed activities.
 * Ids are stable (`import:${slot.id}`) so re-import skips duplicates.
 */
export function importClassActivities(
  subjects: Subject[],
  date: string,
  semesterStartDate: string,
  weekCount: number,
): ActivityPreset[] {
  const day = dayOfIsoDate(date)
  const week = currentWeek(semesterStartDate, weekCount, parseISODate(date))
  const placed = slotsForDay(subjects, day, week)
  const out: ActivityPreset[] = []

  for (const { subject, slot } of placed) {
    const range = parseTimeRange(slot.time)
    if (!range) continue
    const durationMinutes = Math.max(5, range.end - range.start)
    out.push({
      id: `import:${slot.id}`,
      name: `${subject.name} · ${slotLabel(slot.type)}`,
      durationMinutes,
      anchor: { type: 'fixed', time: formatMinutes(range.start) },
      isDefault: false,
      color: 'zinc',
    })
  }
  return out
}
