import type { CompletedWorkout } from "./workout-storage"
import { isSetEligibleForStats } from "./set-validation"

export function formatWorkoutAsText(workout: CompletedWorkout): string {
  const date = new Date(workout.startedAt ?? workout.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  const durationSeconds =
    workout.duration ??
    (workout.startedAt && workout.endedAt
      ? Math.floor((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 1000)
      : null)

  const durationLabel = durationSeconds
    ? (() => {
        const h = Math.floor(durationSeconds / 3600)
        const m = Math.floor((durationSeconds % 3600) / 60)
        return h > 0 ? `${h}h ${m}m` : `${m} min`
      })()
    : null

  const totalVolume = workout.stats?.totalVolume

  const lines: string[] = []

  lines.push(`${workout.name} — ${date}`)
  const meta = [
    totalVolume ? `Volume: ${Math.round(totalVolume).toLocaleString()} lbs` : null,
    durationLabel ? `Duration: ${durationLabel}` : null,
  ]
    .filter(Boolean)
    .join(" | ")
  if (meta) lines.push(meta)
  lines.push("")

  for (const exercise of workout.exercises) {
    lines.push(exercise.name)
    const completedSets = (exercise.sets ?? []).filter((s) => isSetEligibleForStats(s))
    if (completedSets.length === 0) {
      lines.push("  (no sets recorded)")
    } else {
      completedSets.forEach((set, i) => {
        const weight = set.weight ?? 0
        const reps = set.reps ?? 0
        lines.push(`  Set ${i + 1}: ${weight} lbs × ${reps}`)
      })
    }
    lines.push("")
  }

  return lines.join("\n").trimEnd()
}

export async function copyWorkoutToClipboard(workout: CompletedWorkout): Promise<void> {
  const text = formatWorkoutAsText(workout)
  await navigator.clipboard.writeText(text)
}
