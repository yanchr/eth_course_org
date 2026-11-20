/** Numbered repeats share estimates; trailing -1 keeps its previous-week meaning. */
export function todoFamily(category: string): string {
  const name = category.trim().toLowerCase()
  return /-\d+$/.test(name) ? name : name.replace(/\s*\d+$/, '').trimEnd()
}
