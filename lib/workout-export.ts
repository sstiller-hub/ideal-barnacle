import type { CompletedWorkout } from "./workout-storage"
import { isValidNumber } from "./set-validation"
import { plural } from "./utils"

// Looser than isSetEligibleForStats: a set that was performed but flagged as an
// outlier still happened, so it belongs in an export meant for re-entry
// elsewhere. Stats exclusion is a separate question from "did I do this set".
function wasPerformed(set: { reps?: number | null; weight?: number | null; completed?: boolean }) {
  return Boolean(set.completed) && isValidNumber(set.reps) && isValidNumber(set.weight)
}

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
    totalVolume ? `Volume: ${Math.round(totalVolume).toLocaleString()} ${plural(Math.round(totalVolume), "lb", "lbs")}` : null,
    durationLabel ? `Duration: ${durationLabel}` : null,
  ]
    .filter(Boolean)
    .join(" | ")
  if (meta) lines.push(meta)
  lines.push("")

  for (const exercise of workout.exercises) {
    lines.push(exercise.name)
    const completedSets = (exercise.sets ?? []).filter(wasPerformed)
    if (completedSets.length === 0) {
      lines.push("  (no sets recorded)")
    } else {
      completedSets.forEach((set, i) => {
        const weight = set.weight ?? 0
        const reps = set.reps ?? 0
        lines.push(`  Set ${i + 1}: ${weight} ${plural(weight, "lb", "lbs")} × ${reps}`)
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
