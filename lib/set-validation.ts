export const REP_MIN = 1
export const REP_MAX = 40

export type SetValidationFlag = "missing_reps" | "missing_weight" | "reps_hard_invalid" | "rep_outlier"

export type BasicSet = {
  reps?: number | null
  weight?: number | null
  completed?: boolean
  validationFlags?: string[]
  isOutlier?: boolean
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isNaN(value) ? null : value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value)
}

export function isMissingReps(reps: number | null | undefined): boolean {
  return reps === null || reps === undefined || Number.isNaN(reps) || reps < REP_MIN
}

export function isMissingWeight(weight: number | null | undefined): boolean {
  return weight === null || weight === undefined || Number.isNaN(weight)
}

export function getMissingFlags(reps: number | null | undefined, weight: number | null | undefined): SetValidationFlag[] {
  const flags: SetValidationFlag[] = []
  if (isMissingReps(reps)) flags.push("missing_reps")
  if (isMissingWeight(weight)) flags.push("missing_weight")
  return flags
}

export function getValidationFlags(params: {
  reps: number | null | undefined
  weight: number | null | undefined
  isOutlier?: boolean
}): SetValidationFlag[] {
  const flags = getMissingFlags(params.reps, params.weight)
  if (isValidNumber(params.reps) && (params.reps < REP_MIN || params.reps > REP_MAX)) {
    flags.push("reps_hard_invalid")
  }
  if (params.isOutlier) flags.push("rep_outlier")
  return flags
}

export function isSetIncomplete(set: BasicSet): boolean {
  return isMissingReps(set.reps) || isMissingWeight(set.weight)
}

export function isIncomplete(flags: string[]): boolean {
  return flags.includes("missing_reps") || flags.includes("missing_weight")
}

export function isStatInvalid(flags: string[]): boolean {
  return (
    flags.includes("missing_reps") ||
    flags.includes("missing_weight") ||
    flags.includes("reps_hard_invalid") ||
    flags.includes("rep_outlier")
  )
}

export function isSetEligibleForStats(set: BasicSet): boolean {
  if (!set.completed) return false
  if (!isValidNumber(set.reps) || !isValidNumber(set.weight)) return false
  if (set.validationFlags && isStatInvalid(set.validationFlags)) return false
  if (!set.validationFlags && (isMissingReps(set.reps) || isMissingWeight(set.weight))) return false
  return true
}

export function parseTargetReps(targetReps?: string): { min: number; max: number; suggested: number } | null {
  if (!targetReps) return null
  const matches = targetReps.match(/\d+/g)
  if (!matches || matches.length === 0) return null
  const numbers = matches.map((val) => Number(val)).filter((val) => !Number.isNaN(val))
  if (numbers.length === 0) return null
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  const suggested = Math.round((min + max) / 2)
  return { min, max, suggested }
}

export function parseTargetWeight(targetWeight?: string): number | null {
  if (targetWeight === null || targetWeight === undefined) return null
  if (typeof targetWeight !== "string") {
    return typeof targetWeight === "number" && !Number.isNaN(targetWeight) ? targetWeight : null
  }
  if (!targetWeight) return null
  const match = targetWeight.match(/\d+(\.\d+)?/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isNaN(value) ? null : value
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function getSetFlags(params: {
  reps: number | null | undefined
  weight: number | null | undefined
  exerciseName?: string
  targetReps?: string
  historyReps?: number[]
}): { flags: SetValidationFlag[]; isIncomplete: boolean; isHardInvalid: boolean; suggestedReps?: number } {
  const { reps, weight, targetReps, historyReps = [] } = params
  const flags = getMissingFlags(reps, weight)
  let isHardInvalid = false
  let suggestedReps: number | undefined

  if (isValidNumber(reps) && (reps < REP_MIN || reps > REP_MAX)) {
    flags.push("reps_hard_invalid")
    isHardInvalid = true
  }

  const cleanedHistory = historyReps.filter((value) => value >= REP_MIN && value <= REP_MAX)
  const typical = median(cleanedHistory.slice(-10))
  const target = parseTargetReps(targetReps)
  if (isValidNumber(reps) && !isHardInvalid) {
    if (typical && reps >= typical * 2) {
      flags.push("rep_outlier")
      suggestedReps = Math.round(typical)
    } else if (target && reps > target.max + 10) {
      flags.push("rep_outlier")
      suggestedReps = target.suggested
    }
  }

  return {
    flags,
    isIncomplete: isIncomplete(flags),
    isHardInvalid,
    suggestedReps: suggestedReps !== reps ? suggestedReps : undefined,
  }
}

export function getDefaultSetValues(params: {
  sets: BasicSet[]
  targetReps?: string
  targetWeight?: string
}): { reps: number | null; weight: number | null } {
  const { sets, targetReps, targetWeight } = params
  const lastCompleted = [...sets]
    .reverse()
    .find((set) => set.completed && isSetEligibleForStats(set))

  if (lastCompleted && isValidNumber(lastCompleted.reps) && isValidNumber(lastCompleted.weight)) {
    return { reps: lastCompleted.reps, weight: lastCompleted.weight }
  }

  const parsedTargetReps = parseTargetReps(targetReps)
  const parsedTargetWeight = parseTargetWeight(targetWeight)
  const suggestedReps =
    parsedTargetReps && parsedTargetReps.suggested >= REP_MIN
      ? Math.min(parsedTargetReps.suggested, REP_MAX)
      : null
  return {
    reps: suggestedReps,
    weight: parsedTargetWeight ?? null,
  }
}
