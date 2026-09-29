import { Fragment, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Subject } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { getProgress, subjectStats } from '../lib/progress'
import { formatWeekRange, weekRange } from '../lib/semester'
import { cn } from '../lib/cn'
import { ProgressCell } from './ProgressCell'

interface ProgressGridProps {
  selectedWeek: number
  todayWeek: number
  onSelectWeek: (week: number) => void
  onOpenSubject: (subject: Subject) => void
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Subject x category rows by week columns: the digital version of the paper tracker. */
export function ProgressGrid({ selectedWeek, todayWeek, onSelectWeek, onOpenSubject }: ProgressGridProps) {
  const { subjects, settings, setProgress } = usePlanner()
  const { semesterStartDate, weekCount } = settings
  const weeks = Array.from({ length: weekCount }, (_, i) => i + 1)
  const tableRef = useRef<HTMLTableElement>(null)
  const [focus, setFocus] = useState({ row: 0, col: selectedWeek - 1 })

  const rows = subjects.flatMap((s) => s.categories.map((c) => ({ subject: s, category: c })))
  const rowCount = rows.length
  const activeRow = Math.min(focus.row, Math.max(0, rowCount - 1))

  const moveFocus = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rowCount - 1, row))
    const c = Math.max(0, Math.min(weekCount - 1, col))
    setFocus({ row: r, col: c })
    tableRef.current?.querySelector<HTMLElement>(`[data-row="${r}"][data-col="${c}"]`)?.focus()
  }

  const onCellKeyDown = (row: number, col: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
      Home: [row, 0],
      End: [row, weekCount - 1],
    }
    const target = moves[e.key]
    if (!target) return
    e.preventDefault()
    moveFocus(...target)
  }

  let rowIndex = -1

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-zinc-200 bg-white shadow-xs">
      <table
        ref={tableRef}
        role="grid"
        aria-label="Weekly progress"
        className="w-full border-separate border-spacing-0"
        onFocus={(e) => {
          const { row, col } = (e.target as HTMLElement).dataset
          if (row !== undefined && col !== undefined) setFocus({ row: Number(row), col: Number(col) })
        }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-40 border-b border-zinc-200 bg-white px-4 py-3 text-left text-xs font-medium text-zinc-400"
            >
              Subject
            </th>
            {weeks.map((w) => {
              const { start } = weekRange(semesterStartDate, w)
              const active = w === selectedWeek
              return (
                <th
                  key={w}
                  scope="col"
                  className={cn(
                    'border-b border-zinc-200 px-0.5 py-2 transition-colors duration-150 ease-out',
                    active && 'bg-zinc-100',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectWeek(w)}
                    title={formatWeekRange(semesterStartDate, w)}
                    aria-label={`Select week ${w}, ${formatWeekRange(semesterStartDate, w)}`}
                    className={cn(
                      'tabular flex w-10 flex-col items-center rounded-lg py-1 transition-colors duration-150 ease-out',
                      active ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-700',
                    )}
                  >
                    <span className="flex items-center gap-1 text-xs font-semibold">
                      W{w}
                      {w === todayWeek && <span aria-hidden="true" className="size-1.5 rounded-full bg-zinc-900" />}
                    </span>
                    <span className="text-[10px] font-normal">
                      {pad(start.getDate())}.{pad(start.getMonth() + 1)}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, si) => {
            const stats = subjectStats(subject, Math.max(1, todayWeek))
            return (
              <Fragment key={subject.id}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={1}
                    className={cn(
                      'sticky left-0 z-10 bg-white px-2 pt-3 pb-1 text-left',
                      si > 0 && 'border-t border-zinc-200',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenSubject(subject)}
                      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors duration-150 ease-out hover:bg-zinc-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-zinc-900">{subject.name}</span>
                        <span className="tabular block text-[11px] text-zinc-400">
                          {Math.round(stats.ratio * 100)}% to date
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-zinc-300 transition-colors duration-150 ease-out group-hover:text-zinc-600" />
                    </button>
                  </th>
                  {weeks.map((w) => (
                    <td
                      key={w}
                      aria-hidden="true"
                      className={cn(si > 0 && 'border-t border-zinc-200', w === selectedWeek && 'bg-zinc-100')}
                    />
                  ))}
                </tr>
                {subject.categories.map((category, ci) => {
                  rowIndex++
                  const r = rowIndex
                  const last = ci === subject.categories.length - 1
                  return (
                    <tr key={category}>
                      <th
                        scope="row"
                        className={cn(
                          'sticky left-0 z-10 bg-white px-4 text-left text-sm font-normal text-zinc-500',
                          last ? 'pt-0.5 pb-3' : 'py-0.5',
                        )}
                      >
                        {category}
                      </th>
                      {weeks.map((w) => {
                        const c = w - 1
                        return (
                          <td
                            key={w}
                            className={cn(
                              'px-0.5 text-center transition-colors duration-150 ease-out',
                              last ? 'pt-0.5 pb-3' : 'py-0.5',
                              w === selectedWeek && 'bg-zinc-100',
                            )}
                          >
                            <div className="flex justify-center">
                              <ProgressCell
                                state={getProgress(subject, w, category)}
                                onChange={(next) => setProgress(subject.id, w, category, next)}
                                context={`${subject.name}, ${category}, week ${w}`}
                                highlighted={w === selectedWeek}
                                tabIndex={r === activeRow && c === focus.col ? 0 : -1}
                                onKeyDown={onCellKeyDown(r, c)}
                                dataAttrs={{ 'data-row': r, 'data-col': c }}
                              />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
