import { useRef, useState, type ChangeEvent } from 'react'
import { GraduationCap, Upload } from 'lucide-react'
import { usePlanner } from '../hooks/usePlannerStore'
import { readImportFile } from '../lib/backup'
import { Button } from './ui/Button'
import { QuickAddSubjects } from './QuickAddSubjects'

interface EmptyStateProps {
  onAdd: () => void
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  const { replaceData } = usePlanner()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      replaceData(await readImportFile(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-xs">
        <GraduationCap className="size-7 text-zinc-800" strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-zinc-900">Add your first subject</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
        Track lectures, exercises and summaries across all 14 weeks. Rooms like{' '}
        <code className="text-zinc-800">HG E 1.1</code> are placed on the campus map automatically.
      </p>
      <QuickAddSubjects onOpenDetailed={onAdd} className="mt-6 w-full text-left" />
      <Button
        variant="ghost"
        size="sm"
        icon={<Upload className="size-4" />}
        onClick={() => fileRef.current?.click()}
        className="mt-3"
      >
        Or import a JSON backup
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
