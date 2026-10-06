import type { ProgressState, Subject } from '../types'
import { categoriesInWeek, isTracked, occursInWeek } from './subjects'

export function progressKey(week: number, category: string): string {
  return `${week}-${category}`
}

export function getProgress(subject: Subject, week: number, category: string): ProgressState {
  return subject.progress[progressKey(week, category)] ?? 'pending'
}

/** Primary action: pending <-> completed. A canceled cell becomes completed. */
export function toggleCompleted(state: ProgressState): ProgressState {
  return state === 'completed' ? 'pending' : 'completed'
}

/** Secondary action: anything <-> canceled. */
export function toggleCanceled(state: ProgressState): ProgressState {
  return state === 'canceled' ? 'pending' : 'canceled'
}

export interface ProgressStats {
  completed: number
  canceled: number
  total: number
  /** completed / (total - canceled), 0..1 */
  ratio: number
}

function stats(completed: number, canceled: number, total: number): ProgressStats {
  const effective = total - canceled
  return { completed, canceled, total, ratio: effective > 0 ? completed / effective : 0 }
}

export function weekStats(subject: Subject, week: number): ProgressStats {
  const names = categoriesInWeek(subject, week)
  let completed = 0
  let canceled = 0
  for (const c of names) {
    const s = getProgress(subject, week, c)
    if (s === 'completed') completed++
    else if (s === 'canceled') canceled++
  }
  return stats(completed, canceled, names.length)
}

/**
 * Nothing outstanding for the week: every category is completed or canceled.
 * A subject without categories has nothing to check off and counts as not done,
 * matching how `weekCompletions` scores an empty week.
 */
export function isWeekDone(subject: Subject, week: number): boolean {
  if (categoriesInWeek(subject, week).length === 0) return false
  const s = weekStats(subject, week)
  return s.completed + s.canceled === s.total
}

/** Subjects with outstanding work first, then the ones done for the week. Order within each group is kept. */
export function sortByWeekOutstanding(subjects: Subject[], week: number): Subject[] {
  const outstanding: Subject[] = []
  const done: Subject[] = []
  for (const subject of subjects) {
    if (!isTracked(subject) || !occursInWeek(subject, week)) continue
    if (isWeekDone(subject, week)) done.push(subject)
    else outstanding.push(subject)
  }
  return [...outstanding, ...done]
}

/** Stats across weeks 1..throughWeek (inclusive). One-off events only count their own week. */
export function subjectStats(subject: Subject, throughWeek: number): ProgressStats {
  if (!isTracked(subject)) return stats(0, 0, 0)
  if (subject.onceWeek != null) {
    if (subject.onceWeek > throughWeek) return stats(0, 0, categoriesInWeek(subject, subject.onceWeek).length)
    return weekStats(subject, subject.onceWeek)
  }
  let completed = 0
  let canceled = 0
  let total = 0
  for (let w = 1; w <= throughWeek; w++) {
    const s = weekStats(subject, w)
    completed += s.completed
    canceled += s.canceled
    total += s.total
  }
  return stats(completed, canceled, total)
}

export interface WeekCompletion {
  completed: number
  /** items that still count this week, i.e. total minus canceled */
  scheduled: number
  /** completed / scheduled, 0..1. A week with only canceled items counts as done. */
  ratio: number
}

/** Completion per semester week across all subjects, index 0 = week 1. */
export function weekCompletions(subjects: Subject[], weekCount: number): WeekCompletion[] {
  return Array.from({ length: weekCount }, (_, i) => {
    let completed = 0
    let canceled = 0
    let total = 0
    for (const subject of subjects) {
      const s = weekStats(subject, i + 1)
      completed += s.completed
      canceled += s.canceled
      total += s.total
    }
    const scheduled = total - canceled
    return { completed, scheduled, ratio: scheduled > 0 ? completed / scheduled : total > 0 ? 1 : 0 }
  })
}

export function stateLabel(state: ProgressState): string {
  return state === 'completed' ? 'completed' : state === 'canceled' ? 'canceled, no class' : 'pending'
}
