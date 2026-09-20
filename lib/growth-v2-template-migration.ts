/**
 * One-time migration that folds Growth v2 template changes into routines that
 * were already snapshotted into localStorage by resetRoutinesToGrowthV2().
 *
 * getRoutines() reads the stored snapshot, so editing GROWTH_V2_ROUTINES alone
 * never reaches an install that has already been seeded. The alternative — the
 * Settings "Reset to Growth v2" button — also wipes the schedule and any
 * user-created routines, so it is too blunt for a template tweak.
 *
 * The ops below are surgical and idempotent: they touch only the named slots
 * and leave user reordering, custom routines, and completed history untouched.
 * New exercise definitions are read from GROWTH_V2_ROUTINES so set/rep targets
 * live in exactly one place.
 */

import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import type { RoutineExercise, WorkoutRoutine } from "@/lib/routine-storage"

const MIGRATION_KEY = "growth_v2_template_migration_v2"
const CORE_DROP_KEY = "solidcore_core_drop_v1"
const ROUTINES_KEY = "workout_routines_v2"

/**
 * Direct core work moved to Solidcore (Wed + Sun), so these no longer seed into
 * any session. Matched on lower(trim(name)) — the same normalisation the coach
 * notes use — because the stored snapshots spell them several ways and some
 * carry a "(superset)" qualifier that names the pairing, not a different
 * movement.
 *
 * This only stops them being *seeded*. Historical workout_exercises and
 * workout_sets rows are untouched: the record of what was lifted is immutable.
 */
export const RETIRED_CORE_EXERCISES = [
  "cable crunch",
  "cable crunch (superset)",
  "hanging leg raise",
  "hanging leg raise (superset)",
  "side crunch (roman chair)",
  "oblique cable crunch",
] as const

const RETIRED_CORE_SET = new Set<string>(RETIRED_CORE_EXERCISES)

export function isRetiredCoreExercise(name: string | null | undefined): boolean {
  return RETIRED_CORE_SET.has((name ?? "").trim().toLowerCase())
}

/**
 * Drops the retired core slots from every stored routine.
 *
 * Unlike the slot ops above this deliberately reaches into user-created
 * routines too: the movements are gone from the program, not from one template,
 * and leaving them seeded anywhere would keep putting sets on the screen that
 * are no longer meant to be done. Pure, and exported for tests.
 */
export function dropRetiredCoreExercises(routines: WorkoutRoutine[]): {
  routines: WorkoutRoutine[]
  changed: boolean
} {
  let changed = false

  const next = routines.map((routine) => {
    if (!Array.isArray(routine.exercises)) return routine
    const exercises = routine.exercises.filter((exercise) => !isRetiredCoreExercise(exercise?.name))
    if (exercises.length === routine.exercises.length) return routine
    changed = true
    return { ...routine, exercises, updatedAt: new Date().toISOString() }
  })

  return { routines: next, changed }
}

type TemplateOp =
  /** Swap one slot for another, keeping its position in the exercise order. */
  | { kind: "replace"; removeId: string; addId: string }
  /** Drop a slot entirely. */
  | { kind: "remove"; removeId: string }
  /** Insert a slot directly after another one (appended if the anchor is gone). */
  | { kind: "insertAfter"; afterId: string; addId: string }
  /** Pull an existing slot's set/rep targets back in line with the plan. */
  | { kind: "resync"; id: string }

const OPS: Array<{ routineId: string; routineName: string; ops: TemplateOp[] }> = [
  {
    routineId: "growth-v2-upper-1",
    routineName: "Upper 1 – Chest + Lats",
    // Delts machine drops its fourth set.
    ops: [{ kind: "resync", id: "upper1-delts" }],
  },
  {
    routineId: "growth-v2-shoulders-arms",
    routineName: "Shoulders & Arms – Joint-Smart",
    ops: [{ kind: "resync", id: "sa-delts" }],
  },
  {
    routineId: "growth-v2-legs-2",
    routineName: "Legs 2 – Glutes + Hamstrings",
    ops: [{ kind: "replace", removeId: "legs2-single-rdl", addId: "legs2-seated-hip-abduction" }],
  },
  {
    routineId: "growth-v2-upper-2",
    routineName: "Upper 2 – Back Thickness + Chest",
    ops: [
      { kind: "remove", removeId: "upper2-decline-knee" },
      { kind: "insertAfter", afterId: "upper2-overhand-row", addId: "upper2-neutral-grip-row" },
      // Shares the Shoulders & Arms slot id so both days report one history.
      { kind: "insertAfter", afterId: "upper2-preacher-hammer", addId: "sa-bayesian" },
    ],
  },
]

