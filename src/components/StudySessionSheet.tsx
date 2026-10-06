import { useId, useState } from 'react'
import { Check, Play, Save, Trash2 } from 'lucide-react'
import type { StudySession } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { currentWeek, formatWeekRange, toISODate } from '../lib/semester'
import { categoriesInWeek, isTracked, occursInWeek } from '../lib/subjects'
import { getProgress } from '../lib/progress'
import { formatDuration, timeSpan, toTimeInput } from '../lib/study'
import { createId } from '../lib/id'
import { cn } from '../lib/cn'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { inputClass } from './ui/Field'

export type SessionSheetTarget = { kind: 'record' } | { kind: 'log' } | { kind: 'edit'; session: StudySession }

interface StudySessionSheetProps {
  target: SessionSheetTarget | null
  defaultWeek: number
  onClose: () => void
}

const TITLES: Record<SessionSheetTarget['kind'], { title: string; subtitle: string }> = {
  record: { title: 'Start recording', subtitle: 'Pick a course, a week and optional to-dos' },
  log: { title: 'Log a session', subtitle: 'Add time you already studied' },
  edit: { title: 'Edit session', subtitle: 'Change the course, to-dos or when you studied' },
}

export function StudySessionSheet({ target, defaultWeek, onClose }: StudySessionSheetProps) {
  const copy = TITLES[target?.kind ?? 'record']
  return (
    <Sheet open={target !== null} onClose={onClose} title={copy.title} subtitle={copy.subtitle}>
      {target && <SessionBody target={target} defaultWeek={defaultWeek} onDone={onClose} />}
    </Sheet>
  )
}

const HOUR_MS = 60 * 60 * 1000

function initialTimes(target: SessionSheetTarget): { day: string; from: string; to: string } {
  if (target.kind === 'edit') {
    const start = new Date(target.session.startedAt)
    return { day: toISODate(start), from: toTimeInput(start), to: toTimeInput(new Date(target.session.endedAt)) }
  }
  const now = new Date()
  return { day: toISODate(now), from: toTimeInput(new Date(now.getTime() - HOUR_MS)), to: toTimeInput(now) }
}

