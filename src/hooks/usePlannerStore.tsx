import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { PlannerData, ProgressState, Settings, Subject } from '../types'
import { STORAGE_KEY, createDefaultData, loadData, saveData } from '../lib/storage'
import { progressKey } from '../lib/progress'

interface PlannerStore {
  data: PlannerData
  settings: Settings
  subjects: Subject[]
  upsertSubject: (subject: Subject) => void
  addSubjects: (subjects: Subject[]) => void
  deleteSubject: (id: string) => void
  setProgress: (subjectId: string, week: number, category: string, state: ProgressState) => void
  updateSettings: (patch: Partial<Settings>) => void
  replaceData: (data: PlannerData) => void
  resetData: () => void
}

const PlannerContext = createContext<PlannerStore | null>(null)

const PERSIST_DELAY_MS = 250

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlannerData>(loadData)
  const latest = useRef(data)
  latest.current = data

  useEffect(() => {
    const handle = window.setTimeout(() => saveData(data), PERSIST_DELAY_MS)
    return () => window.clearTimeout(handle)
  }, [data])

  useEffect(() => {
    const flush = () => saveData(latest.current)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setData(loadData())
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const upsertSubject = useCallback((subject: Subject) => {
    setData((prev) => {
      const exists = prev.subjects.some((s) => s.id === subject.id)
      return {
        ...prev,
        subjects: exists
          ? prev.subjects.map((s) => (s.id === subject.id ? subject : s))
          : [...prev.subjects, subject],
      }
    })
  }, [])

  const addSubjects = useCallback((added: Subject[]) => {
    if (!added.length) return
    setData((prev) => ({ ...prev, subjects: [...prev.subjects, ...added] }))
  }, [])

  const deleteSubject = useCallback((id: string) => {
    setData((prev) => ({ ...prev, subjects: prev.subjects.filter((s) => s.id !== id) }))
  }, [])

  const setProgress = useCallback(
    (subjectId: string, week: number, category: string, state: ProgressState) => {
      setData((prev) => ({
        ...prev,
        subjects: prev.subjects.map((s) => {
          if (s.id !== subjectId) return s
          const progress = { ...s.progress }
          const key = progressKey(week, category)
          if (state === 'pending') delete progress[key]
          else progress[key] = state
          return { ...s, progress }
        }),
      }))
    },
    [],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }, [])

  const replaceData = useCallback((next: PlannerData) => setData(next), [])
  const resetData = useCallback(() => setData(createDefaultData()), [])

  const value = useMemo<PlannerStore>(
    () => ({
      data,
      settings: data.settings,
      subjects: data.subjects,
      upsertSubject,
      addSubjects,
      deleteSubject,
      setProgress,
      updateSettings,
      replaceData,
      resetData,
    }),
    [data, upsertSubject, addSubjects, deleteSubject, setProgress, updateSettings, replaceData, resetData],
  )

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
}

export function usePlanner(): PlannerStore {
  const ctx = useContext(PlannerContext)
  if (!ctx) throw new Error('usePlanner must be used inside PlannerProvider')
  return ctx
}
