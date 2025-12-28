const WARMUP_MARKERS = ["warm up", "warmup", "warm-up", "wu", "activation", "primer", "ramp", "ramping", "prep"]

export function isWarmupExercise(name: string): boolean {
  const normalized = name.toLowerCase()
  return WARMUP_MARKERS.some((marker) => normalized.includes(marker))
}
