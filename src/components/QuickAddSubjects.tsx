import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Check, CornerDownLeft, Plus, SlidersHorizontal, X } from 'lucide-react'
import { usePlanner } from '../hooks/usePlannerStore'
import { createId } from '../lib/id'
import { createSubject } from '../lib/subjects'
import { cn } from '../lib/cn'
import { inputClass } from './ui/Field'
import { Button } from './ui/Button'

interface Staged {
  id: string
  name: string
  lecturer: string
}

interface QuickAddSubjectsProps {
  /** start collapsed behind an "Add subjects" button */
  collapsible?: boolean
  onOpenDetailed: () => void
  className?: string
}

/** "Informatik, Prof. Muster" -> { name, lecturer } */
function parseEntry(raw: string): Omit<Staged, 'id'> | null {
  const [name, ...rest] = raw.split(',')
  const trimmed = name.trim()
  if (!trimmed) return null
  return { name: trimmed, lecturer: rest.join(',').trim() }
}

export function QuickAddSubjects({ collapsible, onOpenDetailed, className }: QuickAddSubjectsProps) {
  const { subjects, addSubjects } = usePlanner()
  const [open, setOpen] = useState(!collapsible)
  const [draft, setDraft] = useState('')
  const [staged, setStaged] = useState<Staged[]>([])
  const [added, setAdded] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  useEffect(() => {
    if (added === null) return
    const t = window.setTimeout(() => setAdded(null), 2500)
    return () => window.clearTimeout(t)
  }, [added])

  const existing = new Set(subjects.map((s) => s.name.toLowerCase()))
  const isDuplicate = (entry: Staged, index: number) =>
    existing.has(entry.name.toLowerCase()) ||
    staged.findIndex((s) => s.name.toLowerCase() === entry.name.toLowerCase()) !== index
  const creatable = staged.filter((s, i) => !isDuplicate(s, i))

  const stage = (lines: string[]) => {
    const entries = lines.map(parseEntry).filter((e) => e !== null)
    if (!entries.length) return
    setStaged((prev) => [...prev, ...entries.map((e) => ({ ...e, id: createId() }))])
    setDraft('')
  }

  const draftEntry = parseEntry(draft)
  const createCount = creatable.length + (draftEntry ? 1 : 0)

  const create = () => {
    const pending = draftEntry ? [...staged, { ...draftEntry, id: createId() }] : staged
    const seen = new Set(existing)
    const toCreate = pending.filter((s) => {
      const key = s.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (!toCreate.length) return
    addSubjects(toCreate.map((s) => createSubject(s.name, s.lecturer)))
    setAdded(toCreate.length)
    setStaged([])
    setDraft('')
    if (collapsible) setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.metaKey || e.ctrlKey || (!draftEntry && staged.length)) create()
      else stage([draft])
    } else if (e.key === 'Backspace' && !draft && staged.length) {
      setStaged((prev) => prev.slice(0, -1))
    } else if (e.key === 'Escape' && collapsible && !draft && !staged.length) {
      setOpen(false)
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/\r?\n/.test(text)) return
    e.preventDefault()
    stage(text.split(/\r?\n/))
  }

  if (!open) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-zinc-300 bg-white/50 text-sm font-medium text-zinc-600 transition-colors duration-150 ease-out hover:border-zinc-400 hover:bg-white hover:text-zinc-900"
        >
          <Plus className="size-4" />
          Add subjects
        </button>
        {added !== null && <AddedNotice count={added} />}
      </div>
    )
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className={cn('animate-fade-in rounded-3xl border border-zinc-200 bg-white p-4 shadow-xs', className)}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id={`${inputId}-title`} className="text-sm font-semibold text-zinc-900">
            Add subjects
          </h2>
          <p className="text-xs text-zinc-500">
            One per line. Add a lecturer after a comma. Paste a list to add many at once.
          </p>
        </div>
        {collapsible && (
          <button
            type="button"
            aria-label="Close quick add"
            onClick={() => {
              setOpen(false)
              setStaged([])
              setDraft('')
            }}
            className="-mt-1 -mr-1 flex size-9 items-center justify-center rounded-xl text-zinc-400 transition-colors duration-150 ease-out hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {staged.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5" aria-label="Subjects to create">
          {staged.map((s, i) => {
            const dup = isDuplicate(s, i)
            return (
              <li
                key={s.id}
                className={cn(
                  'animate-fade-in flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-1.5',
                  dup ? 'border-dashed border-zinc-300 bg-zinc-50' : 'border-zinc-200 bg-zinc-50/60',
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200 tabular">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm font-medium', dup ? 'text-zinc-400 line-through' : 'text-zinc-900')}>
                    {s.name}
                  </span>
                  {(s.lecturer || dup) && (
                    <span className="block truncate text-xs text-zinc-500">
                      {dup ? 'Already exists, will be skipped' : s.lecturer}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => setStaged((prev) => prev.filter((x) => x.id !== s.id))}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors duration-150 ease-out hover:bg-white hover:text-zinc-900"
                >
                  <X className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Subject name
        </label>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={staged.length ? 'Another subject…' : 'e.g. Informatik, Prof. Muster'}
            autoComplete="off"
            enterKeyHint="enter"
            className={cn(inputClass, 'pr-10')}
          />
          <CornerDownLeft
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 transition-colors duration-150 ease-out',
              draft.trim() ? 'text-zinc-500' : 'text-zinc-200',
            )}
          />
        </div>
        <Button
          aria-label="Queue subject"
          onClick={() => {
            stage([draft])
            inputRef.current?.focus()
          }}
          disabled={!draft.trim()}
          className="w-11 px-0"
          icon={<Plus className="size-4" />}
        />
      </div>

      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={onOpenDetailed}>
          Add with schedule & links
        </Button>
        <Button
          variant="primary"
          onClick={create}
          disabled={createCount === 0}
          icon={<Check className="size-4" />}
        >
          {createCount > 1 ? `Create ${createCount} subjects` : 'Create subject'}
        </Button>
      </div>

      {added !== null && <AddedNotice count={added} className="mt-3" />}
    </section>
  )
}

function AddedNotice({ count, className }: { count: number; className?: string }) {
  return (
    <p role="status" className={cn('animate-fade-in flex items-center justify-center gap-1.5 text-xs text-zinc-500', className)}>
      <Check className="size-3.5 text-zinc-900" strokeWidth={3} />
      Added {count} subject{count === 1 ? '' : 's'}. Tap one to add rooms and times.
    </p>
  )
}
