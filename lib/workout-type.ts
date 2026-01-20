export type WorkoutType = "Upper" | "Lower" | "Rest"

export function deriveWorkoutType(name?: string | null): WorkoutType {
  if (!name) return "Rest"
  const normalized = name.toLowerCase()
  if (normalized.includes("lower") || normalized.includes("leg") || normalized.includes("glute") || normalized.includes("ham")) {
    return "Lower"
  }
  if (normalized.includes("upper")) return "Upper"
  if (normalized.includes("full")) return "Upper"
  return "Upper"
}
