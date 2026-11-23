import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportData, readImportFile } from '../src/lib/backup'
import {
  STORAGE_KEY,
  createDefaultData,
  createDefaultDayPlan,
  loadData,
  backupData,
  saveData,
  rolloverDayPlan,
} from '../src/lib/storage'
import { currentWeek, toISODate } from '../src/lib/semester'
import { categoriesInWeek, createSubject, occursInWeek, slotsInWeek } from '../src/lib/subjects'
import { completedTodayCount, dailyTodoTarget, weekCompletions, weekStats, sortByWeekOutstanding } from '../src/lib/progress'
import { studyStats } from '../src/lib/study'
import { importClassActivities } from '../src/lib/dayPlannerImport'
import { subscribePlannerLifecycle } from '../src/lib/plannerLifecycle'

const ephemeralKeys = ['dayPlan', 'dayPlansByDate', 'lastRolloverDate']

test('daily pace includes today and stays stable as start-of-day work is completed', () => {
  for (let day = 0; day < 7; day++) {
    const now = new Date(2026, 10, 23 + day, 12).getTime()
    assert.equal(dailyTodoTarget(114, 0, now), 114 / (7 - day))
    assert.equal(dailyTodoTarget(110, 4, now), 114 / (7 - day))
    assert.equal(dailyTodoTarget(0, 0, now), 0)
  }
  const sunday = new Date(2026, 10, 29, 23, 59).getTime()
  const monday = new Date(2026, 10, 30, 0, 0).getTime()
  assert.equal(dailyTodoTarget(14, 0, sunday), 14)
  assert.equal(dailyTodoTarget(14, 0, monday), 2)
})

test('header counts include future and catch-up work but exclude canceled and completed work', () => {
  const subject = createSubject('Math')
  subject.categories = ['Lecture', 'Quiz-1']
  subject.progress = { '1-Lecture': 'completed', '2-Quiz-1': 'canceled' }
  const now = new Date(2026, 10, 23, 12).getTime()
  subject.completedAt = { '1-Lecture': new Date(now).toISOString() }
  const completion = weekCompletions([subject], 15)
  assert.equal(completion.slice(0, 11).reduce((sum, week) => sum + week.scheduled - week.completed, 0), 20)
  assert.equal(completion.reduce((sum, week) => sum + week.scheduled - week.completed, 0), 27)
  assert.equal(completedTodayCount([subject], now), 1)
  assert.equal(dailyTodoTarget(20, completedTodayCount([subject], now), now), 3)
})

test('average to-do time sums split sessions and splits shared sessions before averaging', () => {
  const session = (minutes: number, categories = ['Lecture'], week = 1, subjectId = 'math') => ({
    id: `${minutes}-${week}-${subjectId}`, subjectId, week, categories,
    durationMs: minutes * 60000,
    startedAt: '2026-11-20T10:00:00.000Z', endedAt: '2026-11-20T12:00:00.000Z',
  })
  const stats = studyStats([
    session(10), session(20), // One 30-minute to-do, not two samples.
    session(90, ['Lecture', 'Quiz']), // Two 45-minute to-dos; Lecture now totals 75.
    session(60, ['Lecture'], 2), // A separate week is a separate to-do.
    session(100, ['Lecture'], 1, 'physics'), // A separate course is a separate to-do.
    session(300, []), // Course-only time must not affect the to-do average.
  ])
  assert.equal(stats.tasks.length, 4)
  assert.equal(stats.avgPerTaskMs, 70 * 60000)
  assert.equal(studyStats([]).tasks.length, 0)
})

function staleData() {
  const data = createDefaultData()
  data.dayPlan = createDefaultDayPlan(data.activityPresets, '2026-11-09')
  data.dayPlan.dayStartTime = '10:00'
  data.dayPlansByDate = { [data.dayPlan.date]: data.dayPlan }
  data.lastRolloverDate = data.dayPlan.date
  return data
}

