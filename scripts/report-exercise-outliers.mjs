import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const USER_ID = process.argv[2]
const TARGET_EXERCISE = process.argv[3]?.toLowerCase() || ""
const slug = TARGET_EXERCISE
  ? TARGET_EXERCISE.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  : "all"

if (!USER_ID) {
  console.error("Usage: node scripts/report-exercise-outliers.mjs <USER_ID> [exercise-filter]")
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

const pageFetch = async (table, select, matchField, matchValue, pageSize = 1000) => {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq(matchField, matchValue)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const quantile = (sortedValues, q) => {
  if (!sortedValues.length) return 0
  const pos = (sortedValues.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base])
  }
  return sortedValues[base]
}

const normalizeName = (name) => (name || "").toLowerCase().replace(/\s+/g, " ").trim()

const run = async () => {
  const workouts = await pageFetch("workouts", "id, performed_at, completed_at, created_at", "user_id", USER_ID)
  if (!workouts.length) {
    console.log("No workouts found.")
    return
  }

  const workoutIds = workouts.map((w) => w.id)
  const workoutDateById = new Map(
    workouts.map((w) => [w.id, w.performed_at || w.completed_at || w.created_at || ""])
  )

  const exercises = []
  for (const ids of chunk(workoutIds, 40)) {
    const { data, error } = await supabase
      .from("workout_exercises")
      .select("id, workout_id, name")
      .in("workout_id", ids)
    if (error) throw error
    if (data?.length) exercises.push(...data)
  }
  if (!exercises.length) {
    console.log("No workout exercises found.")
    return
  }

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]))
  const exerciseIds = exercises.map((e) => e.id)

  const sets = []
  for (const ids of chunk(exerciseIds, 40)) {
    const { data, error } = await supabase
      .from("workout_sets")
      .select("id, workout_exercise_id, reps, weight, completed")
      .in("workout_exercise_id", ids)
    if (error) throw error
    if (data?.length) sets.push(...data)
  }
  if (!sets.length) {
    console.log("No exercise sets found.")
    return
  }

  const rowsByExerciseInstance = new Map()
  for (const s of sets) {
    if (s.completed === false) continue
    const ex = exerciseMap.get(s.workout_exercise_id)
    if (!ex?.name || !ex.workout_id) continue
    if (TARGET_EXERCISE && !normalizeName(ex.name).includes(TARGET_EXERCISE)) continue
    const reps = Number(s.reps)
    const weight = Number(s.weight)
    if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps < 0 || weight < 0) continue
    const key = s.workout_exercise_id
    if (!rowsByExerciseInstance.has(key)) {
      rowsByExerciseInstance.set(key, {
        workoutExerciseId: key,
        workoutId: ex.workout_id,
        date: workoutDateById.get(ex.workout_id) || "",
        name: ex.name,
        totalVolume: 0,
        maxWeight: 0,
        totalReps: 0,
      })
    }
    const agg = rowsByExerciseInstance.get(key)
    agg.totalVolume += reps * weight
    agg.totalReps += reps
    if (weight > agg.maxWeight) agg.maxWeight = weight
  }

  const grouped = new Map()
  for (const row of rowsByExerciseInstance.values()) {
    const key = normalizeName(row.name)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }

  const findings = []
  for (const [normalizedName, samples] of grouped.entries()) {
    if (samples.length < 8) continue
    const volumes = samples.map((s) => s.totalVolume).sort((a, b) => a - b)
    const topWeights = samples.map((s) => s.maxWeight).sort((a, b) => a - b)
    const q1Vol = quantile(volumes, 0.25)
    const q3Vol = quantile(volumes, 0.75)
    const iqrVol = q3Vol - q1Vol
    const upperVol = q3Vol + iqrVol * 1.5
    const q1Weight = quantile(topWeights, 0.25)
    const q3Weight = quantile(topWeights, 0.75)
    const iqrWeight = q3Weight - q1Weight
    const upperWeight = q3Weight + iqrWeight * 1.5

    for (const s of samples) {
      const reasons = []
      if (iqrVol > 0 && s.totalVolume > upperVol) reasons.push("volume")
      if (iqrWeight > 0 && s.maxWeight > upperWeight) reasons.push("weight")
      if (!reasons.length) continue
      findings.push({
        ...s,
        normalizedName,
        sampleCount: samples.length,
        reasons,
        upperVol,
        upperWeight,
      })
    }
  }

  findings.sort((a, b) => (b.totalVolume - b.upperVol) - (a.totalVolume - a.upperVol))

  const report = {
    userId: USER_ID,
    generatedAt: new Date().toISOString(),
    targetExercise: TARGET_EXERCISE || null,
    totalWorkouts: workouts.length,
    totalExerciseInstances: rowsByExerciseInstance.size,
    outlierCount: findings.length,
    findings,
  }

  const outDir = path.resolve(process.cwd(), "reports")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, `exercise-outlier-report-${slug}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const lines = [
    "# Exercise Outlier Report",
    "",
    `User: ${USER_ID}`,
    `Generated: ${report.generatedAt}`,
    `Exercise Filter: ${TARGET_EXERCISE || "none"}`,
    `Outliers: ${report.outlierCount}`,
    "",
  ]
  for (const f of findings.slice(0, 200)) {
    lines.push(`## ${f.name} (${f.date || "no-date"})`)
    lines.push(`- Workout Exercise ID: ${f.workoutExerciseId}`)
    lines.push(`- Reasons: ${f.reasons.join(", ")}`)
    lines.push(`- Volume: ${Math.round(f.totalVolume)} (upper fence ${Math.round(f.upperVol)})`)
    lines.push(`- Top Weight: ${Math.round(f.maxWeight)} (upper fence ${Math.round(f.upperWeight)})`)
    lines.push(`- Sample Count: ${f.sampleCount}`)
    lines.push("")
  }
  const mdPath = path.join(outDir, `exercise-outlier-report-${slug}.md`)
  fs.writeFileSync(mdPath, lines.join("\n"))

  console.log(`Report written to ${jsonPath}`)
  console.log(`Report written to ${mdPath}`)
  console.log(`Outliers found: ${report.outlierCount}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
