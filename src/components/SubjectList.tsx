import { ChevronRight, Plus } from 'lucide-react'
import type { Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { subjectStats, weekStats } from '../lib/progress'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'

interface SubjectListProps {
  todayWeek: number
  onOpen: (subject: Subject) => void
  onAdd: () => void
}

export function SubjectList({ todayWeek, onOpen, onAdd }: SubjectListProps) {
  const { subjects, settings } = usePlanner()

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {subjects.map((subject) => {
          const stats = subjectStats(subject, Math.max(1, todayWeek))
          return (
            <li key={subject.id}>
              <button
                type="button"
                onClick={() => onOpen(subject)}
                className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-xs transition-colors duration-150 ease-out hover:border-zinc-300"
              >
                <div className="flex w-full items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-zinc-900">{subject.name}</div>
                    <div className="truncate text-sm text-zinc-500">
                      {subject.lecturer || 'No lecturer set'} · {subject.scheduleSlots.length} slot
                      {subject.scheduleSlots.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span className="tabular text-sm font-semibold text-zinc-900">{Math.round(stats.ratio * 100)}%</span>
                  <ChevronRight className="size-4 text-zinc-300" aria-hidden="true" />
                </div>
                <div className="flex w-full gap-1" aria-hidden="true">
                  {Array.from({ length: settings.weekCount }, (_, i) => {
                    const w = weekStats(subject, i + 1)
                    const done = w.total - w.canceled > 0 && w.completed >= w.total - w.canceled
                    const partial = w.completed > 0 && !done
                    return (
                      <span
                        key={i}
                        className={cn(
                          'h-1.5 flex-1 rounded-full',
                          done ? 'bg-zinc-900' : partial ? 'bg-zinc-400' : 'bg-zinc-200',
                          i + 1 === todayWeek && 'ring-2 ring-zinc-900/15 ring-offset-1',
                        )}
                      />
                    )
                  })}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      <Button variant="secondary" icon={<Plus className="size-4" />} onClick={onAdd} className="w-full">
        Add subject
      </Button>
    </div>
  )
}
