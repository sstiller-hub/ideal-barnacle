import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const USER_ID = process.argv[2]
const EXERCISE_NAME = (process.argv[3] || "hip adduction").trim()
const APPLY = process.argv.includes("--apply")

if (!USER_ID) {
  console.error(
    "Usage: node scripts/cleanup-hip-adduction-duplicate-sets.mjs <USER_ID> [exercise-name] [--apply]"
  )
  process.exit(1)
}

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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const normalize = (name) => (name || "").toLowerCase().replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim()

const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const isMirroredSixSetPattern = (sets) => {
  if (sets.length !== 6) return false
  const byIndex = new Map()
  for (const set of sets) {
    const idx = Number(set.set_index)
    if (!byIndex.has(idx)) byIndex.set(idx, [])
    byIndex.get(idx).push(set)
  }
  if (byIndex.size !== 3) return false
  for (const idx of [0, 1, 2]) {
    const pair = byIndex.get(idx)
    if (!pair || pair.length !== 2) return false
    const [a, b] = pair
    if (
      Number(a.reps) !== Number(b.reps) ||
      Number(a.weight) !== Number(b.weight) ||
      Boolean(a.completed) !== Boolean(b.completed)
    ) {
      return false
    }
  }
  return true
}

const run = async () => {
  const { data: workouts, error: workoutErr } = await supabase
    .from("workouts")
    .select("id")
    .eq("user_id", USER_ID)
  if (workoutErr) throw workoutErr
  const workoutIds = (workouts || []).map((w) => w.id)
  if (!workoutIds.length) {
    console.log("No workouts found.")
    return
  }

  const { data: exerciseRows, error: exerciseErr } = await supabase
    .from("workout_exercises")
    .select("id, workout_id, name")
    .ilike("name", `%${EXERCISE_NAME}%`)
  if (exerciseErr) throw exerciseErr
  const workoutIdSet = new Set(workoutIds)
  const targetNormalized = normalize(EXERCISE_NAME)
  const targetExercises = (exerciseRows || []).filter(
    (e) => workoutIdSet.has(e.workout_id) && normalize(e.name) === targetNormalized
  )
  if (!targetExercises.length) {
    console.log(`No ${EXERCISE_NAME} workout_exercises found.`)
    return
  }

  const sets = []
  for (const ids of chunk(targetExercises.map((e) => e.id), 200)) {
    const { data, error } = await supabase
      .from("workout_sets")
      .select("id, workout_exercise_id, set_index, reps, weight, completed, updated_at")
      .in("workout_exercise_id", ids)
      .order("set_index", { ascending: true })
      .order("updated_at", { ascending: true })
    if (error) throw error
    if (data?.length) sets.push(...data)
  }

  const byExerciseId = new Map()
  for (const set of sets) {
    if (!byExerciseId.has(set.workout_exercise_id)) byExerciseId.set(set.workout_exercise_id, [])
    byExerciseId.get(set.workout_exercise_id).push(set)
  }

  const toDelete = []
  const flagged = []
  for (const ex of targetExercises) {
    const exSets = byExerciseId.get(ex.id) || []
    if (!isMirroredSixSetPattern(exSets)) continue
    flagged.push(ex.id)
    const pairByIndex = new Map()
    for (const set of exSets) {
      const idx = Number(set.set_index)
      if (!pairByIndex.has(idx)) pairByIndex.set(idx, [])
      pairByIndex.get(idx).push(set)
    }
    for (const idx of [0, 1, 2]) {
      const pair = pairByIndex.get(idx).sort((a, b) => String(a.id).localeCompare(String(b.id)))
      toDelete.push(pair[1].id)
    }
  }

  console.log(`${EXERCISE_NAME} exercise instances scanned: ${targetExercises.length}`)
  console.log(`Mirrored 6-set duplicates found: ${flagged.length}`)
  console.log(`Rows to delete: ${toDelete.length}`)

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to delete rows.")
    return
  }

  if (toDelete.length === 0) {
    console.log("Nothing to delete.")
    return
  }

  for (const ids of chunk(toDelete, 200)) {
    const { error } = await supabase.from("workout_sets").delete().in("id", ids)
    if (error) throw error
  }
  console.log(`Deleted ${toDelete.length} duplicate workout_sets rows.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
