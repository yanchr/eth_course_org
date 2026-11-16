import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportData, readImportFile } from '../src/lib/backup'
import {
  STORAGE_KEY,
  createDefaultData,
  createDefaultDayPlan,
  loadData,
  persistentData,
  saveData,
} from '../src/lib/storage'
import { currentWeek, toISODate } from '../src/lib/semester'

const ephemeralKeys = ['dayPlan', 'dayPlansByDate', 'lastRolloverDate']

function staleData() {
  const data = createDefaultData()
  data.dayPlan = createDefaultDayPlan(data.activityPresets, '2026-11-09')
  data.dayPlan.dayStartTime = '10:00'
  data.dayPlansByDate = { [data.dayPlan.date]: data.dayPlan }
  data.lastRolloverDate = data.dayPlan.date
  return data
}

test('JSON export omits session state while retaining durable data', async () => {
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
    assert.deepEqual(saved, persistentData(data))
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
  for (const payload of [persistentData(legacy), legacy]) {
    const data = await readImportFile(new File([JSON.stringify(payload)], 'backup.json'))
    assert.equal(data.dayPlan.date, toISODate(new Date()))
    assert.equal(data.lastRolloverDate, data.dayPlan.date)
    assert.equal(data.dayPlan.dayStartTime, '08:00')
    assert.deepEqual(Object.keys(data.dayPlansByDate ?? {}), [data.dayPlan.date])
    assert.deepEqual(data.settings, legacy.settings)
    assert.deepEqual(data.activityPresets, legacy.activityPresets)
  }
})

test('local storage omits plans and ignores legacy date overrides on load', () => {
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
    const legacy = staleData()
    values.set(STORAGE_KEY, JSON.stringify(legacy))
    assert.equal(loadData().dayPlan.date, toISODate(new Date()))
    saveData(legacy)
    const saved = JSON.parse(values.get(STORAGE_KEY)!)
    for (const key of ephemeralKeys) assert.equal(Object.hasOwn(saved, key), false)
    assert.deepEqual(saved, persistentData(legacy))
    assert.equal(loadData().dayPlan.date, toISODate(new Date()))
    assert.equal(legacy.dayPlan.date, '2026-11-09')
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

test('week is calculated from the date and semester start', () => {
  const start = '2026-09-14'
  assert.equal(currentWeek(start, 14, new Date(2026, 10, 9)), 9)
  assert.equal(currentWeek(start, 14, new Date(2026, 10, 16)), 10)
  assert.equal(currentWeek('2026-09-07', 14, new Date(2026, 10, 16)), 11)
})
