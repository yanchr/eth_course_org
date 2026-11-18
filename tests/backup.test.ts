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
import { subscribePlannerLifecycle } from '../src/lib/plannerLifecycle'

const ephemeralKeys = ['dayPlan', 'dayPlansByDate', 'lastRolloverDate']

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
