const STORAGE_KEY = "pr_excluded_exercises"

export function getPrExcludedExercises(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === "string")
  } catch {
    return []
  }
}

export function setPrExcludedExercises(exercises: string[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exercises))
}
