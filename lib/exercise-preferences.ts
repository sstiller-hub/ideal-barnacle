const STORAGE_KEY = "exercise_preferences"
const SCHEMA_VERSION = 1

type ExercisePreferences = {
  schemaVersion: number
  preferences: {
    [exerciseName: string]: {
      showPlateVisualizer: boolean
      lastUpdated: number
    }
  }
}

function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim()
}

function loadPreferences(): ExercisePreferences {
  if (typeof window === "undefined") {
    return { schemaVersion: SCHEMA_VERSION, preferences: {} }
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return { schemaVersion: SCHEMA_VERSION, preferences: {} }
    }

    const parsed = JSON.parse(stored) as ExercisePreferences

    // Handle schema migrations if needed
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      console.warn("[v0] Exercise preferences schema mismatch, resetting")
      return { schemaVersion: SCHEMA_VERSION, preferences: {} }
    }

    return parsed
  } catch (error) {
    console.error("[v0] Failed to load exercise preferences:", error)
    return { schemaVersion: SCHEMA_VERSION, preferences: {} }
  }
}

function savePreferences(prefs: ExercisePreferences): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error("[v0] Failed to save exercise preferences:", error)
  }
}

export function getPlateVisualizerPreference(exerciseName: string): boolean | null {
  const key = normalizeExerciseName(exerciseName)
  const prefs = loadPreferences()

  const preference = prefs.preferences[key]
  if (!preference) {
    return null // No preference saved, use default
  }

  return preference.showPlateVisualizer
}

export function setPlateVisualizerPreference(exerciseName: string, show: boolean): void {
  const key = normalizeExerciseName(exerciseName)
  const prefs = loadPreferences()

  prefs.preferences[key] = {
    showPlateVisualizer: show,
    lastUpdated: Date.now(),
  }

  savePreferences(prefs)
}

export function clearExercisePreferences(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}
