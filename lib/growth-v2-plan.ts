import type { WorkoutRoutine } from "@/lib/routine-storage"
import type { ScheduledWorkout } from "@/lib/schedule-storage"

const nowIso = () => new Date().toISOString()

const ex = (p: {
  id: string
  name: string
  type: "strength" | "cardio" | "other"
  targetSets?: number
  targetReps?: string
  targetWeight?: number
  notes?: string
}) => p

export const GROWTH_V2_ROUTINES: WorkoutRoutine[] = [
  {
    id: "growth-v2-legs-1",
    name: "Legs 1 – Quad Dominant",
    description: "Quad-dominant hypertrophy day.",
    estimatedTime: "50 min",
    category: "Growth v2",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    exercises: [
      ex({ id: "legs1-hip-adduction", name: "Hip Adduction", type: "strength", targetSets: 3, targetReps: "12-15" }),
      ex({ id: "legs1-pendulum", name: "Arsenal Pendulum Squat", type: "strength", targetSets: 3, targetReps: "6-9" }),
      ex({
        id: "legs1-bb-split-squat",
        name: "Booty Builder Split Squat Machine",
        type: "strength",
        targetSets: 3,
        targetReps: "8-10",
      }),
      ex({
        id: "legs1-leg-ext",
        name: "Leg Extension",
        type: "strength",
        targetSets: 3,
        targetReps: "8-10 / 8-10 / 12-15",
        notes: "Last set: slow or drop set.",
      }),
      ex({ id: "legs1-seated-ham", name: "Seated Hamstring Curl", type: "strength", targetSets: 3, targetReps: "6-8" }),
      ex({
        id: "legs1-single-ham",
        name: "Single-Leg Hamstring Curl",
        type: "strength",
        targetSets: 2,
        targetReps: "8-10",
      }),
      ex({ id: "legs1-donkey-calf", name: "Arsenal Donkey Calf Raise", type: "strength", targetSets: 4, targetReps: "10-12" }),
    ],
  },
  {
    id: "growth-v2-upper-1",
    name: "Upper 1 – Chest + Lats",
    description: "Chest + lats focus, elbow-friendly triceps.",
    estimatedTime: "57 min",
    category: "Growth v2",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    exercises: [
      ex({ id: "upper1-incline-smith", name: "Incline Smith Machine Bench", type: "strength", targetSets: 4, targetReps: "6-9" }),
      ex({ id: "upper1-chest-press", name: "Machine Chest Press", type: "strength", targetSets: 3, targetReps: "8-10" }),
      ex({ id: "upper1-lat-pd", name: "Lat Pulldown", type: "strength", targetSets: 3, targetReps: "8-12" }),
      ex({
        id: "upper1-hi-lo-row",
        name: "Bench-Supported Hi-Lo Cable Row",
        type: "strength",
        targetSets: 3,
        targetReps: "10-12",
      }),
      ex({
        id: "upper1-arsenal-fly",
        name: "Arsenal Reloaded Incline Fly",
        type: "strength",
        targetSets: 3,
        targetReps: "12-15",
      }),
      ex({
        id: "upper1-tri-machine",
        name: "Technogym Triceps Extension Machine",
        type: "strength",
        targetSets: 3,
        targetReps: "10-12",
      }),
      ex({ id: "upper1-delts", name: "Technogym Delts Machine", type: "strength", targetSets: 4, targetReps: "12-20" }),
      ex({ id: "upper1-cable-crunch", name: "Cable Crunch", type: "other", targetSets: 3, targetReps: "12" }),
      ex({ id: "upper1-hanging-leg-raise", name: "Hanging Leg Raise", type: "other", targetSets: 3, targetReps: "12" }),
    ],
  },
  {
    id: "growth-v2-legs-2",
    name: "Legs 2 – Glutes + Hamstrings",
    description: "Posterior chain day (glutes + hamstrings).",
    estimatedTime: "57 min",
    category: "Growth v2",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    exercises: [
      ex({ id: "legs2-seated-ham", name: "Seated Hamstring Curl", type: "strength", targetSets: 3, targetReps: "8-10" }),
      ex({ id: "legs2-hip-thrust", name: "Booty Builder Hip Thrust", type: "strength", targetSets: 4, targetReps: "6-10" }),
      ex({
        id: "legs2-belt-rdl",
        name: "Belt Squat RDL",
        type: "strength",
        targetSets: 3,
        targetReps: "8-10",
        notes: "Cue hips back; hamstrings first.",
      }),
      ex({
        id: "legs2-single-rdl",
        name: "Single-Leg RDL (supported)",
        type: "strength",
        targetSets: 2,
        targetReps: "8-10",
      }),
      ex({
        id: "legs2-glute-ext",
        name: "Glute-Biased Extension",
        type: "strength",
        targetSets: 3,
        targetReps: "12-15",
      }),
      ex({
        id: "legs2-leg-ext-light",
        name: "Single-Leg Leg Extension (light)",
        type: "strength",
        targetSets: 2,
        targetReps: "12-15",
        targetWeight: 70,
      }),
      ex({ id: "legs2-calf", name: "Standing / Machine Calf Raise", type: "strength", targetSets: 4, targetReps: "10-12" }),
      ex({ id: "legs2-cable-crunch", name: "Cable Crunch", type: "other", targetSets: 3, targetReps: "12-15" }),
    ],
  },
  {
    id: "growth-v2-upper-2",
    name: "Upper 2 – Back Thickness + Chest",
    description: "Row-driven upper day + upper chest, arms, core.",
    estimatedTime: "45 min",
    category: "Growth v2",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    exercises: [
      ex({ id: "upper2-overhand-row", name: "Overhand Row", type: "strength", targetSets: 4, targetReps: "6-9" }),
      ex({ id: "upper2-incline-db", name: "Incline Dumbbell Bench", type: "strength", targetSets: 4, targetReps: "6-9" }),
      ex({ id: "upper2-rear-delt", name: "Rear Delt Cable Fly", type: "strength", targetSets: 3, targetReps: "12-15" }),
      ex({ id: "upper2-chest-fly", name: "Machine Chest Fly", type: "strength", targetSets: 3, targetReps: "10-15" }),
      ex({
        id: "upper2-tri-dip",
        name: "Tricep Dip Machine",
        type: "strength",
        targetSets: 3,
        targetReps: "8-12",
        notes: "Upright torso; stop before shoulder dominance.",
      }),
      ex({
        id: "upper2-preacher-hammer",
        name: "Preacher-Supported DB Hammer Curl",
        type: "strength",
        targetSets: 3,
        targetReps: "8-12",
      }),
      ex({ id: "upper2-side-crunch", name: "Side Crunch (Roman Chair)", type: "other", targetSets: 3, targetReps: "12-15" }),
      ex({ id: "upper2-decline-knee", name: "Decline Bench Knee Raise", type: "other", targetSets: 3, targetReps: "12-15" }),
    ],
  },
  {
    id: "growth-v2-shoulders-arms",
    name: "Shoulders & Arms – Joint-Smart",
    description: "Delt-driven + elbow-friendly triceps + biceps + controlled core.",
    estimatedTime: "54 min",
    category: "Growth v2",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    exercises: [
      ex({
        id: "sa-shoulder-press-hi",
        name: "Technogym Plate-Loaded Shoulder Press",
        type: "strength",
        targetSets: 4,
        targetReps: "6-10",
      }),
      ex({ id: "sa-incline-press", name: "Incline Machine Chest Press", type: "strength", targetSets: 3, targetReps: "8-10" }),
      ex({
        id: "sa-rear-delt-single",
        name: "Rear Delt Fly (single-arm machine)",
        type: "strength",
        targetSets: 3,
        targetReps: "12-15",
      }),
      ex({ id: "sa-delts", name: "Technogym Delts Machine", type: "strength", targetSets: 4, targetReps: "12-20" }),
      ex({
        id: "sa-tri-machine",
        name: "Technogym Triceps Extension Machine",
        type: "strength",
        targetSets: 3,
        targetReps: "10-12",
      }),
      ex({ id: "sa-bayesian", name: "Bayesian Cable Curl", type: "strength", targetSets: 3, targetReps: "8-12" }),
      ex({ id: "sa-rotation", name: "Cable Rotation", type: "other", targetSets: 3, targetReps: "10-12", notes: "Control > weight." }),
      ex({ id: "sa-oblique-crunch", name: "Oblique Cable Crunch", type: "other", targetSets: 3, targetReps: "12-15", notes: "Control > weight." }),
    ],
  },
]

export const GROWTH_V2_WEEKLY: Record<number, ScheduledWorkout | null> = {
  0: null, // Sun
  1: { routineId: "growth-v2-legs-1", routineName: "Legs 1 – Quad Dominant" }, // Mon
  2: { routineId: "growth-v2-upper-1", routineName: "Upper 1 – Chest + Lats" }, // Tue
  3: null, // Wed rest
  4: { routineId: "growth-v2-legs-2", routineName: "Legs 2 – Glutes + Hamstrings" }, // Thu
  5: { routineId: "growth-v2-upper-2", routineName: "Upper 2 – Back Thickness + Chest" }, // Fri
  6: { routineId: "growth-v2-shoulders-arms", routineName: "Shoulders & Arms – Joint-Smart" }, // Sat
}
