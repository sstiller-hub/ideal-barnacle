import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const USER_ID = process.argv[2]
const QUERY = (process.argv[3] || "").toLowerCase()

if (!USER_ID || !QUERY) {
  console.error("Usage: node scripts/find-exercise-variants.mjs <USER_ID> <query>")
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

  const names = new Map()
  for (const batch of chunk(workoutIds, 500)) {
    const { data, error } = await supabase
      .from("workout_exercises")
      .select("name")
      .in("workout_id", batch)
    if (error) throw error
    ;(data || []).forEach((row) => {
      const name = row.name || ""
      if (!name) return
      if (name.toLowerCase().includes(QUERY)) {
        names.set(name, (names.get(name) || 0) + 1)
      }
    })
  }

  const results = [...names.entries()].sort((a, b) => b[1] - a[1])
  if (results.length === 0) {
    console.log(`No exercise names found containing "${QUERY}".`)
    return
  }
  console.log(`Exercise names containing "${QUERY}":`)
  results.forEach(([name, count]) => {
    console.log(`- ${name}: ${count}`)
  })
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