test('JSON export omits daily state while retaining reusable data', async () => {
  const data = staleData()
  const original = structuredClone(data)
  let exported: Blob | undefined
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  URL.createObjectURL = (blob) => {
    exported = blob
    return 'blob:test'
  }
  URL.revokeObjectURL = () => {}
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ click() {}, remove() {} }),
      body: { appendChild() {} },
    },
  })
  try {
    exportData(data)
    assert.ok(exported)
    const payload = JSON.parse(await exported.text())
    for (const key of ephemeralKeys) assert.equal(Object.hasOwn(payload, key), false)
    const { exportedAt, ...saved } = payload
    assert.ok(Number.isFinite(Date.parse(exportedAt)))
    assert.deepEqual(saved, backupData(data))
    assert.deepEqual(data, original)
  } finally {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('clean and legacy backups both open today with a fresh plan', async () => {
  const legacy = staleData()
  legacy.activityPresets[0].durationMinutes = 75
  for (const payload of [backupData(legacy), legacy]) {
    const data = await readImportFile(new File([JSON.stringify(payload)], 'backup.json'))
    assert.equal(data.dayPlan.date, toISODate(new Date()))
    assert.equal(data.lastRolloverDate, data.dayPlan.date)
    assert.equal(data.dayPlan.dayStartTime, '08:00')
    assert.deepEqual(Object.keys(data.dayPlansByDate ?? {}), [data.dayPlan.date])
    assert.deepEqual(data.settings, legacy.settings)
    assert.deepEqual(data.activityPresets, legacy.activityPresets)
    assert.deepEqual(data.dayPlan.todoQueue, [])
    assert.deepEqual(data.dayPlan.customActivities, [])
    assert.deepEqual(data.dayPlan.selectedPresetIds,
      legacy.activityPresets.filter((preset) => preset.isDefault).map((preset) => preset.id))
  }
})

test('local storage restores the complete same-day plan and presets after reopening', () => {
  const values = new Map<string, string>()
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  try {
    assert.equal(loadData().dayPlan.date, toISODate(new Date()))
    const data = createDefaultData()
    const custom = {
      id: 'walk', name: 'Walk', durationMinutes: 25,
      anchor: { type: 'flow' as const }, isDefault: false,
    }
    data.activityPresets[0].durationMinutes = 75
    data.dayPlan = {
      ...data.dayPlan,
      dayStartTime: '09:30',
      minBreakTailMinutes: 15,
      selectedPresetIds: ['Lunch'],
      customActivities: [custom],
      todoQueue: [{
        id: 'todo', subjectId: 'subject', week: 3, categories: ['Exercise'],
        sdMultiplier: 1.7, breakStyle: 'lecture', anchor: { type: 'fixed', time: '10:00' },
        customDurationMinutes: 90, snappedStartMinute: 600, snappedEndMinute: 690,
      }],
      breakOverrides: { break1: 5 },
      activityOverrides: { Lunch: { durationMinutes: 45, time: '12:30', anchor: { type: 'flow' } } },
      settingsBaselineOrder: ['todo', 'walk'],
      settingsBaselineSelectedPresetIds: ['Lunch'],
      settingsBaselineCustomActivities: [custom],
      settingsBaselineActivityOverrides: { Lunch: { durationMinutes: 45 } },
    }
    // The active plan must win even if a previous snapshot remains in the date map.
    saveData(data)
    const saved = JSON.parse(values.get(STORAGE_KEY)!)
    assert.deepEqual(saved.dayPlan, data.dayPlan)
    assert.deepEqual(saved.dayPlansByDate[data.dayPlan.date], data.dayPlan)
    assert.equal(saved.lastRolloverDate, data.lastRolloverDate)
    const reopened = loadData()
    assert.deepEqual(reopened.dayPlan, data.dayPlan)
    assert.deepEqual(reopened.activityPresets, data.activityPresets)
    assert.equal(reopened.lastRolloverDate, data.lastRolloverDate)
    assert.equal(currentWeek(reopened.settings.semesterStartDate, 14),
      currentWeek(data.settings.semesterStartDate, 14))

    // Cold-launching on a later date must reset, even when that date was preplanned.
    const old = staleData()
    old.dayPlan.date = '2000-01-01'
    old.lastRolloverDate = '2000-01-01'
    old.dayPlansByDate = { [toISODate(new Date())]: data.dayPlan }
    saveData(old)
    assert.deepEqual(loadData().dayPlan, createDefaultDayPlan(old.activityPresets))

    // A deliberately empty preset collection must survive local storage too.
    const empty = createDefaultData()
    empty.activityPresets = []
    empty.dayPlan = createDefaultDayPlan([])
    saveData(empty)
    assert.deepEqual(loadData().activityPresets, [])
    assert.deepEqual(loadData().dayPlan.selectedPresetIds, [])
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('rollover preserves same-day edits and starts fresh only when the real date changes', () => {
  const data = staleData()
  const original = structuredClone(data)
  assert.equal(rolloverDayPlan(data, data.lastRolloverDate), data)
  const tomorrow = '2026-11-10'
  data.dayPlansByDate = { [tomorrow]: { ...data.dayPlan, date: tomorrow } }
  const rolled = rolloverDayPlan(data, tomorrow)
  assert.equal(rolled.lastRolloverDate, tomorrow)
  assert.deepEqual(rolled.dayPlan, createDefaultDayPlan(data.activityPresets, tomorrow))
  assert.deepEqual(rolled.dayPlan.todoQueue, [])
  assert.deepEqual(rolled.dayPlan.selectedPresetIds,
    data.activityPresets.filter((preset) => preset.isDefault).map((preset) => preset.id))
  assert.deepEqual(data.dayPlan, original.dayPlan)
  assert.equal(rolloverDayPlan(rolled, tomorrow), rolled)
})

test('iOS background flush and foreground events save plans and advance the current week', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const windowEvents = new EventTarget()
  const documentEvents = new EventTarget()
  let visibility = 'visible'
  let interval: (() => void) | undefined
  let cleared = false
  Object.assign(windowEvents, {
    setInterval: (callback: () => void) => { interval = callback; return 1 },
    clearInterval: () => { cleared = true },
  })
  Object.defineProperty(documentEvents, 'visibilityState', { get: () => visibility })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowEvents })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentEvents })
  let flushes = 0
  let refreshes = 0
  let today = '2026-11-15'
  let data = staleData()
  data.lastRolloverDate = today
  let week = 0
  let unsubscribe = () => {}
  try {
    unsubscribe = subscribePlannerLifecycle(
      () => { flushes++ },
      () => {
        refreshes++
        data = rolloverDayPlan(data, today)
        week = currentWeek(data.settings.semesterStartDate, 14, new Date(`${today}T12:00:00`))
      },
    )
    assert.equal(week, 9)
    visibility = 'hidden'
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    windowEvents.dispatchEvent(new Event('pagehide'))
    assert.equal(flushes, 2)
    today = '2026-11-16'
    visibility = 'visible'
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    assert.equal(week, 10)
    assert.equal(data.dayPlan.date, today)
    const plan = data.dayPlan
    windowEvents.dispatchEvent(new Event('pageshow'))
    windowEvents.dispatchEvent(new Event('focus'))
    interval?.()
    assert.equal(refreshes, 5)
    assert.equal(data.dayPlan, plan)
    unsubscribe()
    assert.equal(cleared, true)
    windowEvents.dispatchEvent(new Event('pagehide'))
    windowEvents.dispatchEvent(new Event('focus'))
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    assert.equal(flushes, 2)
    assert.equal(refreshes, 5)
  } finally {
    unsubscribe()
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('week is calculated from the date and semester start', () => {
  const start = '2026-09-14'
  assert.equal(currentWeek(start, 14, new Date(2026, 10, 9)), 9)
  assert.equal(currentWeek(start, 14, new Date(2026, 10, 16)), 10)
  assert.equal(currentWeek('2026-09-07', 14, new Date(2026, 10, 16)), 11)
})


test('week boundaries use calendar dates across Zurich daylight saving changes', () => {
  const previousTZ = process.env.TZ
  process.env.TZ = 'Europe/Zurich'
  try {
    assert.equal(currentWeek('2026-02-16', 14, new Date(2026, 2, 29)), 6)
    assert.equal(currentWeek('2026-02-16', 14, new Date(2026, 2, 30)), 7)
    assert.equal(currentWeek('2026-09-14', 14, new Date(2026, 9, 26)), 7)
    assert.equal(currentWeek('2026-09-14', 14, new Date(2026, 8, 1)), 1)
    assert.equal(currentWeek('2026-09-14', 14, new Date(2027, 0, 1)), 14)
  } finally {
    if (previousTZ === undefined) delete process.env.TZ
    else process.env.TZ = previousTZ
  }
})


test('W15 includes only previous-week todos and has no repeating classes', () => {
  const subject = createSubject('Math')
  subject.categories = ['Lecture', 'Quiz-1', 'Summary-1 ', 'Quiz-10', 'Quiz-1 extra']
  subject.scheduleSlots = [{ id: 'lecture', type: 'lecture', day: 'Mon', time: '10:00-11:00', room: 'HG' }]
  subject.events = [{ id: 'event', name: 'Exam', week: 14, slots: [], links: [] }]
  assert.deepEqual(categoriesInWeek(subject, 14), [...subject.categories, 'Exam'])
  assert.deepEqual(categoriesInWeek(subject, 15), ['Quiz-1', 'Summary-1 '])
  assert.deepEqual(categoriesInWeek(subject, 16), [])
  assert.equal(slotsInWeek(subject, 14).length, 1)
  assert.deepEqual(slotsInWeek(subject, 15), [])
  assert.deepEqual(importClassActivities([subject], '2026-12-21', '2026-09-14', 15), [])

  const regular = { ...subject, id: 'regular', categories: ['Lecture'] }
  const calendar = { ...subject, id: 'calendar', calendarOnly: true }
  const oneOff = { ...subject, id: 'once', onceWeek: 14 }
  assert.equal(occursInWeek(regular, 15), false)
  assert.equal(occursInWeek(calendar, 15), false)
  assert.equal(occursInWeek(oneOff, 15), false)
  assert.deepEqual(sortByWeekOutstanding([regular, calendar, oneOff, subject], 15), [subject])
  subject.progress['15-Quiz-1'] = 'completed'
  assert.equal(weekStats(subject, 15).total, 2)
  assert.equal(weekStats(subject, 15).completed, 1)
  assert.equal(weekStats(subject, 14).completed, 0)
})

test('W15 todo plans and study records survive reopening and backup import', async () => {
  const data = createDefaultData()
  const subject = createSubject('Math')
  subject.categories = ['Quiz-1']
  subject.progress['15-Quiz-1'] = 'completed'
  data.subjects = [subject]
  data.dayPlan.todoQueue = [{ id: 'catch-up', subjectId: subject.id, week: 15, categories: ['Quiz-1'], sdMultiplier: 1, breakStyle: 'standard', anchor: { type: 'flow' } }]
  data.studySessions = [{ id: 'session', subjectId: subject.id, week: 15, categories: ['Quiz-1'], durationMs: 60000, startedAt: '2026-12-21T10:00:00.000Z', endedAt: '2026-12-21T10:01:00.000Z' }]
  const memory = new Map<string, string>()
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  try {
    saveData(data)
    const reopened = loadData()
    assert.deepEqual(reopened.dayPlan.todoQueue, data.dayPlan.todoQueue)
    assert.deepEqual(reopened.studySessions, data.studySessions)
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
  const imported = await readImportFile(new File([JSON.stringify(backupData(data))], 'backup.json'))
  assert.deepEqual(imported.studySessions, data.studySessions)
  assert.equal(imported.subjects[0].progress['15-Quiz-1'], 'completed')
  assert.equal(imported.settings.weekCount, 14)
})

test('missing activity and todo anchors reset to flow, including saved Configure settings', async () => {
  const { repairPlannerAnchors } = await import('../src/lib/dayPlannerAnchors')
  const data = createDefaultData()
  const target = { id: 'target', subjectId: 'math', week: 1, categories: ['Quiz'], sdMultiplier: 1, anchor: { type: 'flow' as const } }
  data.dayPlan.todoQueue = [target, { ...target, id: 'dependent', anchor: { type: 'before', targetId: 'Lunch' } }]
  data.dayPlan.customActivities = [{ id: 'custom', name: 'Custom', durationMinutes: 10, isDefault: false, anchor: { type: 'after', targetId: 'target' } }]
  data.dayPlan.settingsBaselineCustomActivities = structuredClone(data.dayPlan.customActivities)
  data.dayPlan.activityOverrides = { travel_to_uni: { durationMinutes: 45, anchor: { type: 'before', targetId: 'target' } } }
  data.dayPlan.settingsBaselineActivityOverrides = structuredClone(data.dayPlan.activityOverrides)
  const intact = repairPlannerAnchors(data)
  assert.equal(intact.dayPlan.todoQueue[1].anchor.type, 'before')
  assert.equal(intact.dayPlan.customActivities[0].anchor.type, 'after')
  assert.equal(intact.dayPlan.activityOverrides?.travel_to_uni.anchor?.type, 'before')

  data.dayPlan.todoQueue = data.dayPlan.todoQueue.filter((todo) => todo.id !== 'target')
  data.activityPresets = data.activityPresets.filter((preset) => preset.id !== 'Lunch')
  data.dayPlansByDate = { [data.dayPlan.date]: structuredClone(data.dayPlan) }
  const repaired = repairPlannerAnchors(data)
  for (const plan of [repaired.dayPlan, repaired.dayPlansByDate![data.dayPlan.date]]) {
    assert.deepEqual(plan.todoQueue[0].anchor, { type: 'flow' })
    assert.deepEqual(plan.customActivities[0].anchor, { type: 'flow' })
    assert.deepEqual(plan.settingsBaselineCustomActivities[0].anchor, { type: 'flow' })
    assert.deepEqual(plan.activityOverrides?.travel_to_uni, { durationMinutes: 45, anchor: { type: 'flow' } })
    assert.deepEqual(plan.settingsBaselineActivityOverrides?.travel_to_uni.anchor, { type: 'flow' })
    assert.deepEqual(plan.activityOverrides?.Sleeping.anchor, { type: 'flow' })
    assert.deepEqual(plan.settingsBaselineActivityOverrides?.Sleeping.anchor, { type: 'flow' })
  }
  assert.deepEqual(repairPlannerAnchors(repaired), repaired)
})

test('deselecting an anchor target resets its dependents while fixed anchors stay fixed', async () => {
  const { repairDayPlanAnchors } = await import('../src/lib/dayPlannerAnchors')
  const data = createDefaultData()
  data.dayPlan.selectedPresetIds = data.dayPlan.selectedPresetIds.filter((id) => id !== 'Lunch')
  const repaired = repairDayPlanAnchors(data.dayPlan, data.activityPresets)
  assert.deepEqual(repaired.activityOverrides?.Sleeping.anchor, { type: 'flow' })
  assert.equal(repaired.settingsBaselineActivityOverrides?.Sleeping, undefined)
  assert.equal(repaired.activityOverrides?.Lunch, undefined)
  assert.equal(data.activityPresets.find((preset) => preset.id === 'Lunch')?.anchor.type, 'fixed')
})

test('numbered todos pool separate replicas within a course, summing split sessions first', async () => {
  const { combinedTodoStats, todoTargetMinutes } = await import('../src/lib/dayPlannerMath')
  const { taskAverages, taskAverageKey } = await import('../src/lib/study')
  const session = (category: string, minutes: number, week = 1, subjectId = 'analysis') => ({
    id: `${subjectId}-${week}-${category}-${minutes}`, subjectId, week, categories: [category],
    durationMs: minutes * 60000, startedAt: '2026-11-20T10:00:00.000Z', endedAt: '2026-11-20T11:00:00.000Z',
  })
  const sessions = [session('Lecture', 10), session('Lecture', 20), session('Lecture2', 60), session('Lecture3', 90), session('Lecture', 120, 1, 'other'), session('Lecture-1', 300)]
  const expected = { mean: 60, sd: 30, n: 3 }
  for (const category of ['Lecture', 'Lecture2', 'Lecture3', 'Lecture4', 'Lecture 5', 'Lecture_2']) {
    assert.deepEqual(combinedTodoStats(sessions, 'analysis', [category]), expected)
    assert.equal(taskAverages(sessions).get(taskAverageKey('analysis', category)), 60 * 60000)
    assert.equal(todoTargetMinutes({ id: category, subjectId: 'analysis', week: 2, categories: [category], sdMultiplier: 1, anchor: { type: 'flow' } }, sessions), 90)
  }
  assert.equal(combinedTodoStats(sessions, 'analysis', ['Lecture-1']).mean, 300)
  assert.equal(combinedTodoStats(sessions, 'other', ['Lecture2']).mean, 120)
  assert.equal(combinedTodoStats(sessions, 'analysis', ['Lecture', 'Lecture2']).mean, 120)
  assert.deepEqual(combinedTodoStats([], 'analysis', ['Lecture3']), { mean: 60, sd: 0, n: 0 })
})


test('numbered replicas can also carry a previous-week suffix', async () => {
  const { todoFamily } = await import('../src/lib/todoFamilies')
  const { combinedTodoStats } = await import('../src/lib/dayPlannerMath')
  const { taskAverages, taskAverageKey } = await import('../src/lib/study')
  for (const category of ['Lecture-1', 'Lecture_2-1', 'Lecture2-1', 'Lecture 3-1']) {
    assert.equal(todoFamily(category), 'lecture-1')
  }
  assert.equal(todoFamily('Lecture_2'), 'lecture')
  const subject = createSubject('Analysis')
  subject.categories = ['Lecture', 'Lecture-1', 'Lecture_2-1']
  assert.deepEqual(categoriesInWeek(subject, 15), ['Lecture-1', 'Lecture_2-1'])
  subject.progress['15-Lecture-1'] = 'completed'
  assert.equal(weekStats(subject, 15).completed, 1)
  assert.equal(weekStats(subject, 15).total, 2)

  const sessions = ['Lecture-1', 'Lecture_2-1', 'Lecture'].map((category, index) => ({
    id: category, subjectId: subject.id, week: 14, categories: [category],
    durationMs: [30, 90, 300][index] * 60000,
    startedAt: '2026-11-20T10:00:00.000Z', endedAt: '2026-11-20T11:00:00.000Z',
  }))
  for (const category of ['Lecture-1', 'Lecture_2-1', 'Lecture3-1']) {
    const stats = combinedTodoStats(sessions, subject.id, [category])
    assert.equal(stats.mean, 60)
    assert.equal(stats.sd, Math.sqrt(1800))
    assert.equal(stats.n, 2)
    assert.equal(taskAverages(sessions).get(taskAverageKey(subject.id, category)), 60 * 60000)
  }
  assert.equal(combinedTodoStats(sessions, subject.id, ['Lecture']).mean, 300)
})
