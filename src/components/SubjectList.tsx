import { ChevronRight, Plus } from 'lucide-react'
import type { Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { subjectStats, weekStats } from '../lib/progress'
import { isCalendar, isOnce } from '../lib/subjects'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'

interface SubjectListProps {
  todayWeek: number
  onOpen: (subject: Subject) => void
  onAdd: () => void
  onAddEvent: () => void
  onAddCalendar: () => void
}

export function SubjectList({ todayWeek, onOpen, onAdd, onAddEvent, onAddCalendar }: SubjectListProps) {
  const { subjects, settings } = usePlanner()

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {subjects.map((subject) => {
          const stats = subjectStats(subject, Math.max(1, todayWeek))
          const calendar = isCalendar(subject)
          return (
            <li key={subject.id}>
              <button
                type="button"
                onClick={() => onOpen(subject)}
                className={cn(
                  'flex w-full flex-col gap-3 rounded-2xl border p-4 text-left shadow-xs transition-colors duration-150 ease-out',
                  calendar
                    ? 'border-calendar-edge bg-calendar hover:border-calendar-edge'
                    : 'border-zinc-200 bg-white hover:border-zinc-300',
                )}
              >
                <div className="flex w-full items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate font-semibold', calendar ? 'text-calendar-ink' : 'text-zinc-900')}>
                      {subject.name}
                    </div>
                    <div className={cn('truncate text-sm', calendar ? 'text-calendar-ink/70' : 'text-zinc-500')}>
                      {calendar
                        ? isOnce(subject)
                          ? `Calendar · week ${subject.onceWeek}`
                          : 'Calendar · every week'
                        : isOnce(subject)
                          ? `Once · week ${subject.onceWeek}`
                          : `${subject.lecturer || 'No lecturer set'} · ${subject.scheduleSlots.length} slot${
                              subject.scheduleSlots.length === 1 ? '' : 's'
                            }`}
                    </div>
                  </div>
                  {!calendar && (
                    <span className="tabular text-sm font-semibold text-zinc-900">{Math.round(stats.ratio * 100)}%</span>
                  )}
                  <ChevronRight className={cn('size-4', calendar ? 'text-calendar-ink/40' : 'text-zinc-300')} aria-hidden="true" />
                </div>
                {!calendar && (
                <div className="flex w-full gap-1" aria-hidden="true">
                  {Array.from({ length: settings.weekCount }, (_, i) => {
                    const week = i + 1
                    if (subject.onceWeek != null && subject.onceWeek !== week) {
                      return <span key={i} className="h-1.5 flex-1 rounded-full bg-zinc-100" />
                    }
                    const w = weekStats(subject, week)
                    const done = w.total - w.canceled > 0 && w.completed >= w.total - w.canceled
                    const partial = w.completed > 0 && !done
                    return (
                      <span
                        key={i}
                        className={cn(
                          'h-1.5 flex-1 rounded-full',
                          done ? 'bg-zinc-900' : partial ? 'bg-zinc-400' : 'bg-zinc-200',
                          week === todayWeek && 'ring-2 ring-zinc-900/15 ring-offset-1',
                        )}
                      />
                    )
                  })}
                </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={onAdd} className="w-full">
          Add subject
        </Button>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={onAddEvent} className="w-full">
          Add event
        </Button>
        <Button variant="secondary" icon={<Plus className="size-4" />} onClick={onAddCalendar} className="col-span-2 w-full">
          Add calendar item
        </Button>
      </div>
    </div>
  )
}
