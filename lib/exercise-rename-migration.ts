/**
 * One-time migration to rename exercises across all localStorage data.
 * Renames are case-insensitive matched but stored with the new casing.
 */

const MIGRATION_KEY = "exercise_rename_migration_v1"

const RENAMES: Record<string, string> = {
  "incline smith machine bench": "Incline Press Machine",
  "incline machine chest press": "Wide Chest Press Machine",
  "standing / machine calf raise": "Machine Calf Raise",
}

function shouldRename(name: string): string | null {
  const lower = name.toLowerCase().trim()
  return RENAMES[lower] ?? null
}

export function runExerciseRenameMigration(): void {
  if (typeof window === "undefined") return
  if (localStorage.getItem(MIGRATION_KEY)) return

  migrateWorkoutHistory()
  migratePersonalRecords()
  migrateRoutines()
  migrateExercisePreferences()

  localStorage.setItem(MIGRATION_KEY, new Date().toISOString())
}

function migrateWorkoutHistory() {
  const raw = localStorage.getItem("workout_history")
  if (!raw) return
  try {
    const history = JSON.parse(raw)
    let changed = false
    for (const workout of history) {
      for (const exercise of workout.exercises ?? []) {
        const newName = shouldRename(exercise.name)
        if (newName) {
          exercise.name = newName
          changed = true
        }
      }
    }
    if (changed) localStorage.setItem("workout_history", JSON.stringify(history))
  } catch { /* skip */ }
}

function migratePersonalRecords() {
  const raw = localStorage.getItem("personal_records")
  if (!raw) return
  try {
    const records = JSON.parse(raw)
    let changed = false
    for (const record of records) {
      const newName = shouldRename(record.exerciseName)
      if (newName) {
        record.exerciseName = newName
        changed = true
      }
    }
    if (changed) localStorage.setItem("personal_records", JSON.stringify(records))
  } catch { /* skip */ }
}

function migrateRoutines() {
  const raw = localStorage.getItem("workout_routines_v2")
  if (!raw) return
  try {
    const routines = JSON.parse(raw)
    let changed = false
    for (const routine of routines) {
      for (const exercise of routine.exercises ?? []) {
        const newName = shouldRename(exercise.name)
        if (newName) {
          exercise.name = newName
          changed = true
        }
      }
    }
    if (changed) localStorage.setItem("workout_routines_v2", JSON.stringify(routines))
  } catch { /* skip */ }
}

function migrateExercisePreferences() {
  const raw = localStorage.getItem("exercise_preferences")
  if (!raw) return
  try {
    const data = JSON.parse(raw)
    const prefs = data.preferences ?? {}
    let changed = false
    const newPrefs: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(prefs)) {
      const newName = shouldRename(key)
      if (newName) {
        newPrefs[newName.toLowerCase().trim()] = value
        changed = true
      } else {
        newPrefs[key] = value
      }
    }
    if (changed) {
      data.preferences = newPrefs
      localStorage.setItem("exercise_preferences", JSON.stringify(data))
    }
  } catch { /* skip */ }
}