function SessionBody({
  target,
  defaultWeek,
  onDone,
}: {
  target: SessionSheetTarget
  defaultWeek: number
  onDone: () => void
}) {
  const { subjects, settings, startStudy, addStudySession, updateStudySession, deleteStudySession } = usePlanner()
  const editing = target.kind === 'edit' ? target.session : null
  const [week, setWeek] = useState(editing?.week ?? defaultWeek)
  const [subjectId, setSubjectId] = useState<string | null>(editing?.subjectId ?? null)
  const [categories, setCategories] = useState<string[]>(editing?.categories ?? [])
  const [times, setTimes] = useState(() => initialTimes(target))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const weekId = useId()
  const dayId = useId()
  const fromId = useId()
  const toId = useId()

  const withTimes = target.kind !== 'record'
  const eligible = subjects.filter((s) => isTracked(s) && occursInWeek(s, week))
  const subject = eligible.find((s) => s.id === subjectId) ?? null
  const span = withTimes ? timeSpan(times.day, times.from, times.to) : null
  const original = editing ? initialTimes(target) : null
  const timesChanged =
    !original || original.day !== times.day || original.from !== times.from || original.to !== times.to
  const spanMs = span ? span.end.getTime() - span.start.getTime() : 0
  const durationMs = editing && !timesChanged ? editing.durationMs : spanMs
  const timesValid = !withTimes || (span !== null && spanMs > 0 && spanMs < 24 * HOUR_MS)

  const changeWeek = (next: number) => {
    setWeek(next)
    const stillThere = subjects.find((s) => s.id === subjectId && isTracked(s) && occursInWeek(s, next))
    if (!stillThere) {
      setSubjectId(null)
      setCategories([])
    }
  }

  const changeDay = (day: string) => {
    setTimes((t) => ({ ...t, day }))
    const date = timeSpan(day, '00:00', '00:01')?.start
    if (date) changeWeek(currentWeek(settings.semesterStartDate, settings.weekCount, date))
  }

  const chooseSubject = (id: string) => {
    if (id === subjectId) return
    setSubjectId(id)
    setCategories([])
  }

  const toggleCategory = (category: string) =>
    setCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]))

  const submit = () => {
    if (!subject || !timesValid) return
    const picked = categoriesInWeek(subject, week).filter((c) => categories.includes(c))
    if (target.kind === 'record') {
      startStudy(subject.id, week, picked)
    } else if (span) {
      const session: StudySession = {
        id: editing?.id ?? createId(),
        subjectId: subject.id,
        week,
        categories: picked,
        durationMs,
        startedAt: span.start.toISOString(),
        endedAt: span.end.toISOString(),
      }
      if (editing) updateStudySession(session)
      else addStudySession(session)
    }
    onDone()
  }

  return (
    <div className="flex flex-col gap-6">
      {withTimes && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={dayId} className="text-xs font-medium text-zinc-500">
              Day
            </label>
            <input
              id={dayId}
              type="date"
              value={times.day}
              onChange={(e) => e.target.value && changeDay(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fromId} className="text-xs font-medium text-zinc-500">
                From
              </label>
              <input
                id={fromId}
                type="time"
                value={times.from}
                onChange={(e) => setTimes((t) => ({ ...t, from: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={toId} className="text-xs font-medium text-zinc-500">
                To
              </label>
              <input
                id={toId}
                type="time"
                value={times.to}
                onChange={(e) => setTimes((t) => ({ ...t, to: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <p className={cn('tabular text-xs', timesValid ? 'text-zinc-500' : 'text-red-600')}>
            {!span
              ? 'Enter a start and end time.'
              : !timesValid
                ? 'A session must be shorter than 24 hours.'
                : editing && !timesChanged && durationMs < spanMs
                  ? `${formatDuration(durationMs)} studied · ${formatDuration(spanMs - durationMs)} paused. Changing the times counts the whole span.`
                  : `${formatDuration(durationMs)}${span.end.getDate() !== span.start.getDate() ? ' · ends the next day' : ''}`}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={weekId} className="text-xs font-medium text-zinc-500">
          Week
        </label>
        <select id={weekId} value={week} onChange={(e) => changeWeek(Number(e.target.value))} className={inputClass}>
          {Array.from({ length: settings.weekCount }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w} · {formatWeekRange(settings.semesterStartDate, w)}
              {w === defaultWeek ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-zinc-500">Course</legend>
        {eligible.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400">
            No courses in week {week}.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {eligible.map((s) => (
            <OptionRow
              key={s.id}
              type="radio"
              name="study-course"
              checked={s.id === subjectId}
              onChange={() => chooseSubject(s.id)}
              label={s.name}
              meta={s.lecturer || undefined}
            />
          ))}
        </div>
      </fieldset>

      {subject && categoriesInWeek(subject, week).length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-zinc-500">
            To-dos (optional) · time is split evenly across the ones you pick
          </legend>
          {categoriesInWeek(subject, week).map((category) => {
            const state = getProgress(subject, week, category)
            return (
              <OptionRow
                key={category}
                type="checkbox"
                checked={categories.includes(category)}
                onChange={() => toggleCategory(category)}
                label={category}
                meta={state === 'completed' ? 'Done' : state === 'canceled' ? 'No class' : undefined}
              />
            )
          })}
        </fieldset>
      )}

      <Button
        variant="primary"
        icon={target.kind === 'record' ? <Play className="size-4" /> : <Save className="size-4" />}
        disabled={!subject || !timesValid}
        onClick={submit}
      >
        {target.kind === 'record' ? 'Start recording' : target.kind === 'log' ? 'Add session' : 'Save changes'}
      </Button>

      {editing &&
        (confirmDelete ? (
          <div className="flex gap-2">
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                deleteStudySession(editing.id)
                onDone()
              }}
            >
              Delete session
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
            Delete session
          </Button>
        ))}
    </div>
  )
}

interface OptionRowProps {
  type: 'radio' | 'checkbox'
  name?: string
  checked: boolean
  onChange: () => void
  label: string
  meta?: string
}

function OptionRow({ type, name, checked, onChange, label, meta }: OptionRowProps) {
  return (
    <label
      className={cn(
        'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm',
        'transition-colors duration-150 ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-900',
        checked ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white hover:border-zinc-300',
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center border transition-colors duration-150 ease-out',
          type === 'radio' ? 'rounded-full' : 'rounded-md',
          checked ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{label}</span>
      {meta && <span className="shrink-0 truncate text-xs text-zinc-400">{meta}</span>}
    </label>
  )
}
