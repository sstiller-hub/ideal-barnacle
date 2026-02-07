import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const USER_ID = process.argv[2]

if (!USER_ID) {
  console.error("Usage: node scripts/report-exercise-dupes.mjs <USER_ID>")
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

const normalizeName = (name) => {
  if (!name) return ""
  let text = name.toLowerCase()
  text = text.replace(/[’'"]/g, "")
  text = text.replace(/[-/()]/g, " ")
  text = text.replace(/&/g, " and ")
  text = text.replace(/\bdb\b/g, "dumbbell")
  text = text.replace(/\bbb\b/g, "barbell")
  text = text.replace(/\bkb\b/g, "kettlebell")
  text = text.replace(/\bb\/w\b/g, "bodyweight")
  text = text.replace(/\bbwt\b/g, "bodyweight")
  text = text.replace(/\bbody weight\b/g, "bodyweight")
  text = text.replace(/\bpress\b/g, "press")
  text = text.replace(/\s+/g, " ").trim()
  return text
}

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

const fetchExercises = async (workoutIds) => {
  const rows = []
  for (const batch of chunk(workoutIds, 500)) {
    const { data, error } = await supabase
      .from("workout_exercises")
      .select("id, workout_id, exercise_id, name")
      .in("workout_id", batch)
    if (error) throw error
    if (data?.length) rows.push(...data)
  }
  return rows
}

const run = async () => {
  const workoutIds = await fetchWorkoutIds()
  if (workoutIds.length === 0) {
    console.log("No workouts found for user.")
    return
  }

  const exercises = await fetchExercises(workoutIds)
  const countsByRaw = new Map()
  const byNormalized = new Map()

  for (const ex of exercises) {
    const raw = ex.name || ""
    const normalized = normalizeName(raw)
    countsByRaw.set(raw, (countsByRaw.get(raw) || 0) + 1)
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, new Map())
    const bucket = byNormalized.get(normalized)
    bucket.set(raw, (bucket.get(raw) || 0) + 1)
  }

  const clusters = []
  for (const [normalized, variants] of byNormalized.entries()) {
    if (variants.size <= 1) continue
    const sorted = [...variants.entries()].sort((a, b) => b[1] - a[1])
    const total = sorted.reduce((sum, [, count]) => sum + count, 0)
    clusters.push({
      normalized,
      total,
      variants: sorted.map(([name, count]) => ({ name, count })),
      canonical: sorted[0]?.[0] || normalized,
    })
  }

  clusters.sort((a, b) => b.total - a.total)

  const report = {
    userId: USER_ID,
    generatedAt: new Date().toISOString(),
    totalWorkouts: workoutIds.length,
    totalExercises: exercises.length,
    duplicateGroups: clusters.length,
    clusters,
  }

  const outDir = path.resolve(process.cwd(), "reports")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, "exercise-dupe-report.json")
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const mdLines = [
    `# Exercise Dedupe Report`,
    ``,
    `User: ${USER_ID}`,
    `Generated: ${report.generatedAt}`,
    ``,
    `Duplicate Groups: ${report.duplicateGroups}`,
    ``,
  ]
  for (const cluster of clusters) {
    mdLines.push(`## ${cluster.canonical} (${cluster.total})`)
    mdLines.push(`Normalized: \`${cluster.normalized}\``)
    mdLines.push(`Variants:`)
    for (const variant of cluster.variants) {
      mdLines.push(`- ${variant.name}: ${variant.count}`)
    }
    mdLines.push(``)
  }
  const mdPath = path.join(outDir, "exercise-dupe-report.md")
  fs.writeFileSync(mdPath, mdLines.join("\n"))

  console.log(`Report written to ${jsonPath}`)
  console.log(`Report written to ${mdPath}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
