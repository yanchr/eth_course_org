import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRight, History, Pause, Pencil, Play, Square, Timer } from 'lucide-react'
import type { StudySession } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { useNow } from '../hooks/useNow'
import {
  activeElapsedMs,
  combineDateTime,
  formatClock,
  formatDuration,
  formatSessionSpan,
  studyStats,
  timeSpan,
  toTimeInput,
  type WeekTime,
} from '../lib/study'
import { toISODate } from '../lib/semester'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'
import { inputClass } from './ui/Field'
import { StudySessionSheet, type SessionSheetTarget } from './StudySessionSheet'

interface StudyViewProps {
  defaultWeek: number
}

export function StudyView({ defaultWeek }: StudyViewProps) {
  const { subjects, data, pauseStudy, resumeStudy, stopStudy } = usePlanner()
  const { activeStudy, studySessions } = data
  const [sheet, setSheet] = useState<SessionSheetTarget | null>(null)
  const stats = useMemo(() => studyStats(studySessions), [studySessions])
  const recent = useMemo(
    () => [...studySessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [studySessions],
  )

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? 'Removed course'

  return (
    <div className="flex flex-col gap-4">
      {activeStudy ? (
        <ActiveCard
          subjectName={subjectName(activeStudy.subjectId)}
          onPause={pauseStudy}
          onResume={resumeStudy}
          onStop={stopStudy}
        />
      ) : (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-xs">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
            <Timer className="size-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900">Record study time</h2>
            <p className="text-sm text-zinc-500">Track time for a course, optionally split across its to-dos.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon={<Play className="size-4" />} onClick={() => setSheet({ kind: 'record' })}>
              Record
            </Button>
            <Button icon={<History className="size-4" />} onClick={() => setSheet({ kind: 'log' })}>
              Add past session
            </Button>
          </div>
        </section>
      )}

      {studySessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
          No study time recorded yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Total" value={formatDuration(stats.totalMs)} />
            <Metric label="Avg / week" value={formatDuration(stats.avgPerWeekMs)} />
            <Metric label="Avg / task" value={stats.tasks.length ? formatDuration(stats.avgPerTaskMs) : '–'} />
          </div>

          {recent[0] && (
            <Panel title="Last session">
              <LastSession
                key={recent[0].id}
                session={recent[0]}
                subjectName={subjectName(recent[0].subjectId)}
                onEdit={() => setSheet({ kind: 'edit', session: recent[0] })}
              />
            </Panel>
          )}

          <Panel title="Per week" meta={`${formatDuration(stats.avgPerWeekMs)} avg`}>
            <WeekBars weeks={stats.weeks} />
          </Panel>

          <Panel title="Per subject">
            <ul className="divide-y divide-zinc-100">
              {stats.subjects.map((s) => (
                <li key={s.subjectId} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                      {subjectName(s.subjectId)}
                    </span>
                    <span className="tabular text-sm font-semibold text-zinc-900">{formatDuration(s.totalMs)}</span>
                  </div>
                  <p className="tabular text-xs text-zinc-500">
                    {formatDuration(s.avgPerWeekMs)} avg / week · {s.weeks.length} week{s.weeks.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.weeks.map((w) => (
                      <span key={w.week} className="tabular rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        W{w.week} · {formatDuration(w.ms)}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Per task"
            meta={stats.tasks.length ? `${formatDuration(stats.avgPerTaskMs)} avg` : undefined}
          >
            {stats.tasks.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">
                Pick to-dos when recording to see time per task.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {stats.tasks.map((t) => (
                  <li key={`${t.subjectId}-${t.week}-${t.category}`} className="flex items-baseline gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900">{t.category}</div>
                      <div className="truncate text-xs text-zinc-500">
                        {subjectName(t.subjectId)} · week {t.week}
                      </div>
                    </div>
                    <span className="tabular text-sm font-semibold text-zinc-900">{formatDuration(t.ms)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Sessions" meta="Tap to change times">
            <ul className="divide-y divide-zinc-100">
              {recent.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: 'edit', session: s })}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-zinc-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900">
                        {subjectName(s.subjectId)}
                        <span className="font-normal text-zinc-400">
                          {' '}
                          · W{s.week}
                          {s.categories.length > 0 ? ` · ${s.categories.join(', ')}` : ''}
                        </span>
                      </div>
                      <div className="tabular truncate text-xs text-zinc-500">
                        {formatSessionSpan(s.startedAt, s.endedAt)}
                      </div>
                    </div>
                    <span className="tabular text-sm font-semibold text-zinc-900">{formatDuration(s.durationMs)}</span>
                    <ChevronRight className="size-4 text-zinc-300" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <StudySessionSheet target={sheet} defaultWeek={defaultWeek} onClose={() => setSheet(null)} />
    </div>
  )
}

interface ActiveCardProps {
  subjectName: string
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

function ActiveCard({ subjectName, onPause, onResume, onStop }: ActiveCardProps) {
  const { data, setStudyStart } = usePlanner()
  const active = data.activeStudy
  const running = active?.resumedAt != null
  const now = useNow(running)
  const startId = useId()
  if (!active) return null

  const started = new Date(active.startedAt)
  const changeStart = (value: string) => {
    const next = combineDateTime(toISODate(started), value)
    if (!next) return
    if (next.getTime() > Date.now()) next.setDate(next.getDate() - 1)
    setStudyStart(next.getTime())
  }

  return (
    <section
      aria-label="Current recording"
      className="flex flex-col items-center gap-4 rounded-3xl border border-zinc-200 bg-white px-6 py-8 text-center shadow-xs"
    >
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          running ? 'bg-red-500/10 text-red-700' : 'bg-zinc-100 text-zinc-600',
        )}
      >
        {running ? 'Recording' : 'Paused'}
      </span>
      <p className="tabular text-5xl font-semibold tracking-tight text-zinc-900" aria-live="off">
        {formatClock(activeElapsedMs(active, now))}
      </p>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-zinc-900">{subjectName}</p>
        <p className="text-sm text-zinc-500">
          Week {active.week}
          {active.categories.length > 0 ? ` · ${active.categories.join(', ')}` : ' · course only'}
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <label htmlFor={startId}>Started at</label>
        <input
          id={startId}
          type="time"
          value={toTimeInput(started)}
          onChange={(e) => changeStart(e.target.value)}
          className={cn(inputClass, 'tabular w-auto')}
        />
      </div>
      <div className="flex gap-2">
        {running ? (
          <Button icon={<Pause className="size-4" />} onClick={onPause}>
            Pause
          </Button>
        ) : (
          <Button icon={<Play className="size-4" />} onClick={onResume}>
            Resume
          </Button>
        )}
        <Button variant="primary" icon={<Square className="size-4" />} onClick={onStop}>
          Stop
        </Button>
      </div>
    </section>
  )
}

interface LastSessionProps {
  session: StudySession
  subjectName: string
  onEdit: () => void
}

/** Start and end are typed in place and saved as soon as both form a valid span. */
function LastSession({ session, subjectName, onEdit }: LastSessionProps) {
  const { updateStudySession } = usePlanner()
  const start = new Date(session.startedAt)
  const saved = { from: toTimeInput(start), to: toTimeInput(new Date(session.endedAt)) }
  // Holds half-typed values while a field is focused; otherwise the saved times show.
  const [draft, setDraft] = useState<typeof saved | null>(null)
  const shown = draft ?? saved
  const fromId = useId()
  const toId = useId()

  const span = timeSpan(toISODate(start), shown.from, shown.to)
  const spanMs = span ? span.end.getTime() - span.start.getTime() : 0
  const valid = span !== null && spanMs > 0 && spanMs < 24 * 60 * 60 * 1000
  const changed = shown.from !== saved.from || shown.to !== saved.to

  const change = (field: 'from' | 'to', value: string) => {
    const next = { ...shown, [field]: value }
    setDraft(next)
    const nextSpan = timeSpan(toISODate(start), next.from, next.to)
    if (!nextSpan) return
    const ms = nextSpan.end.getTime() - nextSpan.start.getTime()
    if (ms <= 0 || ms >= 24 * 60 * 60 * 1000) return
    if (next.from === saved.from && next.to === saved.to) return
    updateStudySession({
      ...session,
      durationMs: ms,
      startedAt: nextSpan.start.toISOString(),
      endedAt: nextSpan.end.toISOString(),
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-900">
            {subjectName}
            <span className="font-normal text-zinc-400">
              {' '}
              · W{session.week}
              {session.categories.length > 0 ? ` · ${session.categories.join(', ')}` : ''}
            </span>
          </div>
          <div className="text-xs text-zinc-500">
            {formatSessionSpan(session.startedAt, session.endedAt).split(' · ')[0]}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={onEdit} className="h-11 lg:h-9">
          Edit
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={fromId} className="text-xs font-medium text-zinc-500">
            From
          </label>
          <input
            id={fromId}
            type="time"
            value={shown.from}
            onChange={(e) => change('from', e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={onKeyDown}
            className={cn(inputClass, 'tabular')}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={toId} className="text-xs font-medium text-zinc-500">
            To
          </label>
          <input
            id={toId}
            type="time"
            value={shown.to}
            onChange={(e) => change('to', e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={onKeyDown}
            className={cn(inputClass, 'tabular')}
          />
        </div>
        <span
          className={cn(
            'tabular flex h-11 w-16 shrink-0 items-center justify-end text-sm font-semibold',
            changed && !valid ? 'text-red-600' : 'text-zinc-900',
          )}
        >
          {formatDuration(changed ? spanMs : session.durationMs)}
        </span>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 shadow-xs">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="tabular mt-0.5 truncate text-lg font-semibold tracking-tight text-zinc-900">{value}</div>
    </div>
  )
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {meta && <span className="tabular truncate text-xs text-zinc-400">{meta}</span>}
      </div>
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xs">{children}</div>
    </section>
  )
}

function WeekBars({ weeks }: { weeks: WeekTime[] }) {
  const max = Math.max(...weeks.map((w) => w.ms), 1)
  return (
    <ul className="flex flex-col gap-2 px-4 py-3">
      {weeks.map((w) => (
        <li key={w.week} className="flex items-center gap-3 text-sm">
          <span className="tabular w-10 shrink-0 text-zinc-500">W{w.week}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
            <span className="block h-full rounded-full bg-zinc-900" style={{ width: `${(w.ms / max) * 100}%` }} />
          </span>
          <span className="tabular w-16 shrink-0 text-right font-medium text-zinc-900">{formatDuration(w.ms)}</span>
        </li>
      ))}
    </ul>
  )
}
