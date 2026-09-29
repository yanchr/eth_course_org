import { useRef, useState, type ChangeEvent } from 'react'
import { Download, RotateCcw, Upload } from 'lucide-react'
import type { PlannerData } from '../types'
import { usePlanner } from '../hooks/usePlannerStore'
import { exportData, readImportFile } from '../lib/backup'
import { formatWeekRange, parseISODate } from '../lib/semester'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field } from './ui/Field'

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Settings" subtitle="Semester and data">
      {open && <SettingsBody onDone={onClose} />}
    </Sheet>
  )
}

function SettingsBody({ onDone }: { onDone: () => void }) {
  const { data, settings, updateSettings, replaceData, resetData } = usePlanner()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PlannerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const start = parseISODate(settings.semesterStartDate)
  const isMonday = start.getDay() === 1

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      setPending(await readImportFile(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-900">Semester</h3>
        <Field
          label="Semester start (Monday of week 1)"
          type="date"
          value={settings.semesterStartDate}
          onChange={(e) => e.target.value && updateSettings({ semesterStartDate: e.target.value })}
          hint={
            isMonday ? (
              <>
                Week 1: {formatWeekRange(settings.semesterStartDate, 1)} · Week {settings.weekCount}:{' '}
                {formatWeekRange(settings.semesterStartDate, settings.weekCount)}
              </>
            ) : (
              <span className="text-amber-700">This date isn't a Monday; weeks will start on this weekday.</span>
            )
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Data</h3>
          <p className="text-xs text-zinc-500">
            Everything is stored on this device only. Export regularly to keep a backup.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" icon={<Download className="size-4" />} onClick={() => exportData(data)}>
            Export Data (JSON)
          </Button>
          <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
            Import Data (JSON)
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFile}
        />

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {pending && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-zinc-300 bg-zinc-50 p-4">
            <p className="text-sm text-zinc-700">
              Replace your current {data.subjects.length} subject{data.subjects.length === 1 ? '' : 's'} with{' '}
              <strong className="font-semibold text-zinc-900">
                {pending.subjects.length} imported subject{pending.subjects.length === 1 ? '' : 's'}
              </strong>
              ? This can't be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  replaceData(pending)
                  setPending(null)
                  onDone()
                }}
              >
                Replace data
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-100 pt-6">
        <h3 className="text-sm font-semibold text-zinc-900">Danger zone</h3>
        {confirmReset ? (
          <div className="flex gap-2">
            <Button
              variant="danger"
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                resetData()
                setConfirmReset(false)
                onDone()
              }}
            >
              Erase all data
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            icon={<RotateCcw className="size-4" />}
            onClick={() => setConfirmReset(true)}
            className="self-start"
          >
            Reset planner
          </Button>
        )}
      </section>
    </div>
  )
}
