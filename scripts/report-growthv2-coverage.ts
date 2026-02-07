import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"
import { GROWTH_V2_ROUTINES } from "../lib/growth-v2-plan"

const USER_ID = process.argv[2]

if (!USER_ID) {
  console.error("Usage: node --import tsx scripts/report-growthv2-coverage.ts <USER_ID>")
  process.exit(1)
}

const readEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, "utf8")
  const env: Record<string, string> = {}
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

const normalizeName = (name: string) => {
  let text = (name || "").toLowerCase()
  text = text.replace(/[’'"]/g, "")
  text = text.replace(/[-/()]/g, " ")
  text = text.replace(/&/g, " and ")
  text = text.replace(/\bdb\b/g, "dumbbell")
  text = text.replace(/\bbb\b/g, "barbell")
  text = text.replace(/\bkb\b/g, "kettlebell")
  text = text.replace(/\bb\/w\b/g, "bodyweight")
  text = text.replace(/\bbwt\b/g, "bodyweight")
  text = text.replace(/\bbody weight\b/g, "bodyweight")
  text = text.replace(/\s+/g, " ").trim()
  return text
}

const fetchWorkoutIds = async () => {
  const all: string[] = []
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

const chunk = <T,>(arr: T[], size: number) => {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

const fetchExerciseNames = async (workoutIds: string[]) => {
  const names: string[] = []
  for (const batch of chunk(workoutIds, 500)) {
    const { data, error } = await supabase
      .from("workout_exercises")
      .select("name")
      .in("workout_id", batch)
    if (error) throw error
    if (data?.length) {
      names.push(...data.map((row) => row.name).filter(Boolean))
    }
  }
  return names
}

const run = async () => {
  const workoutIds = await fetchWorkoutIds()
  if (workoutIds.length === 0) {
    console.log("No workouts found for user.")
    return
  }

  const historyNames = await fetchExerciseNames(workoutIds)
  const historySet = new Set(historyNames.map(normalizeName))

  const programNames = GROWTH_V2_ROUTINES.flatMap((routine) =>
    routine.exercises.map((ex: any) => ex.name)
  )
  const programSet = new Set(programNames.map(normalizeName))

  let inProgram = 0
  const inProgramNames: string[] = []
  for (const raw of historyNames) {
    const normalized = normalizeName(raw)
    if (programSet.has(normalized)) {
      inProgram += 1
      inProgramNames.push(raw)
    }
  }

  const distinctHistory = new Set(historyNames.map(normalizeName))
  const distinctInProgram = new Set(inProgramNames.map(normalizeName))

  console.log(`Distinct exercises in history: ${distinctHistory.size}`)
  console.log(`Distinct exercises in Growth v2: ${programSet.size}`)
  console.log(`Distinct history exercises that are in Growth v2: ${distinctInProgram.size}`)

  const notInProgram = [...distinctHistory].filter((name) => !programSet.has(name))
  if (notInProgram.length > 0) {
    const sample = notInProgram.slice(0, 20)
    console.log(`Examples not in Growth v2 (${notInProgram.length} total):`)
    sample.forEach((name) => console.log(`- ${name}`))
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
