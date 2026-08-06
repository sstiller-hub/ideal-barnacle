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

const MIGRATION_KEY = "growth_v2_template_migration_v1"
const ROUTINES_KEY = "workout_routines_v2"

type TemplateOp =
  /** Swap one slot for another, keeping its position in the exercise order. */
  | { kind: "replace"; removeId: string; addId: string }
  /** Drop a slot entirely. */
  | { kind: "remove"; removeId: string }
  /** Insert a slot directly after another one (appended if the anchor is gone). */
  | { kind: "insertAfter"; afterId: string; addId: string }

const OPS: Array<{ routineId: string; routineName: string; ops: TemplateOp[] }> = [
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
  if (localStorage.getItem(MIGRATION_KEY)) return

  const raw = localStorage.getItem(ROUTINES_KEY)
  if (raw) {
    try {
      const stored = JSON.parse(raw)
      if (Array.isArray(stored)) {
        const { routines, changed } = applyGrowthV2TemplateOps(stored as WorkoutRoutine[])
        if (changed) localStorage.setItem(ROUTINES_KEY, JSON.stringify(routines))
      }
    } catch {
      /* leave the stored routines alone if they don't parse */
    }
  }

  localStorage.setItem(MIGRATION_KEY, new Date().toISOString())
}
