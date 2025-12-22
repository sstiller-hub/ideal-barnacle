import { saveWorkout, type CompletedWorkout, type Exercise, type WorkoutSet } from "./workout-storage"

export type CSVRow = {
  Date: string
  Workout: string
  Exercise_Normalized: string
  Set: string
  Reps: string
  "Weight (lbs)": string
}

export type ImportResult = {
  rowsParsed: number
  sessionsCreated: number
  duplicatesSkipped: number
  errors: string[]
}

function createSessionHash(
  date: string,
  workout: string,
  exercise: string,
  set: number,
  reps: number,
  weight: number,
): string {
  return `${date}|${workout}|${exercise}|${set}|${reps}|${weight}`
}

function getExistingHashes(): Set<string> {
  const hashes = new Set<string>()

  if (typeof window === "undefined") return hashes

  const stored = localStorage.getItem("workout_history")
  if (!stored) return hashes

  try {
    const history: CompletedWorkout[] = JSON.parse(stored)

    history.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        exercise.sets.forEach((set, idx) => {
          if (set.completed) {
            const hash = createSessionHash(workout.date, workout.name, exercise.name, idx + 1, set.reps, set.weight)
            hashes.add(hash)
          }
        })
      })
    })
  } catch (e) {
    console.error("Failed to parse workout history for de-duplication", e)
  }

  return hashes
}

export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  const headers = lines[0].split(",").map((h) => h.trim())
  const rows: CSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim())
    const row: any = {}

    headers.forEach((header, idx) => {
      row[header] = values[idx] || ""
    })

    rows.push(row as CSVRow)
  }

  return rows
}

export function validateHeaders(rows: CSVRow[]): string[] {
  const errors: string[] = []

  if (rows.length === 0) {
    errors.push("CSV is empty")
    return errors
  }

  const requiredHeaders = ["Date", "Workout", "Exercise_Normalized", "Set", "Reps", "Weight (lbs)"]
  const firstRow = rows[0]

  requiredHeaders.forEach((header) => {
    if (!(header in firstRow)) {
      errors.push(`Missing required header: ${header}`)
    }
  })

  return errors
}

export function importWorkouts(csvText: string): ImportResult {
  const result: ImportResult = {
    rowsParsed: 0,
    sessionsCreated: 0,
    duplicatesSkipped: 0,
    errors: [],
  }

  // Parse CSV
  const rows = parseCSV(csvText)
  const validationErrors = validateHeaders(rows)

  if (validationErrors.length > 0) {
    result.errors = validationErrors
    return result
  }

  result.rowsParsed = rows.length

  // Get existing hashes for de-duplication
  const existingHashes = getExistingHashes()

  // Group by date + workout name
  const sessionMap = new Map<string, CSVRow[]>()

  rows.forEach((row) => {
    const key = `${row.Date}|${row.Workout}`
    if (!sessionMap.has(key)) {
      sessionMap.set(key, [])
    }
    sessionMap.get(key)!.push(row)
  })

  // Process each session
  sessionMap.forEach((sessionRows, sessionKey) => {
    const [dateStr, workoutName] = sessionKey.split("|")

    // Group by exercise
    const exerciseMap = new Map<string, CSVRow[]>()

    sessionRows.forEach((row) => {
      const exerciseName = row.Exercise_Normalized
      if (!exerciseMap.has(exerciseName)) {
        exerciseMap.set(exerciseName, [])
      }
      exerciseMap.get(exerciseName)!.push(row)
    })

    // Build exercises
    const exercises: Exercise[] = []
    let hasNewSets = false

    exerciseMap.forEach((exerciseRows, exerciseName) => {
      // Sort by set number
      exerciseRows.sort((a, b) => {
        const setA = Number.parseInt(a.Set) || 0
        const setB = Number.parseInt(b.Set) || 0
        return setA - setB
      })

      const sets: WorkoutSet[] = []

      exerciseRows.forEach((row) => {
        const setNum = Number.parseInt(row.Set) || 0
        const reps = Number.parseInt(row.Reps) || 0
        const weight = Number.parseFloat(row["Weight (lbs)"]) || 0

        // Check for duplicate
        const hash = createSessionHash(dateStr, workoutName, exerciseName, setNum, reps, weight)

        if (existingHashes.has(hash)) {
          result.duplicatesSkipped++
        } else {
          hasNewSets = true
          sets.push({
            reps,
            weight,
            completed: true,
          })

          // Add to existing hashes to prevent duplicates within this import
          existingHashes.add(hash)
        }
      })

      if (sets.length > 0) {
        exercises.push({
          id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: exerciseName,
          targetSets: sets.length,
          targetReps: "0",
          restTime: 90,
          completed: true,
          sets,
        })
      }
    })

    // Only create session if there are new sets
    if (hasNewSets && exercises.length > 0) {
      const totalVolume = exercises.reduce((sum, ex) => {
        return sum + ex.sets.filter((s) => s.completed).reduce((s, set) => s + set.weight * set.reps, 0)
      }, 0)

      const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
      const completedSets = exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0)
      const totalReps = exercises.reduce(
        (sum, ex) => sum + ex.sets.filter((s) => s.completed).reduce((s, set) => s + set.reps, 0),
        0,
      )

      const workout: CompletedWorkout = {
        id: `import-${dateStr}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: workoutName,
        date: dateStr,
        duration: 0,
        exercises,
        stats: {
          totalSets,
          completedSets,
          totalVolume,
          totalReps,
        },
      }

      saveWorkout(workout)
      result.sessionsCreated++
    }
  })

  return result
}
