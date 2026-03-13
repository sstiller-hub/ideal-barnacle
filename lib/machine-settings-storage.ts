const MACHINE_SETTINGS_KEY = "exercise_machine_settings"

export interface ExerciseMachineSettings {
  seat?: string
}

function loadAll(): Record<string, ExerciseMachineSettings> {
  if (typeof window === "undefined") return {}
  const stored = localStorage.getItem(MACHINE_SETTINGS_KEY)
  if (!stored) return {}
  try {
    return JSON.parse(stored) as Record<string, ExerciseMachineSettings>
  } catch {
    return {}
  }
}

function normalizeKey(exerciseName: string): string {
  return exerciseName.toLowerCase().trim()
}

export function getMachineSettings(exerciseName: string): ExerciseMachineSettings {
  const all = loadAll()
  return all[normalizeKey(exerciseName)] ?? {}
}

export function saveMachineSettings(exerciseName: string, settings: ExerciseMachineSettings): void {
  if (typeof window === "undefined") return
  const all = loadAll()
  all[normalizeKey(exerciseName)] = settings
  localStorage.setItem(MACHINE_SETTINGS_KEY, JSON.stringify(all))
}
