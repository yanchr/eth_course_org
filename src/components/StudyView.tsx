import { useMemo, useState, type ReactNode } from 'react'
import { Pause, Play, Square, Timer } from 'lucide-react'
import { usePlanner } from '../hooks/usePlannerStore'
import { useNow } from '../hooks/useNow'
import { activeElapsedMs, formatClock, formatDuration, studyStats, type WeekTime } from '../lib/study'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'
import { StudySetupSheet } from './StudySetupSheet'

interface StudyViewProps {
  defaultWeek: number
}

export function StudyView({ defaultWeek }: StudyViewProps) {
  const { subjects, data, pauseStudy, resumeStudy, stopStudy } = usePlanner()
  const { activeStudy, studySessions } = data
  const [setupOpen, setSetupOpen] = useState(false)
  const stats = useMemo(() => studyStats(studySessions), [studySessions])

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
          <Button variant="primary" icon={<Play className="size-4" />} onClick={() => setSetupOpen(true)}>
            Record
          </Button>
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
        </>
      )}

      <StudySetupSheet open={setupOpen} defaultWeek={defaultWeek} onClose={() => setSetupOpen(false)} />
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
  const { data } = usePlanner()
  const active = data.activeStudy
  const running = active?.resumedAt != null
  const now = useNow(running)
  if (!active) return null

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
