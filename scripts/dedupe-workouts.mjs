import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const USER_ID = process.argv[2] || "5eef3bfd-d598-4a20-aa66-5bedaebcb376"

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

const fetchWorkouts = async () => {
  const all = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("workouts")
      .select("id, name, performed_at")
      .eq("user_id", USER_ID)
      .order("performed_at", { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

const deleteWorkout = async (workoutId) => {
  const { data: exercises, error: exErr } = await supabase
    .from("workout_exercises")
    .select("id")
    .eq("workout_id", workoutId)
  if (exErr) throw exErr

  const exerciseIds = (exercises || []).map((ex) => ex.id)
  if (exerciseIds.length > 0) {
    const { error: setErr } = await supabase
      .from("workout_sets")
      .delete()
      .in("workout_exercise_id", exerciseIds)
    if (setErr) throw setErr

    const { error: delExErr } = await supabase
      .from("workout_exercises")
      .delete()
      .in("id", exerciseIds)
    if (delExErr) throw delExErr
  }

  const { error: wErr } = await supabase.from("workouts").delete().eq("id", workoutId)
  if (wErr) throw wErr
}

const toDateKey = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "unknown"
  return d.toISOString().slice(0, 10)
}

const run = async () => {
  const workouts = await fetchWorkouts()
  const groups = new Map()
  for (const workout of workouts) {
    const dateKey = toDateKey(workout.performed_at)
    const key = `${dateKey}||${workout.name}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(workout)
  }

  const deletions = []
  for (const [key, list] of groups.entries()) {
    if (list.length <= 1) continue
    list.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime())
    const [keep, ...toDelete] = list
    deletions.push({ key, keep, toDelete })
  }

  console.log(`Found ${deletions.length} duplicate groups.`)
  let deletedWorkouts = 0

  for (const entry of deletions) {
    const { key, keep, toDelete } = entry
    console.log(`Keeping ${keep.id} for ${key}, deleting ${toDelete.length}`)
    for (const workout of toDelete) {
      await deleteWorkout(workout.id)
      deletedWorkouts += 1
    }
  }

  console.log(JSON.stringify({ deletedWorkouts }, null, 2))
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
