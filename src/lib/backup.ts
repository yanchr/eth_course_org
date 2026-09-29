import type { PlannerData } from '../types'
import { parsePlannerData } from './storage'
import { toISODate } from './semester'

export function exportData(data: PlannerData): void {
  const payload = { ...data, exportedAt: new Date().toISOString() }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `eth-course-planner-${toISODate(new Date())}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function readImportFile(file: File): Promise<PlannerData> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const data = parsePlannerData(raw)
  if (!data) throw new Error('That file is not an ETH Course Planner export.')
  return data
}
