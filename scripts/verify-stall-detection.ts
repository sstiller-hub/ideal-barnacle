/**
 * One-off verification: run lib/progressive-overload against a JSON dump of
 * real workout history (per-exercise sessions) and report what would be flagged.
 *
 * Usage: npx tsx scripts/verify-stall-detection.ts <dump-file>
 * The dump is the saved output of a SQL aggregate producing rows of
 * { exercise_id, name, workout_id, performed_at, sets: [[reps, weight], ...] }.
 */
import { readFileSync } from "node:fs"
import { detectProgressStall, buildStallAlertContent, type ExerciseSessionInput } from "../lib/progressive-overload"

let raw = readFileSync(process.argv[2], "utf8")
// The saved MCP output embeds the payload as a JSON-escaped string
if (raw.includes('\\"')) raw = raw.replace(/\\n/g, "\n").replace(/\\"/g, '"')
const start = raw.indexOf("[{")
const end = raw.lastIndexOf("}]")
if (start === -1 || end === -1) throw new Error("No JSON array found in dump file")
const outer = JSON.parse(raw.slice(start, end + 2)) as Array<{ payload: unknown }>
const rows = (outer[0]?.payload ?? outer) as Array<{
  exercise_id: string
  name: string
  workout_id: string
  performed_at: string
  sets: Array<[number | null, string | number | null]>
}>

const byExercise = new Map<string, { name: string; sessions: ExerciseSessionInput[] }>()
for (const row of rows) {
  let entry = byExercise.get(row.exercise_id)
  if (!entry) {
    entry = { name: row.name, sessions: [] }
    byExercise.set(row.exercise_id, entry)
  }
  entry.sessions.push({
    workoutId: row.workout_id,
    performedAt: row.performed_at,
    sets: row.sets.map(([reps, weight]) => ({
      reps,
      weight: weight === null ? null : Number(weight),
      completed: true,
    })),
  })
}

let flagged = 0
for (const [exerciseId, { name, sessions }] of byExercise) {
  const result = detectProgressStall(sessions)
  if (!result) continue
  flagged++
  const content = buildStallAlertContent(exerciseId, name, result)
  console.log(`\n[${content.flag} tier ${content.tier}] ${name} (${exerciseId})`)
  console.log(`  metric=${result.metric} stalled=${result.stalledSessions}/${result.sessionsAnalyzed} sessions`)
  console.log(`  message: ${content.message}`)
}
console.log(`\n${byExercise.size} exercises analyzed, ${flagged} would be flagged`)
