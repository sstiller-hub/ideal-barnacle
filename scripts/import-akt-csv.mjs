import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const CSV_PATH = process.argv[2] || "/Users/samstiller/Downloads/akt_import_FINAL.csv"
const USER_ID = process.argv[3] || "5eef3bfd-d598-4a20-aa66-5bedaebcb376"

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, "utf8")
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    env[key] = value
  }
  return env
}

const envFromFile = readEnvFile(path.resolve(process.cwd(), ".env.local"))
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || envFromFile.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envFromFile.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in environment.")
  process.exit(1)
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`)
  process.exit(1)
}

const parseCSVLine = (line) => {
  const result = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
      continue
    }
    current += char
  }
  result.push(current)
  return result
}

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []
  const header = parseCSVLine(lines[0]).map((h) => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCSVLine(lines[i])
    const row = {}
    header.forEach((key, idx) => {
      row[key] = (values[idx] ?? "").trim()
    })
    rows.push(row)
  }
  return rows
}

const normalizeName = (value) => (value || "").trim()

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const withRetry = async (label, fn, attempts = 3) => {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const message = error?.message || ""
      const shouldRetry = message.includes("Internal server error") || message.includes("500")
      if (!shouldRetry || attempt === attempts) {
        console.error(`Request failed: ${label}`)
        throw error
      }
      console.warn(`Retrying ${label} (${attempt}/${attempts}) after error.`)
      await sleep(500 * attempt)
    }
  }
  throw lastError
}

const toDateRange = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`)
  }
  const next = new Date(date)
  next.setUTCDate(date.getUTCDate() + 1)
  return { start: date.toISOString(), end: next.toISOString() }
}

const loadWorkoutForDate = async (dateStr, workoutName) => {
  const { start, end } = toDateRange(dateStr)
  const { data } = await withRetry(`load workout ${dateStr} ${workoutName}`, async () => {
    const res = await supabase
      .from("workouts")
      .select("id, performed_at")
      .eq("user_id", USER_ID)
      .eq("name", workoutName)
      .gte("performed_at", start)
      .lt("performed_at", end)
      .order("performed_at", { ascending: false })
      .limit(2)
    if (res.error) throw res.error
    return res
  })
  if (!data || data.length === 0) return null
  if (data.length > 1) {
    console.warn(`Multiple workouts found for ${dateStr} ${workoutName}; using most recent.`)
  }
  return data[0]
}

const createWorkout = async (dateStr, workoutName) => {
  const { start } = toDateRange(dateStr)
  const payload = {
    id: crypto.randomUUID(),
    user_id: USER_ID,
    name: workoutName,
    performed_at: start,
    duration_seconds: 0,
    stats: {},
    client_id: crypto.randomUUID(),
    updated_at: new Date().toISOString(),
  }
  const { data } = await withRetry(`create workout ${dateStr} ${workoutName}`, async () => {
    const res = await supabase
      .from("workouts")
      .insert(payload)
      .select("id, performed_at")
      .single()
    if (res.error) throw res.error
    return res
  })
  return data
}

const loadExercises = async (workoutId) => {
  const { data } = await withRetry(`load exercises ${workoutId}`, async () => {
    const res = await supabase
      .from("workout_exercises")
      .select("id, name, sort_index")
      .eq("workout_id", workoutId)
    if (res.error) throw res.error
    return res
  })
  return data || []
}

const insertExercise = async (workoutId, name, sortIndex, targetSets) => {
  const payload = {
    workout_id: workoutId,
    exercise_id: name,
    name,
    target_sets: targetSets ?? null,
    target_reps: null,
    target_weight: null,
    sort_index: sortIndex,
    updated_at: new Date().toISOString(),
  }
  const { data } = await withRetry(`insert exercise ${name}`, async () => {
    const res = await supabase
      .from("workout_exercises")
      .insert(payload)
      .select("id, name, sort_index")
      .single()
    if (res.error) throw res.error
    return res
  })
  return data
}

const loadSetsByExercise = async (exerciseIds) => {
  if (exerciseIds.length === 0) return []
  const { data } = await withRetry(`load sets ${exerciseIds.length}`, async () => {
    const res = await supabase
      .from("workout_sets")
      .select("id, workout_exercise_id, set_index, reps, weight, completed")
      .in("workout_exercise_id", exerciseIds)
    if (res.error) throw res.error
    return res
  })
  return data || []
}

const updateWorkoutStats = async (workoutId) => {
  const { data: exercises } = await withRetry(`stats load exercises ${workoutId}`, async () => {
    const res = await supabase.from("workout_exercises").select("id").eq("workout_id", workoutId)
    if (res.error) throw res.error
    return res
  })

  const exerciseIds = (exercises || []).map((ex) => ex.id)
  const sets = await loadSetsByExercise(exerciseIds)

  const totalSets = sets.length
  const completedSets = sets.filter((set) => set.completed).length
  const totalReps = sets.reduce((sum, set) => sum + (set.reps ?? 0), 0)
  const totalVolume = sets.reduce((sum, set) => sum + (set.reps ?? 0) * (set.weight ?? 0), 0)

  await withRetry(`update stats ${workoutId}`, async () => {
    const res = await supabase
      .from("workouts")
      .update({
        stats: { totalSets, completedSets, totalReps, totalVolume },
        updated_at: new Date().toISOString(),
      })
      .eq("id", workoutId)
    if (res.error) throw res.error
    return res
  })
}

