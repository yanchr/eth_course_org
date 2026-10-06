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
import type { PlannerData, ProgressState, Settings, StudySession, Subject } from '../types'
import { STORAGE_KEY, createDefaultData, loadData, saveData } from '../lib/storage'
import { progressKey } from '../lib/progress'
import { activeElapsedMs } from '../lib/study'
import { createId } from '../lib/id'

/** Shorter sessions are treated as accidental taps and not logged. */
const MIN_SESSION_MS = 1000

interface PlannerStore {
  data: PlannerData
  settings: Settings
  subjects: Subject[]
  upsertSubject: (subject: Subject) => void
  addSubjects: (subjects: Subject[]) => void
  deleteSubject: (id: string) => void
  setProgress: (subjectId: string, week: number, category: string, state: ProgressState) => void
  startStudy: (subjectId: string, week: number, categories: string[]) => void
  pauseStudy: () => void
  resumeStudy: () => void
  stopStudy: () => void
  setStudyStart: (startedAt: number) => void
  addStudySession: (session: StudySession) => void
  updateStudySession: (session: StudySession) => void
  deleteStudySession: (id: string) => void
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

  const startStudy = useCallback((subjectId: string, week: number, categories: string[]) => {
    const now = Date.now()
    setData((prev) => ({
      ...prev,
      activeStudy: { subjectId, week, categories, startedAt: now, accumulatedMs: 0, resumedAt: now },
    }))
  }, [])

  /** Moves the start of the running recording; the elapsed time shifts by the same amount. */
  const setStudyStart = useCallback((startedAt: number) => {
    setData((prev) => {
      const active = prev.activeStudy
      if (!active) return prev
      const now = Date.now()
      const start = Math.min(startedAt, now)
      const shift = active.startedAt - start
      if (active.resumedAt === null) {
        return {
          ...prev,
          activeStudy: { ...active, startedAt: start, accumulatedMs: Math.max(0, active.accumulatedMs + shift) },
        }
      }
      // While running, fold any negative shift into the current run so elapsed never goes below zero.
      const accumulatedMs = active.accumulatedMs + shift
      return {
        ...prev,
        activeStudy:
          accumulatedMs >= 0
            ? { ...active, startedAt: start, accumulatedMs }
            : { ...active, startedAt: start, accumulatedMs: 0, resumedAt: Math.min(now, active.resumedAt - accumulatedMs) },
      }
    })
  }, [])

  const addStudySession = useCallback((session: StudySession) => {
    setData((prev) => ({ ...prev, studySessions: [...prev.studySessions, session] }))
  }, [])

  const updateStudySession = useCallback((session: StudySession) => {
    setData((prev) => ({
      ...prev,
      studySessions: prev.studySessions.map((s) => (s.id === session.id ? session : s)),
    }))
  }, [])

  const deleteStudySession = useCallback((id: string) => {
    setData((prev) => ({ ...prev, studySessions: prev.studySessions.filter((s) => s.id !== id) }))
  }, [])

  const pauseStudy = useCallback(() => {
    setData((prev) => {
      const active = prev.activeStudy
      if (!active || active.resumedAt === null) return prev
      return { ...prev, activeStudy: { ...active, accumulatedMs: activeElapsedMs(active), resumedAt: null } }
    })
  }, [])

  const resumeStudy = useCallback(() => {
    setData((prev) => {
      const active = prev.activeStudy
      if (!active || active.resumedAt !== null) return prev
      return { ...prev, activeStudy: { ...active, resumedAt: Date.now() } }
    })
  }, [])

  const stopStudy = useCallback(() => {
    setData((prev) => {
      const active = prev.activeStudy
      if (!active) return prev
      const durationMs = activeElapsedMs(active)
      const session: StudySession = {
        id: createId(),
        subjectId: active.subjectId,
        week: active.week,
        categories: active.categories,
        durationMs,
        startedAt: new Date(active.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
      }
      return {
        ...prev,
        activeStudy: null,
        studySessions: durationMs >= MIN_SESSION_MS ? [...prev.studySessions, session] : prev.studySessions,
      }
    })
  }, [])

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
      startStudy,
      pauseStudy,
      resumeStudy,
      stopStudy,
      setStudyStart,
      addStudySession,
      updateStudySession,
      deleteStudySession,
      updateSettings,
      replaceData,
      resetData,
    }),
    [
      data,
      upsertSubject,
      addSubjects,
      deleteSubject,
      setProgress,
      startStudy,
      pauseStudy,
      resumeStudy,
      stopStudy,
      setStudyStart,
      addStudySession,
      updateStudySession,
      deleteStudySession,
      updateSettings,
      replaceData,
      resetData,
    ],
  )

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
}

export function usePlanner(): PlannerStore {
  const ctx = useContext(PlannerContext)
  if (!ctx) throw new Error('usePlanner must be used inside PlannerProvider')
  return ctx
}
