export type CompletedSetRecord = {
  reps: number | null
  weight: number | null
  completed: boolean
  setIndex?: number
  exerciseId: string
  exerciseName: string
  workoutId: string
}

export type BestSetResult = {
  value: number
  set: CompletedSetRecord
}

export function isCompletedSet(set: CompletedSetRecord): boolean {
  if (!set.completed) return false
  if (typeof set.reps !== "number" || typeof set.weight !== "number") return false
  if (set.reps <= 0 || set.weight <= 0) return false
  return true
}

export function calculateSetVolume(reps: number, weight: number): number {
  return reps * weight
}

export function calculateE1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export function computeWorkoutVolume(sets: CompletedSetRecord[]): number {
  return sets.reduce((sum, set) => {
    if (!isCompletedSet(set)) return sum
    return sum + calculateSetVolume(set.reps as number, set.weight as number)
  }, 0)
}

export function computeExerciseSessionVolumes(
  sets: CompletedSetRecord[]
): Map<string, number> {
  const volumes = new Map<string, number>()
  sets.forEach((set) => {
    if (!isCompletedSet(set)) return
    const current = volumes.get(set.exerciseId) ?? 0
    volumes.set(
      set.exerciseId,
      current + calculateSetVolume(set.reps as number, set.weight as number)
    )
  })
  return volumes
}

export function computeBestE1rmSet(
  sets: CompletedSetRecord[]
): BestSetResult | null {
  let best: BestSetResult | null = null
  sets.forEach((set) => {
    if (!isCompletedSet(set)) return
    const value = calculateE1rm(set.weight as number, set.reps as number)
    if (!best || value > best.value) {
      best = { value, set }
    }
  })
  return best
}

export function computeWeekOverWeek(
  currentVolume: number,
  previousVolume: number
): { delta: number; percent: number } {
  const delta = currentVolume - previousVolume
  const percent = previousVolume > 0 ? (delta / previousVolume) * 100 : 0
  return { delta, percent }
}

export function isNewBest(currentValue: number, previousValue: number | null): boolean {
  if (previousValue === null || Number.isNaN(previousValue)) return true
  return currentValue > previousValue
}
