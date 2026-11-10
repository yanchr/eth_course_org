import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { PlannedTodoItem, Subject } from '../../types'
import { categoriesInWeek, isTracked } from '../../lib/subjects'
import { combinedTodoStats, todoLabel, todoTargetMinutes } from '../../lib/dayPlannerMath'
import { createId } from '../../lib/id'
import { Button } from '../ui/Button'
import { Pill } from '../ui/Pill'
import { IconButton } from '../ui/IconButton'
import { inputClass } from '../ui/Field'
import type { StudySession } from '../../types'

interface TodoPickerProps {
  subjects: Subject[]
  weekCount: number
  defaultWeek: number
  sessions: StudySession[]
  todoQueue: PlannedTodoItem[]
  onChange: (queue: PlannedTodoItem[]) => void
}

export function TodoPicker({
  subjects,
  weekCount,
  defaultWeek,
  sessions,
  todoQueue,
  onChange,
}: TodoPickerProps) {
  const tracked = useMemo(() => subjects.filter(isTracked), [subjects])
  const [subjectId, setSubjectId] = useState(tracked[0]?.id ?? '')
  const [week, setWeek] = useState(defaultWeek)
  const [picked, setPicked] = useState<string[]>([])

  const subject = tracked.find((s) => s.id === subjectId) ?? tracked[0] ?? null
  const cats = subject ? categoriesInWeek(subject, week) : []

  const toggleCat = (c: string) => {
    setPicked((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const add = () => {
    if (!subject || picked.length === 0) return
    const item: PlannedTodoItem = {
      id: createId(),
      subjectId: subject.id,
      week,
      categories: [...picked],
      includeSdBuffer: true,
    }
    onChange([...todoQueue, item])
    setPicked([])
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...todoQueue]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    onChange(next)
  }

  const estimate = subject && picked.length > 0
    ? combinedTodoStats(sessions, subject.id, picked)
    : null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-900">Course todos</h2>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <label className="text-xs font-medium text-zinc-500" htmlFor="plan-subject">
            Subject
          </label>
          <select
            id="plan-subject"
            className={inputClass}
            value={subject?.id ?? ''}
            onChange={(e) => {
              setSubjectId(e.target.value)
              setPicked([])
            }}
          >
            {tracked.length === 0 && <option value="">No subjects</option>}
            {tracked.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <label className="text-xs font-medium text-zinc-500" htmlFor="plan-week">
            Week
          </label>
          <select
            id="plan-week"
            className={inputClass}
            value={week}
            onChange={(e) => {
              setWeek(Number(e.target.value))
              setPicked([])
            }}
          >
            {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <Pill key={c} active={picked.includes(c)} className="h-11" onClick={() => toggleCat(c)}>
              {c}
            </Pill>
          ))}
        </div>
      )}

      {estimate && (
        <p className="text-xs text-zinc-500">
          Est. {Math.round(estimate.mean)}m
          {estimate.sd > 0 ? ` ± ${Math.round(estimate.sd)}m SD` : ''}
          {estimate.n === 0 ? ' (baseline)' : estimate.n === 1 ? ' (1 week)' : ` (${estimate.n} weeks)`}
        </p>
      )}

      <Button
        variant="primary"
        icon={<Plus className="size-4" />}
        disabled={!subject || picked.length === 0}
        onClick={add}
      >
        Add todo{picked.length > 1 ? ` (${picked.join(' ^ ')})` : ''}
      </Button>

      {todoQueue.length > 0 && (
        <ul className="flex flex-col gap-2">
          {todoQueue.map((item, index) => {
            const name = subjects.find((s) => s.id === item.subjectId)?.name ?? 'Subject'
            const minutes = todoTargetMinutes(item, sessions)
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-2 py-1.5"
              >
                <div className="flex flex-col">
                  <IconButton
                    label="Move up"
                    className="size-8"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    className="size-8"
                    disabled={index === todoQueue.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </IconButton>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {name} · {todoLabel(item.categories)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    W{item.week} · {minutes}m
                    {item.customDurationMinutes != null ? ' · custom' : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="inline-flex h-11 items-center rounded-lg px-2 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                      onClick={() =>
                        onChange(
                          todoQueue.map((todo) =>
                            todo.id === item.id ? { ...todo, includeSdBuffer: !todo.includeSdBuffer } : todo,
                          ),
                        )
                      }
                    >
                      {item.includeSdBuffer ? 'Avg + SD' : 'Avg only'}
                    </button>
                    {item.customDurationMinutes != null && (
                      <button
                        type="button"
                        className="inline-flex h-11 items-center rounded-lg px-2 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                        onClick={() =>
                          onChange(
                            todoQueue.map((todo) => {
                              if (todo.id !== item.id) return todo
                              return {
                                id: todo.id,
                                subjectId: todo.subjectId,
                                week: todo.week,
                                categories: todo.categories,
                                includeSdBuffer: todo.includeSdBuffer,
                              }
                            }),
                          )
                        }
                      >
                        Reset duration
                      </button>
                    )}
                  </div>
                </div>
                <IconButton
                  label="Remove"
                  onClick={() => onChange(todoQueue.filter((t) => t.id !== item.id))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
