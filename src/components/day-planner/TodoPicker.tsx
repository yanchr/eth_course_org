import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { BlockAnchor, PlannedTodoItem, Subject } from '../../types'
import { categoriesInWeek, isTracked } from '../../lib/subjects'
import { combinedTodoStats, sdMultiplierLabel, todoLabel, todoTargetMinutes } from '../../lib/dayPlannerMath'
import { createId } from '../../lib/id'
import { Button } from '../ui/Button'
import { Pill } from '../ui/Pill'
import { IconButton } from '../ui/IconButton'
import { inputClass } from '../ui/Field'
import type { StudySession } from '../../types'
import { BlockAnchorEditor, type AnchorTarget } from './BlockAnchorEditor'

interface TodoPickerProps {
  subjects: Subject[]
  weekCount: number
  defaultWeek: number
  sessions: StudySession[]
  todoQueue: PlannedTodoItem[]
  activityTargets: AnchorTarget[]
  onChange: (queue: PlannedTodoItem[]) => void
}

export function TodoPicker({
  subjects,
  weekCount,
  defaultWeek,
  sessions,
  todoQueue,
  activityTargets,
  onChange,
}: TodoPickerProps) {
  const tracked = useMemo(() => subjects.filter(isTracked), [subjects])
  const [subjectId, setSubjectId] = useState(tracked[0]?.id ?? '')
  const [week, setWeek] = useState(defaultWeek)
  const [picked, setPicked] = useState<string[]>([])
  const [sdMultiplier, setSdMultiplier] = useState(1)
  const [anchor, setAnchor] = useState<BlockAnchor>({ type: 'flow' })

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
      sdMultiplier: Number.isFinite(sdMultiplier) ? sdMultiplier : 1,
      anchor,
    }
    onChange([...todoQueue, item])
    setPicked([])
    setSdMultiplier(1)
    setAnchor({ type: 'flow' })
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
  const todoTargets: AnchorTarget[] = todoQueue.map((item) => ({
    id: item.id,
    label: `${subjects.find((subject) => subject.id === item.subjectId)?.name ?? 'Subject'} · ${todoLabel(item.categories)}`,
  }))
  const allTargets = [...activityTargets, ...todoTargets]
  const totalTodos = todoQueue.reduce((sum, item) => sum + item.categories.length, 0)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Course todos</h2>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
          {totalTodos} {totalTodos === 1 ? 'todo' : 'todos'}
        </span>
      </div>

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

      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          SD multiplier
          <input
            className={inputClass}
            type="number"
            min={0}
            step="0.1"
            value={sdMultiplier}
            onChange={(event) => setSdMultiplier(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Anchor
          <BlockAnchorEditor value={anchor} targets={allTargets} onChange={setAnchor} compact />
        </label>
      </div>

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
                    {' · '}{sdMultiplierLabel(item.sdMultiplier)}
                  </p>
                  <div className="mt-2 grid grid-cols-[6rem_1fr] gap-1.5">
                    <input
                      aria-label="SD multiplier"
                      className={inputClass}
                      type="number"
                      min={0}
                      step="0.1"
                      value={item.sdMultiplier}
                      onChange={(event) => {
                        const value = Math.max(0, Number(event.target.value) || 0)
                        onChange(todoQueue.map((todo) => todo.id === item.id ? { ...todo, sdMultiplier: value } : todo))
                      }}
                    />
                    <BlockAnchorEditor
                      compact
                      value={item.anchor}
                      targets={allTargets.filter((target) => target.id !== item.id)}
                      onChange={(nextAnchor) =>
                        onChange(todoQueue.map((todo) => todo.id === item.id ? { ...todo, anchor: nextAnchor } : todo))
                      }
                    />
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
                                sdMultiplier: todo.sdMultiplier,
                                anchor: todo.anchor,
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
