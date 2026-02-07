import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const USER_ID = process.argv[2]
const REPORT_PATH = process.argv[3] || "reports/exercise-dupe-report.json"

if (!USER_ID) {
  console.error("Usage: node scripts/merge-exercise-dupes.mjs <USER_ID> [report.json]")
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

if (!fs.existsSync(REPORT_PATH)) {
  console.error(`Report not found: ${REPORT_PATH}`)
  process.exit(1)
}

const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"))
const clusters = report.clusters || []

if (clusters.length === 0) {
  console.log("No duplicate clusters to merge.")
  process.exit(0)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const fetchWorkoutIds = async () => {
  const all = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", USER_ID)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data.map((row) => row.id))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

const chunk = (arr, size) => {
  const result = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

const run = async () => {
  const workoutIds = await fetchWorkoutIds()
  if (workoutIds.length === 0) {
    console.log("No workouts found for user.")
    return
  }

  let updates = 0
  for (const cluster of clusters) {
    const canonical = cluster.canonical
    const variants = (cluster.variants || []).map((v) => v.name).filter((name) => name !== canonical)
    if (variants.length === 0) continue

    for (const batch of chunk(workoutIds, 500)) {
      const { data, error } = await supabase
        .from("workout_exercises")
        .update({ name: canonical })
        .in("workout_id", batch)
        .in("name", variants)
        .select("id")
      if (error) throw error
      updates += data?.length || 0
    }
  }

  console.log(`Updated ${updates} workout_exercises rows to canonical names.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
