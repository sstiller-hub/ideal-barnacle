import { supabase } from "@/lib/supabase"
import type { CoachNote } from "@/lib/coach-notes"
import type { WorkoutRoutine } from "@/lib/routine-storage"
import { getExerciseHistory, getLatestPerformance } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"

/**
 * Two gyms, one program.
 *
 * SoWa (Boston) is home: every routine is written against its machines. At
 * BodyStrong (Cape) a machine exercise is logged under its own name,
 * "<SoWa name> [Cape]", so every name-keyed system (history, prefill, PRs,
 * stall detection, machine settings) keeps the two load scales apart without
 * knowing gyms exist. Free-weight and bodyweight lifts keep their name and
 * share history across both gyms.
 *
 * Cross-gym comparison lives in Supabase: `exercise_variants` maps each
 * movement to its Cape machine, and `v_gym_calibration` computes a Cape/SoWa
 * e1RM ratio per movement from logged sessions.
 */

export type Gym = "sowa" | "bodystrong"

export const GYM_LABELS: Record<Gym, { name: string; place: string }> = {
  sowa: { name: "SoWa", place: "Boston" },
  bodystrong: { name: "BodyStrong", place: "Cape" },
}

export const CAPE_SUFFIX = " [Cape]"

/** Sessions on a Cape machine before its conversion ratio is trusted. */
export const CALIBRATION_SESSIONS = 2

export function isCapeName(name: string | null | undefined): boolean {
  return (name ?? "").trim().endsWith(CAPE_SUFFIX)
}

export function stripGymSuffix(name: string): string {
  const trimmed = name.trim()
  return trimmed.endsWith(CAPE_SUFFIX) ? trimmed.slice(0, -CAPE_SUFFIX.length).trim() : trimmed
}

export function toCapeName(name: string): string {
  return isCapeName(name) ? name.trim() : `${name.trim()}${CAPE_SUFFIX}`
}

/** Matches exercise_variants.movement and v_gym_calibration.movement. */
export function gymMovementKey(name: string): string {
  return stripGymSuffix(name).toLowerCase()
}

/** A session is a Cape session when any exercise carries the Cape name. */
export function detectSessionGym(exercises: Array<{ name?: string }> | null | undefined): Gym {
  return (exercises ?? []).some((exercise) => isCapeName(exercise?.name)) ? "bodystrong" : "sowa"
}

export type ExerciseVariant = {
  movement: string
  machine_name: string | null
  shares_history: boolean
  calibration_status: "calibrated" | "needs_calibration" | "tbd"
  notes: string | null
}

export type GymCalibration = {
  movement: string
  cape_sessions: number
  ratio: number | null
}

export type CapeContext = {
  variants: Map<string, ExerciseVariant>
  calibration: Map<string, GymCalibration>
}

const CACHE_KEY = "akt_cape_context_v1"

function readCache(): CapeContext | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { variants: ExerciseVariant[]; calibration: GymCalibration[] }
    return toContext(parsed.variants ?? [], parsed.calibration ?? [])
  } catch {
    return null
  }
}

function writeCache(variants: ExerciseVariant[], calibration: GymCalibration[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ variants, calibration }))
  } catch {
    // Storage full or blocked: the live fetch still worked, nothing to do.
  }
}

function toContext(variants: ExerciseVariant[], calibration: GymCalibration[]): CapeContext {
  return {
    variants: new Map(variants.map((variant) => [variant.movement, variant])),
    calibration: new Map(
      calibration.map((row) => [
        row.movement,
        { ...row, ratio: row.ratio === null ? null : Number(row.ratio), cape_sessions: Number(row.cape_sessions) },
      ])
    ),
  }
}

/**
 * The Cape machine map plus current calibration ratios. Falls back to the
 * last good copy in localStorage so a Cape session can start offline.
 */
