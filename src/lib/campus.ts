import type { Campus } from '../types'
import { BUILDINGS } from './buildings'

export interface RoomLocation {
  /** building code, e.g. "HG" */
  code: string
  /** everything after the building code, e.g. "E 1.1" */
  rest: string
  campus: Campus
  coords: { x: number; y: number } | null
  resolvedBy: 'registry' | 'rule'
}

export function extractBuildingCode(room: string): string {
  return room.trim().split(/\s+/)[0]?.toUpperCase() ?? ''
}

/** Fallback for codes missing from the registry: H* except HG -> Hönggerberg. */
export function campusByRule(code: string): Campus {
  return code.startsWith('H') && code !== 'HG' ? 'hoenggerberg' : 'zentrum'
}

export function parseRoom(room: string): RoomLocation | null {
  const trimmed = room.trim()
  if (!trimmed) return null
  const code = extractBuildingCode(trimmed)
  const rest = trimmed.slice(trimmed.split(/\s+/)[0].length).trim()
  const known = BUILDINGS[code]
  if (known) {
    return { code, rest, campus: known.campus, coords: { x: known.x, y: known.y }, resolvedBy: 'registry' }
  }
  return { code, rest, campus: campusByRule(code), coords: null, resolvedBy: 'rule' }
}