/** Looks up a slot definition in the plan, preferring the routine that owns it. */
function findPlanExercise(routineId: string, exerciseId: string): RoutineExercise | null {
  const owning = GROWTH_V2_ROUTINES.find((routine) => routine.id === routineId)
  const fromOwning = owning?.exercises.find((exercise) => exercise.id === exerciseId)
  if (fromOwning) return fromOwning
  for (const routine of GROWTH_V2_ROUTINES) {
    const match = routine.exercises.find((exercise) => exercise.id === exerciseId)
    if (match) return match
  }
  return null
}

function applyOp(
  exercises: RoutineExercise[],
  op: TemplateOp,
  routineId: string
): { exercises: RoutineExercise[]; changed: boolean } {
  if (op.kind === "remove") {
    const next = exercises.filter((exercise) => exercise.id !== op.removeId)
    return { exercises: next, changed: next.length !== exercises.length }
  }

  if (op.kind === "resync") {
    const index = exercises.findIndex((exercise) => exercise.id === op.id)
    if (index === -1) return { exercises, changed: false }
    const definition = findPlanExercise(routineId, op.id)
    if (!definition) return { exercises, changed: false }
    const current = exercises[index]
    if (
      current.targetSets === definition.targetSets &&
      current.targetReps === definition.targetReps
    ) {
      return { exercises, changed: false }
    }
    // Only the targets: the slot keeps its position, its name and anything the
    // user set on it.
    const next = [...exercises]
    next.splice(index, 1, {
      ...current,
      targetSets: definition.targetSets,
      targetReps: definition.targetReps,
    })
    return { exercises: next, changed: true }
  }

  // Already applied (or hand-added by the user) — never insert a duplicate.
  if (exercises.some((exercise) => exercise.id === op.addId)) {
    return { exercises, changed: false }
  }

  const definition = findPlanExercise(routineId, op.addId)
  if (!definition) return { exercises, changed: false }

  if (op.kind === "replace") {
    const index = exercises.findIndex((exercise) => exercise.id === op.removeId)
    if (index === -1) return { exercises, changed: false }
    const next = [...exercises]
    next.splice(index, 1, { ...definition })
    return { exercises: next, changed: true }
  }

  const anchor = exercises.findIndex((exercise) => exercise.id === op.afterId)
  const next = [...exercises]
  next.splice(anchor === -1 ? next.length : anchor + 1, 0, { ...definition })
  return { exercises: next, changed: true }
}

/** Pure core, exported for tests. */
export function applyGrowthV2TemplateOps(routines: WorkoutRoutine[]): {
  routines: WorkoutRoutine[]
  changed: boolean
} {
  let changed = false

  const next = routines.map((routine) => {
    const target = OPS.find(
      (entry) => entry.routineId === routine.id || entry.routineName === routine.name
    )
    if (!target || !Array.isArray(routine.exercises)) return routine

    let exercises = routine.exercises
    let routineChanged = false
    for (const op of target.ops) {
      const result = applyOp(exercises, op, target.routineId)
      exercises = result.exercises
      routineChanged = routineChanged || result.changed
    }

    if (!routineChanged) return routine
    changed = true
    return { ...routine, exercises, updatedAt: new Date().toISOString() }
  })

  return { routines: next, changed }
}

export function runGrowthV2TemplateMigration(): void {
  if (typeof window === "undefined") return

  // Two independently stamped passes: the slot ops have already run on most
  // installs, and the core drop shipped later, so they cannot share a key
  // without re-running ops that are done.
  const needsSlotOps = !localStorage.getItem(MIGRATION_KEY)
  const needsCoreDrop = !localStorage.getItem(CORE_DROP_KEY)
  if (!needsSlotOps && !needsCoreDrop) return

  const raw = localStorage.getItem(ROUTINES_KEY)
  if (raw) {
    try {
      const stored = JSON.parse(raw)
      if (Array.isArray(stored)) {
        let routines = stored as WorkoutRoutine[]
        let changed = false

        if (needsSlotOps) {
          const result = applyGrowthV2TemplateOps(routines)
          routines = result.routines
          changed = changed || result.changed
        }

        if (needsCoreDrop) {
          const result = dropRetiredCoreExercises(routines)
          routines = result.routines
          changed = changed || result.changed
        }

        if (changed) localStorage.setItem(ROUTINES_KEY, JSON.stringify(routines))
      }
    } catch {
      /* leave the stored routines alone if they don't parse */
    }
  }

  const stamp = new Date().toISOString()
  if (needsSlotOps) localStorage.setItem(MIGRATION_KEY, stamp)
  if (needsCoreDrop) localStorage.setItem(CORE_DROP_KEY, stamp)
}