export async function fetchCapeContext(): Promise<CapeContext> {
  const cached = readCache()
  if (!supabase) return cached ?? toContext([], [])
  try {
    const [variantsRes, calibrationRes] = await Promise.all([
      supabase
        .from("exercise_variants")
        .select("movement, machine_name, shares_history, calibration_status, notes")
        .eq("gym", "bodystrong"),
      supabase.from("v_gym_calibration").select("movement, cape_sessions, ratio"),
    ])
    if (variantsRes.error || calibrationRes.error) return cached ?? toContext([], [])
    const variants = (variantsRes.data ?? []) as ExerciseVariant[]
    const calibration = (calibrationRes.data ?? []) as GymCalibration[]
    writeCache(variants, calibration)
    return toContext(variants, calibration)
  } catch {
    return cached ?? toContext([], [])
  }
}

function usesCapeMachine(name: string, context: CapeContext): boolean {
  const variant = context.variants.get(gymMovementKey(name))
  return Boolean(variant && !variant.shares_history)
}

function latestTopWeight(name: string): number | null {
  const latest = getLatestPerformance(name)
  if (!latest?.sets) return null
  const weights = latest.sets
    .filter((set) => isSetEligibleForStats(set))
    .map((set) => set.weight)
    .filter((weight): weight is number => typeof weight === "number" && weight > 0)
  return weights.length > 0 ? Math.max(...weights) : null
}

function roundToFive(weight: number): number {
  return Math.max(0, Math.round(weight / 5) * 5)
}

/**
 * The routine as it runs at BodyStrong. Machine exercises take their Cape
 * name; the first time one is done there, its starting weight is the SoWa
 * weight scaled by the calibration ratio (or the SoWa weight itself when
 * there is no ratio yet, to be corrected by the calibration session).
 */
export function buildCapeRoutine(routine: WorkoutRoutine, context: CapeContext): WorkoutRoutine {
  return {
    ...routine,
    exercises: routine.exercises.map((exercise) => {
      const sowaName = stripGymSuffix(exercise.name)
      if (!usesCapeMachine(sowaName, context)) return { ...exercise, name: sowaName }

      const capeName = toCapeName(sowaName)
      const capeExercise = { ...exercise, id: `${exercise.id.replace(/@cape$/, "")}@cape`, name: capeName }
      if (getExerciseHistory(capeName).length > 0) return capeExercise

      const sowaWeight = latestTopWeight(sowaName)
      if (sowaWeight === null) return capeExercise
      const ratio = context.calibration.get(gymMovementKey(sowaName))?.ratio ?? 1
      return { ...capeExercise, targetWeight: roundToFive(sowaWeight * ratio) }
    }),
  }
}

/**
 * The in-workout card for a Cape machine: which machine to use, and either
 * calibration instructions or how its loads compare to SoWa. Shaped as a
 * coach note so it renders in the existing note slot; ids start with "gym:"
 * so dismissal stays local.
 */
export function capeNoteForExercise(name: string, context: CapeContext): CoachNote | null {
  if (!isCapeName(name)) return null
  const key = gymMovementKey(name)
  const variant = context.variants.get(key)
  if (!variant) return null
  const calibration = context.calibration.get(key)
  const sessions = calibration?.cape_sessions ?? 0
  const calibrated = sessions >= CALIBRATION_SESSIONS && calibration?.ratio != null
  const machine = variant.machine_name ?? "Cape machine"
  const remaining = Math.max(1, CALIBRATION_SESSIONS - sessions)

  let detail: string
  if (calibrated) {
    const pct = Math.round(((calibration!.ratio as number) - 1) * 100)
    detail =
      pct === 0
        ? "Loads here match SoWa."
        : `Loads here run ${Math.abs(pct)}% ${pct > 0 ? "heavier" : "lighter"} than SoWa for the same effort.`
  } else {
    detail = `Calibration: work up to 2 reps in reserve at your normal rep target and log honestly. ${remaining} more Cape ${remaining === 1 ? "session" : "sessions"} sets the conversion.`
  }
  if (variant.notes) detail = `${detail} ${variant.notes}.`

  const now = new Date().toISOString()
  return {
    id: `gym:${key}`,
    user_id: "",
    created_at: now,
    source_date: now.slice(0, 10),
    scope: "exercise",
    target: key,
    kind: calibrated ? "reminder" : "flag",
    body: calibrated ? machine : `${machine}: calibrate`,
    detail,
    resolve_rule: { type: "manual" },
  }
}
