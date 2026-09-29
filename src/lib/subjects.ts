import { DEFAULT_CATEGORIES, type Subject } from '../types'
import { createId } from './id'

export function createSubject(name = '', lecturer = ''): Subject {
  return {
    id: createId(),
    name,
    lecturer,
    links: [],
    scheduleSlots: [],
    categories: [...DEFAULT_CATEGORIES],
    progress: {},
  }
}
