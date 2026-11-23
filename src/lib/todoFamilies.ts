/** Numbered repeats share estimates while retaining a trailing week offset. */
export function todoFamily(category: string): string {
  const name = category.trim().toLowerCase()
  const offset = name.match(/-\d+$/)?.[0] ?? ''
  const base = offset ? name.slice(0, -offset.length) : name
  return base.replace(/[_\s]*\d+$/, '').trimEnd() + offset
}
