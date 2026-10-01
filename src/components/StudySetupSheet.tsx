import { useId, useState } from 'react'
import { Check, Play } from 'lucide-react'
import { usePlanner } from '../hooks/usePlannerStore'
import { formatWeekRange } from '../lib/semester'
import { isTracked, occursInWeek } from '../lib/subjects'
import { getProgress } from '../lib/progress'
import { cn } from '../lib/cn'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { inputClass } from './ui/Field'

interface StudySetupSheetProps {
  open: boolean
  defaultWeek: number
  onClose: () => void
}

export function StudySetupSheet({ open, defaultWeek, onClose }: StudySetupSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Start recording" subtitle="Pick a course, a week and optional to-dos">
      {open && <SetupBody defaultWeek={defaultWeek} onDone={onClose} />}
    </Sheet>
  )
}

function SetupBody({ defaultWeek, onDone }: { defaultWeek: number; onDone: () => void }) {
  const { subjects, settings, startStudy } = usePlanner()
  const [week, setWeek] = useState(defaultWeek)
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const weekId = useId()

  const eligible = subjects.filter((s) => isTracked(s) && occursInWeek(s, week))
  const subject = eligible.find((s) => s.id === subjectId) ?? null

  const changeWeek = (next: number) => {
    setWeek(next)
    const stillThere = subjects.find((s) => s.id === subjectId && isTracked(s) && occursInWeek(s, next))
    if (!stillThere) {
      setSubjectId(null)
      setCategories([])
    }
  }

  const chooseSubject = (id: string) => {
    if (id === subjectId) return
    setSubjectId(id)
    setCategories([])
  }

  const toggleCategory = (category: string) =>
    setCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]))

  const start = () => {
    if (!subject) return
    startStudy(subject.id, week, subject.categories.filter((c) => categories.includes(c)))
    onDone()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={weekId} className="text-xs font-medium text-zinc-500">
          Week
        </label>
        <select
          id={weekId}
          value={week}
          onChange={(e) => changeWeek(Number(e.target.value))}
          className={inputClass}
        >
          {Array.from({ length: settings.weekCount }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w} · {formatWeekRange(settings.semesterStartDate, w)}
              {w === defaultWeek ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-zinc-500">
          Course
        </legend>
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

      {subject && subject.categories.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-zinc-500">
            To-dos (optional) · time is split evenly across the ones you pick
          </legend>
          {subject.categories.map((category) => {
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

      <Button variant="primary" icon={<Play className="size-4" />} disabled={!subject} onClick={start}>
        Start recording
      </Button>
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