const csvText = fs.readFileSync(CSV_PATH, "utf8")
const rows = parseCSV(csvText)

if (rows.length === 0) {
  console.log("No rows found in CSV.")
  process.exit(0)
}

const grouped = new Map()
for (const row of rows) {
  const dateStr = row.Date
  const workoutName = normalizeName(row.Workout)
  const exerciseCanonical = normalizeName(row.Exercise_Canonical)
  const exerciseNormalized = normalizeName(row.Exercise_Normalized)
  const exerciseName = exerciseCanonical || exerciseNormalized
  const setNum = Number.parseInt(row.Set, 10)
  const reps = Number.parseInt(row.Reps, 10)
  const weight = Number.parseFloat(row["Weight (lbs)"])

  if (!dateStr || !workoutName || !exerciseName || !Number.isFinite(setNum)) continue

  const key = `${dateStr}||${workoutName}`
  if (!grouped.has(key)) grouped.set(key, [])
  grouped.get(key).push({
    dateStr,
    workoutName,
    exerciseName,
    setIndex: Math.max(0, setNum - 1),
    reps: Number.isFinite(reps) ? reps : 0,
    weight: Number.isFinite(weight) ? weight : 0,
  })
}

let createdWorkouts = 0
let createdExercises = 0
let insertedSets = 0
let updatedSets = 0
let skippedDuplicates = 0
let processedWorkouts = 0
const totalWorkouts = grouped.size

for (const [key, sessionRows] of grouped.entries()) {
  const [dateStr, workoutName] = key.split("||")
  processedWorkouts += 1
  if (processedWorkouts % 10 === 1 || processedWorkouts === totalWorkouts) {
    console.log(`Processing ${processedWorkouts}/${totalWorkouts}: ${dateStr} ${workoutName}`)
  }

  let workout = await loadWorkoutForDate(dateStr, workoutName)
  if (!workout) {
    workout = await createWorkout(dateStr, workoutName)
    createdWorkouts += 1
  }

  const exercises = await loadExercises(workout.id)
  const exerciseMap = new Map()
  exercises.forEach((ex) => {
    exerciseMap.set(ex.name.toLowerCase(), ex)
  })

  const exerciseRows = new Map()
  sessionRows.forEach((row) => {
    const nameKey = row.exerciseName.toLowerCase()
    if (!exerciseRows.has(nameKey)) exerciseRows.set(nameKey, [])
    exerciseRows.get(nameKey).push(row)
  })

  let nextSortIndex = exercises.length
  for (const [nameKey, rowsForExercise] of exerciseRows.entries()) {
    let exercise = exerciseMap.get(nameKey)
    if (!exercise) {
      const targetSets = rowsForExercise.length
      const inserted = await insertExercise(workout.id, rowsForExercise[0].exerciseName, nextSortIndex, targetSets)
      exercise = inserted
      exerciseMap.set(nameKey, inserted)
      nextSortIndex += 1
      createdExercises += 1
    }
  }

  const exerciseList = Array.from(exerciseMap.values())
  const existingSets = await loadSetsByExercise(exerciseList.map((ex) => ex.id))
  const existingByExerciseAndIndex = new Map()
  existingSets.forEach((set) => {
    existingByExerciseAndIndex.set(`${set.workout_exercise_id}:${set.set_index}`, set)
  })

  for (const [nameKey, rowsForExercise] of exerciseRows.entries()) {
    const exercise = exerciseMap.get(nameKey)
    if (!exercise) continue
    const toInsert = []
    for (const row of rowsForExercise) {
      const existing = existingByExerciseAndIndex.get(`${exercise.id}:${row.setIndex}`)
      if (existing) {
        const same =
          Number(existing.reps ?? 0) === Number(row.reps ?? 0) &&
          Number(existing.weight ?? 0) === Number(row.weight ?? 0)
        if (same) {
          skippedDuplicates += 1
          continue
        }
        await withRetry(`update set ${exercise.id}#${row.setIndex}`, async () => {
          const res = await supabase
            .from("workout_sets")
            .update({
              reps: row.reps,
              weight: row.weight,
              completed: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
          if (res.error) throw res.error
          return res
        })
        updatedSets += 1
      } else {
        toInsert.push({
          workout_exercise_id: exercise.id,
          set_index: row.setIndex,
          reps: row.reps,
          weight: row.weight,
          completed: true,
          updated_at: new Date().toISOString(),
        })
      }
    }

    if (toInsert.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize)
        await withRetry(`insert sets ${exercise.id} ${i}`, async () => {
          const res = await supabase.from("workout_sets").insert(chunk)
          if (res.error) throw res.error
          return res
        })
        insertedSets += chunk.length
      }
    }
  }

  await updateWorkoutStats(workout.id)
}

console.log("Import complete")
console.log(JSON.stringify({ createdWorkouts, createdExercises, insertedSets, updatedSets, skippedDuplicates }, null, 2))
