const STORAGE_KEY = "rest_extensions_v1"
const PRUNE_DAYS = 90

interface RestExtensionRecord {
  date: string // YYYY-MM-DD
  workoutId: string
}

export interface RestExtensionTrend {
  currentMonthCount: number
  lastMonthCount: number
  direction: "up" | "down" | "stable"
}

export function recordRestExtension(workoutId: string): void {
  if (typeof window === "undefined") return
  const records = loadRecords()
  records.push({ date: new Date().toISOString().slice(0, 10), workoutId })
  saveRecords(pruneOld(records))
}

export function getRestExtensionTrend(): RestExtensionTrend {
  const records = loadRecords()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

  const currentMonthCount = records.filter((r) => {
    const d = new Date(r.date)
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth
  }).length

  const lastMonthCount = records.filter((r) => {
    const d = new Date(r.date)
    return d.getFullYear() === lastMonthYear && d.getMonth() === lastMonth
  }).length

  const direction: RestExtensionTrend["direction"] =
    currentMonthCount > lastMonthCount ? "up" : currentMonthCount < lastMonthCount ? "down" : "stable"

  return { currentMonthCount, lastMonthCount, direction }
}

function loadRecords(): RestExtensionRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as RestExtensionRecord[]) : []
  } catch {
    return []
  }
}

function saveRecords(records: RestExtensionRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function pruneOld(records: RestExtensionRecord[]): RestExtensionRecord[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PRUNE_DAYS)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return records.filter((r) => r.date >= cutoffStr)
}
