// The awsesh TUI's fuzzy filter: every typed character in order, tighter and earlier matches first
const fuzzyScore = (needle: string, haystack: string): number | undefined => {
  const typed = needle.toLowerCase().replace(/\s+/g, '')
  const text = haystack.toLowerCase().replace(/\s+/g, '')
  let score = 0
  let last = -1
  for (const char of typed) {
    const at = text.indexOf(char, last + 1)
    if (at === -1) return undefined
    if (at === last + 1) score += 2
    if (at === 0 || /[^a-z0-9]/.test(text[at - 1] ?? '')) score += 1
    last = at
  }
  return score - last / 1000
}

export const fuzzy = <T,>(items: readonly T[], text: (item: T) => string, needle: string): T[] => {
  if (!needle.trim()) return [...items]
  return items
    .map((item) => ({ item, score: fuzzyScore(needle, text(item)) }))
    .filter((hit): hit is { item: T; score: number } => hit.score !== undefined)
    .sort((a, b) => b.score - a.score)
    .map((hit) => hit.item)
}
