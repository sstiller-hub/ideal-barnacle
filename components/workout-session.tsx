"use client"

import type React from "react"

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import { type WorkoutRoutine, getRoutineById, saveRoutine } from "@/lib/routine-storage"
import {
  getExerciseHistory,
  getLatestPerformance,
  getMostRecentCompletedSetPerformance,
  getWorkoutHistory,
  normalizeExerciseName,
  saveWorkout,
} from "@/lib/workout-storage"
import { toast } from "sonner"
import {
  getDefaultSetValues,
  getSetFlags,
  isIncomplete,
  isMissingReps,
  isMissingWeight,
  parseNumber,
  isSetEligibleForStats,
  isSetIncomplete,
  REP_MAX,
  REP_MIN,
} from "@/lib/set-validation"
import { getOrCreateActiveSession, upsertSet } from "@/lib/supabase-session-sync"
import { supabase } from "@/lib/supabase"
import { isWarmupExercise } from "@/lib/exercise-heuristics"
import {
  getCurrentInProgressSession,
  deleteSession,
  deleteSetsForSession,
  type WorkoutSession,
  saveSession,
  saveCurrentSessionId,
} from "@/lib/autosave-workout-storage"
import {
  createWorkoutDraft,
  markWorkoutError,
  markWorkoutPending,
  updateWorkoutDraft,
  upsertSet as upsertSetDraft,
  deleteSet as deleteSetDraft,
  upsertAllSets,
  getWorkoutDraft,
  type WorkoutSetDraft,
  type SyncState,
} from "@/lib/workout-draft-storage"
import { attemptWorkoutSync, ensureWorkoutSync } from "@/lib/workout-sync"
import { clearActiveWorkoutRoute } from "@/lib/active-workout-route"
import { computeAverageSecondsPerSet, classifyPace } from "@/lib/workout-analytics"
import { getMachineSettings, saveMachineSettings } from "@/lib/machine-settings-storage"
import { loadExerciseSettings, saveExerciseSettings } from "@/lib/supabase-exercise-settings"
import { recordRestExtension, getRestExtensionTrend, type RestExtensionTrend } from "@/lib/rest-extension-storage"
import {
  ArrowLeft,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ListOrdered,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"
import { ReorderExercisesSheet } from "@/components/reorder-exercises-sheet"
import { StatUnit } from "@/components/ledger/stat-unit"
import { SessionClock } from "@/components/ledger/session-clock"
import { DeltaChip } from "@/components/ledger/delta-chip"
import { plural } from "@/lib/utils"
import { haptic, playRestChime, primeRestChime } from "@/lib/session-feedback"
import { CoachNoteList } from "@/components/coach-note-card"
import { useCoachNotes } from "@/hooks/useCoachNotes"
import type { CoachNote } from "@/lib/coach-notes"

type ExerciseRating = "thumbs_up" | "thumbs_down" | null

type Exercise = {
  id: string
  name: string
  targetSets: number
  targetReps: string
  targetWeight?: string
  restTime: number
  completed: boolean
  rating?: ExerciseRating
  machineSettings?: {
    seat?: string
  }
  sets: {
    id: string
    reps: number | null
    weight: number | null
    completed: boolean
    validationFlags?: string[]
    isOutlier?: boolean
    isIncomplete?: boolean
  }[]
  previousPerformance?: {
    weight: number
    avgReps: number
    progress: string
  }
}

// Run synchronous DOM-affecting reads (e.g. localStorage-backed UI state)
// before paint on the client, while falling back to useEffect on the server
// to avoid React's "useLayoutEffect does nothing on the server" warning.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

function extractRestSeconds(notes?: string): number {
  if (!notes) return 90
  const minutes = notes.match(/rest\s*(\d+)\s*m/i)
  const seconds = notes.match(/rest\s*(\d+)\s*s/i)
  if (minutes) return Number(minutes[1]) * 60
  if (seconds) return Number(seconds[1])
  return 90
}

// Headline volume in the ledger's k-vocabulary: "1.2K", "22.9K", "850".
function formatVolumeK(value: number): string {
  const abs = Math.abs(Math.round(value))
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}K`
  return `${abs}`
}

// Map the existing getSetComparison result onto DeltaChip props (§A4 table).
// Returns null when there is no chip to show (no-history or missing data).
function setComparisonToChip(
  comparison: { status: string } | null,
  set: { weight: number | null; reps: number | null },
  last: { weight: number; reps: number } | null,
): { tone: "good" | "neutral"; arrow?: "up" | "down"; value: string } | null {
  if (!comparison || comparison.status === "no-history") return null
  if (typeof set.weight !== "number" || typeof set.reps !== "number") return null
  switch (comparison.status) {
    case "pr":
      return { tone: "good", value: `PR · ${set.weight} × ${set.reps}` }
    case "progressed": {
      if (!last) return null
      const weightDelta = set.weight - last.weight
      const repsDelta = set.reps - last.reps
      const value = weightDelta > 0 ? `+${weightDelta} LB` : `+${repsDelta} ${plural(repsDelta, "REP", "REPS")}`
      return { tone: "good", arrow: "up", value }
    }
    case "matched":
      return { tone: "neutral", value: "MATCHED" }
    case "recovery":
      return { tone: "neutral", value: "RECOVERY" }
    default:
      return null
  }
}

// Some exercises are named for a specific machine that only accepts plates up
// to a certain size. Keyed by normalized exercise name → the heaviest plate
// (lb) that machine's pegs will take. Plates above the cap are excluded from
// the plate-math suggestion for that exercise.
const MAX_PLATE_BY_EXERCISE: Record<string, number> = {
  "arsenal reloaded incline fly": 25,
}

function getMaxPlateForExercise(name: string): number | null {
  return MAX_PLATE_BY_EXERCISE[normalizeExerciseName(name)] ?? null
}

function calculatePlates(
  weight: number,
  startingWeight: number,
  mode: "per-side" | "total",
  maxPlate: number | null = null,
): { plate: number; count: number }[] {
  const adjusted = Math.max(0, weight - startingWeight)
  const plateWeight = mode === "per-side" ? adjusted / 2 : adjusted

  if (plateWeight <= 0) return []

  const availablePlates = [45, 35, 25, 10, 5, 2.5].filter(
    (plate) => maxPlate === null || plate <= maxPlate,
  )
  const plates: { plate: number; count: number }[] = []
  let remaining = plateWeight

  for (const plate of availablePlates) {
    const count = Math.floor(remaining / plate)
    if (count > 0) {
      plates.push({ plate, count })
      remaining -= plate * count
    }
  }

  return plates
}

function getSetComparison(
  set: Exercise["sets"][number],
  last: { weight: number; reps: number } | null,
  maxHistoricalVolume: number,
) {
  if (!last) return null
  if (typeof set.weight !== "number" || typeof set.reps !== "number") {
    return { status: "no-history", message: `Last: ${last.weight} × ${last.reps}` }
  }

  const volume = set.weight * set.reps
  if (volume > maxHistoricalVolume) {
    return { status: "pr", message: "NEW PR!" }
  }

  if (set.weight > last.weight || (set.weight === last.weight && set.reps > last.reps)) {
    const weightDelta = set.weight - last.weight
    const repsDelta = set.reps - last.reps
    const delta =
      weightDelta > 0
        ? `${weightDelta} lb${weightDelta === 1 ? "" : "s"}`
        : `${repsDelta} rep${repsDelta === 1 ? "" : "s"}`
    return { status: "progressed", message: `+${delta}` }
  }

  if (set.weight === last.weight && set.reps === last.reps) {
    return { status: "matched", message: "Matched last time" }
  }

  return { status: "recovery", message: "Recovery set" }
}

function getExerciseLabel(name: string): string {
  const lower = name.trim().toLowerCase()
  if (lower === "leg extension (light)") {
    return "Single-Leg Leg Extension"
  }
  return name
}

function isMachineExercise(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.includes("machine") ||
    lower.includes("cable") ||
    lower.includes("smith") ||
    lower.includes("lever") ||
    lower.includes("hack") ||
    lower.includes("pendulum")
  )
}

function getRecentPerformanceSnapshots(
  exerciseName: string,
  history: any[],
  count = 3,
): Array<{ reps: number; weight: number }> {
  const normalizedName = normalizeExerciseName(exerciseName)
  const snapshots: Array<{ reps: number; weight: number }> = []

  for (const workout of history) {
    const exercise = workout.exercises?.find(
      (ex: any) => normalizeExerciseName(ex.name) === normalizedName,
    )
    if (!exercise?.sets) continue
    const validSets = exercise.sets.filter((set: any) => isSetEligibleForStats(set))
    if (validSets.length === 0) continue
    const firstSet = validSets[0]
    if (typeof firstSet.reps !== "number" || typeof firstSet.weight !== "number") continue
    snapshots.push({ reps: firstSet.reps, weight: firstSet.weight })
    if (snapshots.length >= count) break
  }

  return snapshots
}

function applyProgressiveOverload(
  snapshots: Array<{ reps: number; weight: number }>,
): { reps: number | null; weight: number | null; mode: "reps" | "weight" | null } {
  const latest = snapshots[0]
  if (!latest) return { reps: null, weight: null, mode: null }
  if (snapshots.length < 3) {
    return { reps: latest.reps, weight: latest.weight, mode: null }
  }

  const chronological = [...snapshots].reverse()
  const weightSteps = chronological.slice(1).map((set, idx) => set.weight - chronological[idx].weight)
  const repSteps = chronological.slice(1).map((set, idx) => set.reps - chronological[idx].reps)
  const repsStable = chronological.every((set) => set.reps === chronological[0].reps)
  const weightStable = chronological.every((set) => Math.abs(set.weight - chronological[0].weight) <= 0.5)

  const weightPattern = repsStable && weightSteps.every((step) => Math.abs(step - 5) <= 0.5)
  const repsPattern = weightStable && repSteps.every((step) => step === 1)

  if (weightPattern) {
    return { reps: latest.reps, weight: Math.max(0, latest.weight + 5), mode: "weight" }
  }

  if (repsPattern) {
    const nextReps = Math.min(REP_MAX, Math.max(REP_MIN, latest.reps + 1))
    return { reps: nextReps, weight: latest.weight, mode: "reps" }
  }

  return { reps: latest.reps, weight: latest.weight, mode: null }
}

type ExercisePageProps = {
  exercise: any
  exerciseIndex: number
  currentExerciseIndex: number
  exercisesCount: number
  isDeload: boolean
  showPlateCalc: boolean
  plateDisplayMode: "per-side" | "total"
  plateStartingWeight: number
  focusedInput: string | null
  validationTrigger: number
  repCapErrors: Record<string, boolean>
  sessionId: string | undefined
  userId: string | null
  maxSetVolumeByExercise: Map<string, number>
  updateExerciseMachineSetting: (exerciseIndex: number, field: "seat", value: string) => void
  handleTogglePlateCalc: () => void
  updateSetDataForExercise: (exerciseIndex: number, setIndex: number, field: "reps" | "weight", value: number | null) => void
  handleSetFieldFocus: (setId: string, field: "reps" | "weight") => void
  handleSetFieldBlur: (setId: string, field: "reps" | "weight") => void
  handleInputAutoSelect: (event: React.FocusEvent<HTMLInputElement>) => void
  setFocusedInput: (value: string | null) => void
  setRepCapErrors: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  setValidationTrigger: (value: number) => void
  completeSet: (setIndex: number, options?: { startRest?: boolean; exerciseIndex?: number }) => void
  rateExercise: (exerciseIndex: number, rating: ExerciseRating) => void
  endExerciseHere: (exerciseIndex: number) => void
  restoreTrimmedSets: (exerciseIndex: number) => void
  addSet: (exerciseIndex: number) => void
  setPlateDisplayMode: (mode: "per-side" | "total") => void
  setPlateStartingWeight: (value: number) => void
  onOpenExercise: (name: string) => void
  coachNotes: CoachNote[]
  onDismissCoachNote: (noteId: string) => void | Promise<boolean | void>
  registerWeightRef: (setId: string, node: HTMLInputElement | null) => void
  registerRepsRef: (setId: string, node: HTMLInputElement | null) => void
  focusSetField: (setId: string, field: "reps" | "weight") => void
  isRestDockOpen: boolean
  restDockHeight: number
}

// One carousel page (one exercise). Module-level + React.memo so a per-second
// clock tick (owned by SessionClock) never re-renders these pages, and so that
// mutating one exercise re-renders only that page (props are passed stable from
// the parent). Presentation only — all data mutations flow back through the
// handler props.
const ExercisePage = memo(function ExercisePage({
  exercise,
  exerciseIndex,
  currentExerciseIndex,
  exercisesCount,
  isDeload,
  showPlateCalc,
  plateDisplayMode,
  plateStartingWeight,
  focusedInput,
  validationTrigger,
  repCapErrors,
  sessionId,
  userId,
  maxSetVolumeByExercise,
  updateExerciseMachineSetting,
  handleTogglePlateCalc,
  updateSetDataForExercise,
  handleSetFieldFocus,
  handleSetFieldBlur,
  handleInputAutoSelect,
  setFocusedInput,
  setRepCapErrors,
  setValidationTrigger,
  completeSet,
  rateExercise,
  endExerciseHere,
  restoreTrimmedSets,
  addSet,
  setPlateDisplayMode,
  setPlateStartingWeight,
  onOpenExercise,
  coachNotes,
  onDismissCoachNote,
  registerWeightRef,
  registerRepsRef,
  focusSetField,
  isRestDockOpen,
  restDockHeight,
}: ExercisePageProps) {
  const exerciseCurrentSetIndex = exercise.sets.findIndex((set: any) => !set.completed)
  const activeSetIndex = exerciseCurrentSetIndex === -1 ? 0 : exerciseCurrentSetIndex
  const isExerciseComplete =
    exercise.sets.length > 0 &&
    exercise.sets.every((set: any) => set.completed && !isSetIncomplete(set))
  const isCompactSets = exercise.sets.length >= 4
  const canEditExercise = exerciseIndex === currentExerciseIndex || exerciseIndex < currentExerciseIndex
  const completedCount = exercise.sets.filter((set: any) => set.completed).length
  const hasIncompleteSets = exercise.sets.some((set: any) => !set.completed)
  const trimmedCount = Array.isArray(exercise.trimmedSets) ? exercise.trimmedSets.length : 0

  return (
    <div
      style={{
        scrollSnapAlign: "start",
        width: "100%",
        flexShrink: 0,
        paddingBottom: "120px",
        // Each page scrolls its own set column; the pager only scrolls across.
        // overflow-x must be pinned: overflow-y alone computes overflow-x to
        // auto, and a page that can scroll sideways (by even a pixel) captures
        // the horizontal swipe meant for the pager.
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        overscrollBehaviorY: "contain",
        WebkitOverflowScrolling: "touch",
      }}
      data-testid="exercise-page"
    >
      <div style={{ marginBottom: isCompactSets ? "10px" : "18px" }}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "9px",
              fontWeight: 600,
              letterSpacing: "0.2em",
              color: "var(--ink-50)",
            }}
          >
            EXERCISE {exerciseIndex + 1} OF {exercisesCount}
          </div>
          <div className="flex items-center gap-2">
            {exerciseIndex === currentExerciseIndex && isMachineExercise(exercise.name) && (
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={exercise.machineSettings?.seat ?? ""}
                onChange={(e) => void updateExerciseMachineSetting(exerciseIndex, "seat", e.target.value)}
                placeholder="Seat"
                aria-label="Seat setting"
                className="ios-chip transition-colors duration-150"
                style={{
                  padding: "5px 10px",
                  fontSize: "13px",
                  width: "62px",
                  textAlign: "center",
                }}
              />
            )}
            {/* Plates is a chip, not a bordered label button — it toggles a
                panel, which is exactly what an iOS filter chip does. */}
            <button
              onClick={() => {
                if (exerciseIndex !== currentExerciseIndex) return
                handleTogglePlateCalc()
              }}
              className="tap-target ios-chip transition-colors duration-150"
              data-open={showPlateCalc}
              aria-pressed={showPlateCalc}
              style={{ padding: "5px 10px", fontSize: "13px" }}
              type="button"
            >
              Plates
            </button>
          </div>
        </div>

        {isDeload && (
          <div
            style={{
              display: "inline-block",
              marginBottom: "8px",
              background: "var(--ink-02)",
              border: "1px solid var(--ink-08)",
              borderRadius: "var(--radius-flat)",
              padding: "3px 9px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "8px",
                fontWeight: 600,
                letterSpacing: "0.16em",
                color: "var(--ink-50)",
                textTransform: "uppercase",
              }}
            >
              Deload Week
            </span>
          </div>
        )}

        <h1
          style={{
            fontSize: "40px",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            lineHeight: "0.95",
            fontFamily: "var(--font-display)",
            color: "var(--ink-95)",
            cursor: "pointer",
          }}
          onClick={() => onOpenExercise(exercise.name)}
        >
          {getExerciseLabel(exercise.name)}
        </h1>

        <div
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "9px",
            fontWeight: 500,
            letterSpacing: "0.14em",
            color: "var(--ink-50)",
            marginTop: "8px",
          }}
        >
          {exercise.sets.length} {plural(exercise.sets.length, "SET", "SETS")}
          {exercise.targetReps ? ` · TARGET ${exercise.targetReps} ${plural(Number(exercise.targetReps), "REP", "REPS")}` : ""}
          {!isExerciseComplete && exercise.sets.length > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--ink-50)", fontWeight: 600 }}>
                NOW SET {activeSetIndex + 1}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Coach notes for this exercise — the one inserted slot in the Cover
          Flow page. Above the set list, below the title block, so it is read
          before the first set is logged and nothing else moves. */}
      <CoachNoteList
        notes={coachNotes}
        onDismiss={onDismissCoachNote}
        style={{ marginBottom: isCompactSets ? "12px" : "18px" }}
      />

      <div className="flex flex-col" style={{ gap: isCompactSets ? "14px" : "24px" }}>
        {exercise.sets.map((set: any, setIndex: number) => {
          const setKey = set.id ?? `${exercise.id}-${setIndex}`
          const isActiveExercise = exerciseIndex === currentExerciseIndex
          const isCurrentSet = isActiveExercise && setIndex === activeSetIndex
          const repCapError = repCapErrors[setKey] || set.validationFlags?.includes("reps_hard_invalid")
          const missingWeight = isMissingWeight(set.weight)
          const missingReps = isMissingReps(set.reps)
          const showMissing = Boolean(validationTrigger) && isCurrentSet && (missingWeight || missingReps)
          const focusedWeight = focusedInput === `${setKey}-weight`
          const focusedReps = focusedInput === `${setKey}-reps`
          const lastSet = getMostRecentCompletedSetPerformance(exercise.name, setIndex, sessionId)
          const comparison = getSetComparison(
            set,
            lastSet,
            maxSetVolumeByExercise.get(normalizeExerciseName(exercise.name)) ?? 0
          )
          const chip =
            isActiveExercise && typeof set.weight === "number" && typeof set.reps === "number"
              ? setComparisonToChip(comparison, set, lastSet)
              : null
          const plates =
            typeof set.weight === "number"
              ? calculatePlates(
                  set.weight,
                  plateStartingWeight,
                  plateDisplayMode,
                  getMaxPlateForExercise(exercise.name),
                )
              : []
          const isPlateSetActive =
            exerciseIndex === currentExerciseIndex &&
            !set.completed &&
            plates.length > 0 &&
            (isCurrentSet || focusedWeight || focusedReps)

          // Fixed geometry — density varies per exercise (set count), never per
          // set state. The 58pt / 33pt pairing is the handoff's full-density
          // target; crowded exercises step down rather than overflow.
          const inputHeight = isCompactSets ? "50px" : "58px"
          const inputFontSize = isCompactSets ? "27px" : "33px"
          const valueColor = set.completed
            ? "var(--ink-40)"
            : isCurrentSet
              ? "var(--ink-95)"
              : "var(--ink-50)"
          const weightBorder =
            showMissing && missingWeight
              ? "var(--ink-40)"
              : focusedWeight
                ? "var(--ink-20)"
                : isCurrentSet
                  ? "var(--ink-12)"
                  : "transparent"
          const repsBorder =
            repCapError || (showMissing && missingReps)
              ? "var(--ink-40)"
              : focusedReps
                ? "var(--ink-20)"
                : isCurrentSet
                  ? "var(--ink-12)"
                  : "transparent"
          const weightBg = focusedWeight ? "var(--ink-06)" : isCurrentSet ? "var(--ink-04)" : "var(--ink-02)"
          const repsBg = focusedReps ? "var(--ink-06)" : isCurrentSet ? "var(--ink-04)" : "var(--ink-02)"

          return (
            <div
              key={setKey}
              style={{
                paddingLeft: "14px",
                borderLeft: `2px solid ${isCurrentSet ? "rgba(255, 255, 255, 0.8)" : "var(--ink-06)"}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: isCompactSets ? "6px" : "10px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "8.5px",
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    color: isCurrentSet ? "var(--ink-85)" : "var(--ink-50)",
                  }}
                >
                  SET {String(setIndex + 1).padStart(2, "0")}
                </span>
                {isCurrentSet && (
                  <span
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "8px",
                      fontWeight: 600,
                      letterSpacing: "0.18em",
                      color: "var(--ink-50)",
                    }}
                  >
                    NOW
                  </span>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 44px",
                  gap: "12px",
                  alignItems: "stretch",
                }}
              >
                <input
                  type="number"
                  ref={(node) => {
                    if (set.id) registerWeightRef(set.id, node)
                  }}
                  value={set.weight ?? ""}
                  onChange={(e) => {
                    if (!canEditExercise) return
                    const raw = e.target.value
                    if (!raw.trim()) {
                      void updateSetDataForExercise(exerciseIndex, setIndex, "weight", null)
                      return
                    }
                    const parsed = parseNumber(raw)
                    if (parsed === null || parsed < 0) return
                    void updateSetDataForExercise(exerciseIndex, setIndex, "weight", parsed)
                  }}
                  onFocus={(e) => {
                    if (set.id) handleSetFieldFocus(set.id, "weight")
                    handleInputAutoSelect(e)
                    setFocusedInput(`${setKey}-weight`)
                  }}
                  onBlur={() => {
                    if (set.id) handleSetFieldBlur(set.id, "weight")
                    setFocusedInput(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    e.preventDefault()
                    if (set.id) focusSetField(set.id, "reps")
                  }}
                  inputMode="decimal"
                  enterKeyHint="next"
                  placeholder="—"
                  className="transition-colors duration-150"
                  disabled={!canEditExercise}
                  style={{
                    width: "100%",
                    background: weightBg,
                    border: `1px solid ${weightBorder}`,
                    borderRadius: "var(--radius-xs)",
                    height: inputHeight,
                    padding: "0 8px",
                    fontSize: inputFontSize,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: valueColor,
                    fontVariantNumeric: "tabular-nums",
                    outline: "none",
                    textAlign: "center",
                  }}
                />

                <input
                  type="number"
                  ref={(node) => {
                    if (set.id) registerRepsRef(set.id, node)
                  }}
                  value={set.reps ?? ""}
                  onChange={(e) => {
                    if (!canEditExercise) return
                    const raw = e.target.value
                    if (!raw.trim()) {
                      setRepCapErrors((prev) => ({ ...prev, [setKey]: false }))
                      void updateSetDataForExercise(exerciseIndex, setIndex, "reps", null)
                      return
                    }
                    const parsed = parseNumber(raw)
                    if (parsed === null) return
                    if (parsed > REP_MAX) {
                      setRepCapErrors((prev) => ({ ...prev, [setKey]: true }))
                      return
                    }
                    setRepCapErrors((prev) => ({ ...prev, [setKey]: false }))
                    const clamped = Math.max(REP_MIN, parsed)
                    void updateSetDataForExercise(exerciseIndex, setIndex, "reps", clamped)
                  }}
                  onFocus={(e) => {
                    if (set.id) handleSetFieldFocus(set.id, "reps")
                    handleInputAutoSelect(e)
                    setFocusedInput(`${setKey}-reps`)
                  }}
                  onBlur={() => {
                    if (set.id) handleSetFieldBlur(set.id, "reps")
                    setFocusedInput(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    e.preventDefault()
                    e.currentTarget.blur()
                    if (!canEditExercise || set.completed) return
                    if (isSetIncomplete(set) || repCapError) {
                      setValidationTrigger(Date.now())
                      return
                    }
                    void completeSet(setIndex, { exerciseIndex, startRest: isCurrentSet })
                  }}
                  inputMode="numeric"
                  enterKeyHint="done"
                  placeholder="—"
                  className="transition-colors duration-150"
                  disabled={!canEditExercise}
                  style={{
                    width: "100%",
                    background: repsBg,
                    border: `1px solid ${repsBorder}`,
                    borderRadius: "var(--radius-xs)",
                    height: inputHeight,
                    padding: "0 8px",
                    fontSize: inputFontSize,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: valueColor,
                    fontVariantNumeric: "tabular-nums",
                    outline: "none",
                    textAlign: "center",
                  }}
                />

                <button
                  onClick={() => {
                    if (!canEditExercise) return
                    if (!set.completed && (isSetIncomplete(set) || repCapError)) {
                      setValidationTrigger(Date.now())
                      return
                    }
                    void completeSet(setIndex, { exerciseIndex, startRest: isCurrentSet })
                  }}
                  disabled={!canEditExercise || (!set.completed && (isSetIncomplete(set) || repCapError))}
                  className="tap-target flex items-center justify-center transition-colors duration-150"
                  style={{
                    justifySelf: "center",
                    alignSelf: "center",
                    // A 28pt circle that fills white when the set is banked —
                    // the iOS completion mark, not a square checkbox.
                    width: "28px",
                    height: "28px",
                    borderRadius: "999px",
                    background: set.completed ? "#fff" : "transparent",
                    border: set.completed ? "none" : "1.5px solid var(--ink-30)",
                    opacity: !canEditExercise || (!set.completed && (isSetIncomplete(set) || repCapError)) ? 0.35 : 1,
                  }}
                  type="button"
                  aria-label={set.completed ? "Mark Set Incomplete" : "Complete Set"}
                >
                  {set.completed ? <Check size={16} strokeWidth={2.6} style={{ color: "#000" }} /> : null}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 44px", gap: "12px", marginTop: "5px" }}>
                <div
                  className="text-center transition-colors duration-150"
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "8px",
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    color: focusedWeight ? "var(--ink-85)" : "var(--ink-50)",
                  }}
                >
                  LB
                </div>
                <div
                  className="text-center transition-colors duration-150"
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "8px",
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    color: focusedReps ? "var(--ink-85)" : "var(--ink-50)",
                  }}
                >
                  REPS
                </div>
                <div />
              </div>

              <div
                style={{
                  minHeight: "18px",
                  marginTop: isCompactSets ? "6px" : "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {repCapError || showMissing ? (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={10} strokeWidth={2} style={{ color: "var(--ink-50)" }} />
                    <span
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "9px",
                        fontWeight: 500,
                        color: "var(--ink-50)",
                      }}
                    >
                      {repCapError
                        ? `Reps cannot exceed ${REP_MAX}`
                        : missingWeight
                          ? "Enter weight"
                          : "Enter reps"}
                    </span>
                  </div>
                ) : isActiveExercise && lastSet ? (
                  <>
                    <span
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "8.5px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        color: "var(--ink-50)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      LAST {lastSet.weight} × {lastSet.reps}
                    </span>
                    {chip && (
                      <DeltaChip size="sm" tone={chip.tone} arrow={chip.arrow} value={chip.value} />
                    )}
                  </>
                ) : null}
              </div>

              {showPlateCalc && isPlateSetActive && (
                <div style={{ marginTop: isCompactSets ? "8px" : "12px" }}>
                  <div className={`flex items-center gap-2 ${isCompactSets ? "mb-2" : "mb-3"}`}>
                    <button
                      className="ios-chip transition-colors duration-150"
                      style={{ padding: "5px 10px", fontSize: "13px" }}
                      onClick={() => {
                        const nextMode = plateDisplayMode === "per-side" ? "total" : "per-side"
                        setPlateDisplayMode(nextMode)
                        if (exercise.name) {
                          localStorage.setItem(`plate_mode_${exercise.name}`, nextMode)
                          if (userId) {
                            void saveExerciseSettings(userId, exercise.name, { plateDisplayMode: nextMode })
                          }
                        }
                      }}
                      type="button"
                    >
                      {plateDisplayMode === "per-side" ? "Per side" : "Total"}
                      <ChevronDown size={14} strokeWidth={2} />
                    </button>
                    <span
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "8px",
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        color: "var(--ink-50)",
                      }}
                    >
                      BAR
                    </span>
                    <input
                      type="number"
                      value={plateStartingWeight || ""}
                      onChange={(e) => {
                        const value = Number(e.target.value)
                        const nextValue = Number.isNaN(value) ? 0 : Math.max(0, value)
                        setPlateStartingWeight(nextValue)
                        if (exercise.name) {
                          localStorage.setItem(`plate_start_${exercise.name}`, String(nextValue))
                          if (userId) {
                            void saveExerciseSettings(userId, exercise.name, { barWeight: nextValue })
                          }
                        }
                      }}
                      onFocus={handleInputAutoSelect}
                      aria-label="Bar weight"
                      className="transition-colors duration-150"
                      style={{
                        width: "76px",
                        height: "40px",
                        background: "var(--ink-06)",
                        border: "none",
                        borderRadius: "var(--radius-xs)",
                        padding: "0 8px",
                        fontSize: "17px",
                        color: "#fff",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        textAlign: "center",
                        outline: "none",
                      }}
                    />
                  </div>

                  <div className={`flex items-center gap-1.5 ${isCompactSets ? "mb-2" : "mb-3"}`}>
                    {plates.map((plate, plateIndex) => (
                      <div key={plateIndex} className="flex items-center gap-1">
                        {Array.from({ length: plate.count }).map((_, countIndex) => {
                          // The plate stack is one of the few places in the app
                          // that earns colour: the hue is the plate's identity in
                          // the gym, so it reads at a glance mid-set. Competition
                          // coding for the big three (45 blue, 35 yellow, 25
                          // green); the small change plates stay neutral so they
                          // never compete with them.
                          const getPlateColor = () => {
                            if (plate.plate === 45) return "#2F6FE4"
                            if (plate.plate === 35) return "#E8B92B"
                            if (plate.plate === 25) return "#28A76A"
                            if (plate.plate === 10) return "#E8E8E8"
                            if (plate.plate === 5) return "#9A9A9A"
                            return "#6A6A6A"
                          }

                          const getPlateHeight = () => {
                            if (plate.plate === 45) return 40
                            if (plate.plate === 35) return 34
                            if (plate.plate === 25) return 28
                            if (plate.plate === 10) return 20
                            if (plate.plate === 5) return 16
                            return 12
                          }

                          return (
                            <div
                              key={countIndex}
                              style={{
                                width: "7px",
                                height: `${getPlateHeight()}px`,
                                background: getPlateColor(),
                                borderRadius: "var(--radius-flat)",
                              }}
                            />
                          )
                        })}
                      </div>
                    ))}
                    <div
                      style={{
                        width: "40px",
                        height: "5px",
                        background: "rgba(160, 160, 160, 0.4)",
                        border: "1px solid var(--ink-12)",
                        borderRadius: "var(--radius-flat)",
                        marginLeft: "4px",
                      }}
                    />
                  </div>

                  <div
                    className="flex items-baseline flex-wrap"
                    style={{
                      gap: "6px",
                      fontFamily: "var(--font-label)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "26px",
                        fontWeight: 400,
                        lineHeight: 1,
                        letterSpacing: "-0.01em",
                        color: "#fff",
                      }}
                    >
                      {plates.map((plate, plateIndex) => (
                        <span key={plateIndex}>
                          {plateIndex > 0 && " + "}
                          {plate.count > 1 ? `${plate.count}×` : ""}{plate.plate}
                        </span>
                      ))}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--ink-50)" }}>
                      {plateDisplayMode === "per-side" ? "per side" : "total"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {exerciseIndex === currentExerciseIndex && exercise.completed && !exercise.rating && (
          <motion.div
            key="exercise-rating"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={
              isRestDockOpen
                ? {
                    position: "fixed",
                    left: "calc(16px + env(safe-area-inset-left, 0px))",
                    right: "calc(16px + env(safe-area-inset-right, 0px))",
                    bottom: `calc(20px + env(safe-area-inset-bottom) + ${restDockHeight}px + 12px)`,
                    zIndex: 71,
                  }
                : { marginTop: "24px" }
            }
          >
            <div
              className="text-center"
              style={{ fontFamily: "var(--font-label)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.2em", color: "var(--ink-50)", marginBottom: "12px" }}
            >
              HOW DID THIS FEEL?
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => void rateExercise(exerciseIndex, "thumbs_down")}
                type="button"
                className="transition-colors duration-150"
                style={{
                  background: "var(--ink-02)",
                  border: "1px solid var(--ink-08)",
                  borderRadius: "var(--radius-flat)",
                  padding: "10px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <ThumbsDown size={14} strokeWidth={1.5} style={{ color: "var(--ink-50)" }} />
                <span style={{ fontFamily: "var(--font-label)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink-70)" }}>
                  ROUGH
                </span>
              </button>
              <button
                onClick={() => void rateExercise(exerciseIndex, "thumbs_up")}
                type="button"
                className="transition-colors duration-150"
                style={{
                  background: "var(--ink-02)",
                  border: "1px solid var(--ink-08)",
                  borderRadius: "var(--radius-flat)",
                  padding: "10px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <ThumbsUp size={14} strokeWidth={1.5} style={{ color: "var(--ink-50)" }} />
                <span style={{ fontFamily: "var(--font-label)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.12em", color: "var(--ink-70)" }}>
                  GOOD
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {exerciseIndex === currentExerciseIndex && exercise.completed && exercise.rating && (
          <motion.div
            key="exercise-rating-confirmed"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={
              isRestDockOpen
                ? {
                    position: "fixed",
                    left: "calc(16px + env(safe-area-inset-left, 0px))",
                    right: "calc(16px + env(safe-area-inset-right, 0px))",
                    bottom: `calc(20px + env(safe-area-inset-bottom) + ${restDockHeight}px + 12px)`,
                    zIndex: 71,
                  }
                : { marginTop: "24px" }
            }
          >
            <div className="flex items-center justify-center gap-2">
              {exercise.rating === "thumbs_up" ? (
                <ThumbsUp size={12} strokeWidth={1.5} style={{ color: "var(--ink-50)" }} />
              ) : (
                <ThumbsDown size={12} strokeWidth={1.5} style={{ color: "var(--ink-50)" }} />
              )}
              <span
                style={{ fontFamily: "var(--font-label)", fontSize: "8px", fontWeight: 600, letterSpacing: "0.16em", color: "var(--ink-50)" }}
              >
                {exercise.rating === "thumbs_up" ? "FELT GOOD" : "FELT ROUGH"}
              </span>
              <button
                onClick={() => void rateExercise(exerciseIndex, exercise.rating!)}
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  padding: "2px 4px",
                  cursor: "pointer",
                  fontFamily: "var(--font-label)",
                  fontSize: "8px",
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  color: "var(--ink-20)",
                }}
              >
                UNDO
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The honest exits. Finish stays gated on every remaining set being
          logged, so the record never carries a set that did not happen; these
          are how a set list is made to match what did. END HERE drops the
          unlogged tail (SKIP EXERCISE when nothing was logged), UNDO brings it
          back, + SET appends one more prefilled from the last row. */}
      {exerciseIndex === currentExerciseIndex && canEditExercise && (
        <div
          className="flex items-center justify-between flex-wrap"
          style={{ marginTop: "22px", gap: "10px" }}
          data-testid="set-list-actions"
        >
          {trimmedCount > 0 ? (
            <div className="flex items-center" style={{ gap: "10px" }}>
              <span
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "9px",
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  color: "var(--ink-50)",
                }}
              >
                {completedCount > 0 ? `ENDED AFTER SET ${completedCount}` : "SKIPPED"}
                {" · "}
                {trimmedCount} {plural(trimmedCount, "SET", "SETS")} DROPPED
              </span>
              <QuietAction label="UNDO" onClick={() => restoreTrimmedSets(exerciseIndex)} />
            </div>
          ) : (
            <>
              <QuietAction label="+ SET" onClick={() => addSet(exerciseIndex)} />
              {hasIncompleteSets && (
                <QuietAction
                  label={completedCount > 0 ? "END HERE" : "SKIP EXERCISE"}
                  onClick={() => endExerciseHere(exerciseIndex)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
})

// A quiet §4.6 control at a full 44pt height — the same chrome as the rating
// buttons, sized so a thumb finds it without looking.
function QuietAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors duration-150"
      style={{
        minHeight: "44px",
        background: "var(--ink-02)",
        border: "1px solid var(--ink-08)",
        borderRadius: "var(--radius-flat)",
        padding: "0 16px",
        fontFamily: "var(--font-label)",
        fontSize: "9px",
        fontWeight: 600,
        letterSpacing: "0.12em",
        color: "var(--ink-70)",
        cursor: "pointer",
        touchAction: "manipulation",
      }}
    >
      {label}
    </button>
  )
}

export default function WorkoutSessionComponent({ routine, isDeload = false }: { routine: WorkoutRoutine; isDeload?: boolean }) {
  const router = useRouter()
  // Coach notes for this session. Queried once at workout start and matched to
  // exercises by lower(trim(name)); scope="global" notes belong to the
  // pre-workout screen and are deliberately not surfaced in here.
  const {
    notesForExercise,
    workoutNotes: coachWorkoutNotes,
    dismiss: dismissCoachNote,
  } = useCoachNotes({ workoutName: routine.name })
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<any[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [restState, setRestState] = useState<WorkoutSession["restTimer"]>(undefined)
  const [restExtensionTrend, setRestExtensionTrend] = useState<RestExtensionTrend | null>(null)
  const [validationTrigger, setValidationTrigger] = useState(0)
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const [uiNow, setUiNow] = useState(() => Date.now())
  const restStartAtRef = useRef<number | null>(null)
  const [showPlateCalc, setShowPlateCalc] = useState(() => {
    if (typeof window === "undefined") return true
    const savedPref = localStorage.getItem(`plate_viz_${routine.exercises[0]?.name}`)
    return savedPref !== null ? JSON.parse(savedPref) : true
  })
  const lastSeenSetUpdatedAtRef = useRef<Map<string, string>>(new Map())
  const lastSeenSessionUpdatedAtRef = useRef<Map<string, string>>(new Map())
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<"reps" | "weight" | null>(null)
  const editingSetIdRef = useRef<string | null>(null)
  const editingFieldRef = useRef<"reps" | "weight" | null>(null)
  const [, setPendingRemoteUpdates] = useState<Record<string, boolean>>({})
  const [progressiveAutofillEnabled, setProgressiveAutofillEnabled] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Measured height of the fixed rest dock, so the feeling-rating can be lifted
  // clear of it (the exercise column doesn't scroll, so a fixed offset is the
  // only way to keep the rating tappable while the dock is up).
  const restDockRef = useRef<HTMLDivElement>(null)
  const [restDockHeight, setRestDockHeight] = useState(0)
  const isScrollingProgrammatically = useRef(false)
  const hasInitialScrollRef = useRef(false)
  const scrollRafRef = useRef<number | null>(null)
  const scrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // While this is set, scroll events are relayout noise rather than the user
  // choosing an exercise, so no index is written. Always released through
  // holdIndexWrites' single timer — two timers racing is how a rotation used
  // to slip an index write through mid-flip.
  const isOrientationChangingRef = useRef(false)
  const indexWriteHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const indexWriteHoldUntilRef = useRef(0)
  // Set by the input that starts a swipe, consumed when the scroll settles.
  // Layout, the browser's own snapping and our own scrollTo all emit scroll
  // events indistinguishable from a swipe's — and because the pager is
  // scroll-behavior: smooth, a single stray scrollLeft write animates for the
  // better part of a second and ends on a clean snap point, so neither a timer
  // nor an "is it on a boundary" test can tell them apart. Whether the user
  // actually touched the thing can.
  const userDrivenScrollRef = useRef(false)
  // Last width the carousel was aligned against, so a relayout can be told
  // apart from a scroll.
  const pageWidthRef = useRef(0)
  const [repCapErrors, setRepCapErrors] = useState<Record<string, boolean>>({})
  const [, setRecentlySaved] = useState(false)
  const recentlySavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const weightInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())
  const repsInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map())
  // True only when an index change came from explicit intent (set completion or
  // a rail/dot tap) — the keyboard auto-focus effect requires it, so swiping
  // never pops the keyboard.
  const focusIntentRef = useRef(false)
  const restNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restNotificationEndsAtRef = useRef<number | null>(null)
  const [plateDisplayMode, setPlateDisplayMode] = useState<"per-side" | "total">("per-side")
  const [plateStartingWeight, setPlateStartingWeight] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [, setSyncState] = useState<SyncState>("draft")
  const [, setLastSyncedAt] = useState<string | null>(null)
  const hasSyncedDraftRef = useRef(false)
  const sessionRef = useRef<WorkoutSession | null>(null)
  const exercisesRef = useRef<any[]>([])
  const [uiExerciseIndex, setUiExerciseIndex] = useState(0)
  const [isReorderOpen, setIsReorderOpen] = useState(false)
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false)
  const currentExerciseIndexRef = useRef(0)
  const historyRepsCacheRef = useRef<Map<string, number[]>>(new Map())
  const maxSetVolumeByExercise = useMemo(() => {
    const history = getWorkoutHistory()
    const map = new Map<string, number>()
    history.forEach((workout) => {
      workout.exercises?.forEach((exercise: any) => {
        const key = normalizeExerciseName(exercise.name)
        const maxForExercise = map.get(key) ?? 0
        const maxForWorkout = (exercise.sets || [])
          .filter((set: any) => isSetEligibleForStats(set))
          .reduce((max: number, set: any) => {
            const volume = (set.weight ?? 0) * (set.reps ?? 0)
            return volume > max ? volume : max
          }, 0)
        if (maxForWorkout > maxForExercise) {
          map.set(key, maxForWorkout)
        }
      })
    })
    return map
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem("progressive_autofill_enabled")
    if (stored === null) return
    setProgressiveAutofillEnabled(stored === "true")
  }, [])

  useEffect(() => {
    ensureWorkoutSync()
    if (supabase) {
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    }
  }, [])

  useEffect(() => {
    hasSyncedDraftRef.current = false
  }, [session?.id])

  useEffect(() => {
    historyRepsCacheRef.current.clear()
  }, [session?.id])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    exercisesRef.current = exercises
  }, [exercises])

  // Stop reading scroll events as swipes for a while. Rotation, the keyboard
  // and a return from the background all move the scroller on their own; every
  // such move used to be able to land as "the user picked a different
  // exercise".
  const holdIndexWrites = useCallback((ms: number) => {
    const until = Date.now() + ms
    // Never shorten a hold already in flight: an alignment landing inside a
    // rotation's window must not release the guard before the flip is over.
    if (indexWriteHoldRef.current && until <= indexWriteHoldUntilRef.current) return
    indexWriteHoldUntilRef.current = until
    isOrientationChangingRef.current = true
    if (indexWriteHoldRef.current) clearTimeout(indexWriteHoldRef.current)
    indexWriteHoldRef.current = setTimeout(() => {
      isOrientationChangingRef.current = false
      indexWriteHoldRef.current = null
      indexWriteHoldUntilRef.current = 0
    }, ms)
  }, [])

  useEffect(
    () => () => {
      if (indexWriteHoldRef.current) clearTimeout(indexWriteHoldRef.current)
    },
    [],
  )

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape) and (max-width: 1024px) and (pointer: coarse)")
    const update = (isFlip: boolean) => {
      if (scrollSettleTimeoutRef.current) {
        clearTimeout(scrollSettleTimeoutRef.current)
        scrollSettleTimeoutRef.current = null
      }
      // The app is orientation-locked in software: PortraitLock rotates the
      // portrait layout to fill a landscape screen, so the session screen never
      // switches to its landscape layout. This effect still runs on rotation to
      // block index writes while the viewport is mid-flip; re-aligning the
      // carousel afterwards belongs to the resize observer below, which reacts
      // to the container actually changing width.
      setIsLandscapeMobile(false)
      // Long enough to cover the whole flip. The rotation animation and the
      // relayout that follows run well past a couple of frames, and the old
      // 300ms release could expire mid-flip — leaving the tail of the relayout
      // to be read as a swipe. holdIndexWrites owns the only release timer, so
      // an alignment landing inside this window extends it rather than racing
      // it.
      //
      // Only on a real flip. Arming it on mount as well made the pager deaf
      // to a swipe for its first 700ms (longer under React's dev double
      // mount), and the initial alignment already holds for its own scroll.
      if (isFlip) holdIndexWrites(700)
    }
    const onFlip = () => update(true)
    update(false)
    query.addEventListener("change", onFlip)
    window.addEventListener("orientationchange", onFlip)
    return () => {
      query.removeEventListener("change", onFlip)
      window.removeEventListener("orientationchange", onFlip)
    }
  }, [holdIndexWrites])

  const generateSetId = () => {
    const c: Crypto | undefined = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
    return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )

  const generateWorkoutId = () => {
    const c: Crypto | undefined = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
    return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const resolveWorkoutId = (currentSession: WorkoutSession) => {
    if (currentSession.workoutId && isUuid(currentSession.workoutId)) return currentSession.workoutId
    if (isUuid(currentSession.id)) return currentSession.id
    return generateWorkoutId()
  }

  const touchDraft = async (workoutId: string) => {
    await updateWorkoutDraft(workoutId, {
      updated_at_client: Date.now(),
      sync_state: "draft",
      last_sync_error: null,
    })
  }

  const persistSetDraft = async (
    workoutId: string,
    exercise: Exercise,
    set: Exercise["sets"][number],
    setIndex: number
  ) => {
    if (!set?.id) return
    await upsertSetDraft(workoutId, {
      set_id: set.id,
      workout_id: workoutId,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      set_index: setIndex,
      reps: set.reps ?? null,
      weight: set.weight ?? null,
      completed: Boolean(set.completed),
      updated_at_client: Date.now(),
    })
  }

  const syncExerciseDraft = async (
    workoutId: string,
    exercise: Exercise,
    sets: Exercise["sets"]
  ) => {
    const tasks = sets.map((set, idx) => persistSetDraft(workoutId, exercise, set, idx))
    await Promise.all(tasks)
  }

  const isGhostSet = (set: any) => {
    const repsEmpty = set.reps === null || set.reps === undefined || set.reps === 0
    const weightEmpty = set.weight === null || set.weight === undefined
    return !set.completed && repsEmpty && weightEmpty
  }

  const canCutOffFinalSet = (exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    if (sets.length === 0) return false
    const lastSet = sets[sets.length - 1]
    return Boolean(lastSet) && !lastSet.completed
  }

  const canExerciseBeFinished = (exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    if (sets.length === 0) return true
    return sets.every((set: any) => set.completed && !isSetIncomplete(set))
  }

  const getCachedHistoryReps = (exerciseName: string) => {
    const key = normalizeExerciseName(exerciseName)
    const cached = historyRepsCacheRef.current.get(key)
    if (cached) return cached
    const reps = getExerciseHistory(exerciseName).flatMap((workout) =>
      workout.exercises
        .filter((ex: any) => ex.name === exerciseName)
        .flatMap((ex: any) =>
          ex.sets.filter((set: any) => isSetEligibleForStats(set)).map((set: any) => set.reps ?? 0)
        )
    )
    historyRepsCacheRef.current.set(key, reps)
    return reps
  }

  useEffect(() => {
    const buildExercises = (seed?: any[]) => {
      if (seed && seed.length > 0) {
        return seed.map((exercise: any) => ({
          ...exercise,
          restTime: exercise.restTime ?? extractRestSeconds(exercise.notes),
          sets: Array.isArray(exercise.sets)
            ? exercise.sets.map((set: any) => ({
                ...set,
                id: set.id || generateSetId(),
              }))
            : [],
        }))
      }
      return routine.exercises.map((exercise: any) => {
        const lastPerformance = getLatestPerformance(exercise.name)

        let previousPerformance = {
          weight: 0,
          avgReps: 0,
          progress: "First time",
        }

        if (lastPerformance) {
          const completedSets = lastPerformance.sets.filter((s: any) => isSetEligibleForStats(s))
          if (completedSets.length > 0) {
            const maxWeight = Math.max(...completedSets.map((s: any) => s.weight ?? 0))
            const avgReps = Math.round(
              completedSets.reduce((acc: any, s: any) => acc + (s.reps ?? 0), 0) / completedSets.length
            )
            previousPerformance = {
              weight: maxWeight,
              avgReps,
              progress: "View history →",
            }
          }
        }

        const targetSets = exercise.targetSets ?? 3
        // Deload: reduce sets by ~50% (round up so minimum is 1)
        const effectiveSets = isDeload ? Math.max(1, Math.ceil(targetSets / 2)) : targetSets
        const targetReps = exercise.targetReps ?? "8-10"
        const restTime = extractRestSeconds(exercise.notes)

        const isWarmup = isWarmupExercise(exercise.name)
        const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, " ")
        const exerciseHistory = getExerciseHistory(exercise.name)
        const normalizedHistory =
          exerciseHistory.length > 0
            ? exerciseHistory
            : getWorkoutHistory().filter((workout) =>
                workout.exercises.some(
                  (ex: any) => normalizeName(ex.name) === normalizeName(exercise.name)
                )
              )

        const historyReps = normalizedHistory.flatMap((workout) =>
          workout.exercises
            .filter((ex: any) => normalizeName(ex.name) === normalizeName(exercise.name))
            .flatMap((ex: any) =>
              ex.sets
                .filter((set: any) => isSetEligibleForStats(set))
                .map((set: any) => set.reps)
                .filter((reps: any) => typeof reps === "number")
            )
        )
        const baseDefaults = getDefaultSetValues({
          sets: [],
          targetReps,
          targetWeight: exercise.targetWeight,
        })
        const progressiveDefaults =
          progressiveAutofillEnabled && !isWarmup
            ? applyProgressiveOverload(getRecentPerformanceSnapshots(exercise.name, normalizedHistory, 3))
            : { reps: null, weight: null, mode: null }
        const defaults = {
          reps: progressiveDefaults.reps ?? baseDefaults.reps,
          weight: progressiveDefaults.weight ?? baseDefaults.weight,
        }
        if (defaults.reps === null && defaults.weight === 0) {
          defaults.reps = REP_MIN
        }

        const warmupDefaults = (() => {
          const lastWorkout = normalizedHistory.find((workout) =>
            workout.exercises.some(
              (ex: any) => normalizeName(ex.name) === normalizeName(exercise.name)
            )
          )
          if (!lastWorkout) return defaults
          const lastExercise = lastWorkout.exercises.find(
            (ex: any) => normalizeName(ex.name) === normalizeName(exercise.name)
          )
          if (!lastExercise?.sets) return defaults
          const firstEligible = lastExercise.sets.find(
            (set: any) =>
              isSetEligibleForStats(set) && set.reps !== null && set.reps !== undefined && set.weight !== null && set.weight !== undefined
          )
          if (!firstEligible) return defaults
          return { reps: firstEligible.reps, weight: firstEligible.weight }
        })()

        const warmupSets: Array<{
          id: string
          reps: number | null
          weight: number | null
          completed: boolean
          isOutlier: boolean
          validationFlags: string[]
          isIncomplete: boolean
        }> = []
        for (let idx = 0; idx < effectiveSets; idx += 1) {
          const prev = warmupSets[idx - 1]
          const reps = prev?.reps ?? warmupDefaults.reps ?? null
          const weight = prev?.weight ?? warmupDefaults.weight ?? null
          const warmupFlags = getSetFlags({
            reps,
            weight,
            targetReps,
            historyReps,
          }).flags.filter((flag) => flag !== "rep_outlier")
          warmupSets.push({
            id: generateSetId(),
            reps,
            weight,
            completed: false,
            isOutlier: false,
            validationFlags: warmupFlags,
            isIncomplete: isIncomplete(warmupFlags),
          })
        }

        const savedMachineSettings = getMachineSettings(exercise.name)
        return {
          id: exercise.id,
          name: exercise.name,
          targetSets,
          targetReps,
          targetWeight: exercise.targetWeight,
          restTime,
          completed: false,
          machineSettings: Object.keys(savedMachineSettings).length > 0 ? savedMachineSettings : undefined,
          sets: isWarmup
            ? warmupSets
            : Array.from({ length: effectiveSets }, (_, setIndex) => {
                const lastSet = getMostRecentCompletedSetPerformance(exercise.name, setIndex, session?.id)
                const nextReps = lastSet?.reps ?? defaults.reps
                const rawWeight = lastSet?.weight ?? defaults.weight
                // Deload: scale weight to 72.5% of working weight, rounded to nearest 5 lbs.
                // Only applied when there is an actual previous weight to scale from.
                const nextWeight =
                  isDeload && rawWeight
                    ? Math.round((rawWeight * 0.725) / 5) * 5
                    : rawWeight
                const flagsResult = getSetFlags({
                  reps: nextReps,
                  weight: nextWeight,
                  targetReps,
                  historyReps,
                })
                return {
                  id: generateSetId(),
                  reps: nextReps,
                  weight: nextWeight,
                  completed: false,
                  isOutlier: flagsResult.flags.includes("rep_outlier"),
                  validationFlags: flagsResult.flags,
                  isIncomplete: flagsResult.isIncomplete,
                }
              }),
          previousPerformance,
        }
      })
    }

    const initSession = async () => {
      let currentSession = getCurrentInProgressSession()
      if (currentSession) {
        if (currentSession.status === "paused") {
          const resumedSession: WorkoutSession = {
            ...currentSession,
            status: "in_progress",
          }
          currentSession = resumedSession
          setSession(resumedSession)
          await saveSession(resumedSession)
        }
        const normalizedStatus =
          (currentSession as any).status === "active"
            ? "in_progress"
            : currentSession.status

        const normalizedSession: WorkoutSession = {
          ...currentSession,
          id: currentSession.id || (currentSession as any).sessionId || Date.now().toString(),
          startedAt: currentSession.startedAt ?? new Date().toISOString(),
          status: normalizedStatus,
          activeDurationSeconds: currentSession.activeDurationSeconds ?? 0,
          workoutId: currentSession.workoutId,
        }

        const ensuredWorkoutId = resolveWorkoutId(normalizedSession)
        const sessionWithWorkoutId =
          normalizedSession.workoutId === ensuredWorkoutId
            ? normalizedSession
            : { ...normalizedSession, workoutId: ensuredWorkoutId }

        saveCurrentSessionId(normalizedSession.id)

        const restTimer =
          sessionWithWorkoutId.restTimer && !sessionWithWorkoutId.restTimer.startedAt
            ? { ...sessionWithWorkoutId.restTimer, startedAt: new Date().toISOString() }
            : sessionWithWorkoutId.restTimer
        const hydratedSession = restTimer ? { ...sessionWithWorkoutId, restTimer } : sessionWithWorkoutId

        setSession(hydratedSession)
        setExercises(buildExercises(hydratedSession.exercises))
        setRestState(restTimer)
        restStartAtRef.current = restTimer?.startedAt
          ? new Date(restTimer.startedAt).getTime()
          : restTimer
            ? Date.now()
            : null
        await saveSession(hydratedSession)
        setIsHydrated(true)
      } else {
        const newSessionId = Date.now().toString()
        const newExercises = buildExercises()
        const workoutId = generateWorkoutId()
        const newSession: WorkoutSession = {
          id: newSessionId,
          workoutId,
          routineId: routine.id,
          routineName: routine.name,
          status: "in_progress",
          startedAt: new Date().toISOString(),
          activeDurationSeconds: 0,
          currentExerciseIndex: 0,
          exercises: newExercises,
          restTimer: undefined,
        }

        saveCurrentSessionId(newSessionId)
        setSession(newSession)
        setExercises(newExercises)
        setRestState(undefined)
        restStartAtRef.current = null
        await saveSession(newSession)
        setIsHydrated(true)
      }

      const remote = await getOrCreateActiveSession()
      if (remote) {
        setSession((prev) => {
          if (!prev) return prev
          const updated = { ...prev, remoteSessionId: remote.id }
          saveSession(updated)
          return updated
        })
      }
    }

    initSession()
  }, [routine])

  useEffect(() => {
    if (!isHydrated) return

    if (!session?.id) {
      // startSession(routine.id, routine.name)
    } else if (session.routineId !== routine.id) {
      // User is trying to start different workout - should handle via confirmation
      console.warn("[v0] Different routine detected, session mismatch")
    }
  }, [isHydrated, session?.id, session?.routineId, routine.id, routine.name])

  useEffect(() => {
    if (!isHydrated || !session || !userId) return
    const workoutId = resolveWorkoutId(session)
    if (session.workoutId !== workoutId) {
      const updatedSession: WorkoutSession = {
        ...session,
        workoutId,
      }
      setSession(updatedSession)
      void saveSession(updatedSession)
    }

    if (hasSyncedDraftRef.current) return
    hasSyncedDraftRef.current = true

    const hydrateDraft = async () => {
      const existing = await getWorkoutDraft(workoutId)
      if (!existing) {
        await createWorkoutDraft({
          workout_id: workoutId,
          user_id: userId,
          started_at: session.startedAt,
          routine_id: routine.id,
          routine_name: routine.name,
        })
      } else {
        await updateWorkoutDraft(workoutId, {
          routine_id: routine.id,
          routine_name: routine.name,
        })
      }

      const exercisesToSync = exercises.length > 0 ? exercises : session.exercises || []
      const syncTasks: Promise<void>[] = []
      exercisesToSync.forEach((exercise: any) => {
        if (!exercise?.sets) return
        syncTasks.push(syncExerciseDraft(workoutId, exercise, exercise.sets))
      })
      await Promise.all(syncTasks)

      const draft = await getWorkoutDraft(workoutId)
      if (draft) {
        setSyncState(draft.sync_state)
      }
    }

    void hydrateDraft()
  }, [isHydrated, session, userId, exercises, routine.id, routine.name])

  const resolvedExerciseIndex = Number.isFinite(Number(session?.currentExerciseIndex))
    ? Number(session?.currentExerciseIndex)
    : 0
  const currentExerciseIndex = Math.min(
    Math.max(resolvedExerciseIndex, 0),
    Math.max(0, exercises.length - 1)
  )
  useEffect(() => {
    currentExerciseIndexRef.current = currentExerciseIndex
    setUiExerciseIndex(currentExerciseIndex)
  }, [currentExerciseIndex])
  const currentExercise = exercises[currentExerciseIndex]
  const firstIncompleteIndex =
    currentExercise?.sets?.findIndex((set: any) => !set.completed) ?? -1
  const currentSetIndex = firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex
  const isResting = Boolean(restState) && typeof restState?.remainingSeconds === "number"
  const canFinishWorkout = exercises.every((exercise) => canExerciseBeFinished(exercise))

  // The dock is the countdown and nothing else: it appears when rest starts and
  // is gone the moment rest ends, whether that is SKIP or the timer running
  // out. No count-up, no second tap to dismiss.
  const showRestDock = isResting

  const adjustRest = (deltaSeconds: number) => {
    if (!isResting || !restState) return
    // The floor keeps a -30 tap from silently ending rest; SKIP is the explicit
    // way to do that.
    const next = Math.max(5, restRemainingSeconds + deltaSeconds)
    if (next === restRemainingSeconds) return
    haptic("tap")
    void setRestStateAndPersist({ ...restState, remainingSeconds: next })
    scheduleRestNotification(next)
    if (deltaSeconds > 0) {
      recordRestExtension(session?.id ?? "unknown")
      setRestExtensionTrend(getRestExtensionTrend())
    }
  }

  // Keep the measured rest-dock height in sync so the feeling-rating sits just
  // above it. Measured whenever the dock opens or changes shape, and on resize.
  useIsomorphicLayoutEffect(() => {
    if (!showRestDock) return
    const measure = () => {
      if (restDockRef.current) setRestDockHeight(restDockRef.current.offsetHeight)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [showRestDock])

  const totalVolume = exercises.reduce((sum: number, exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    const volume = sets.reduce((acc: number, set: any) => {
      if (!set?.completed) return acc
      if (typeof set.weight !== "number" || typeof set.reps !== "number") return acc
      return acc + set.weight * set.reps
    }, 0)
    return sum + volume
  }, 0)

  const totalSetsCompleted = exercises.reduce((sum: number, exercise: any) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : []
    return sum + sets.filter((set: any) => set?.completed).length
  }, 0)

  const totalSets = exercises.reduce((sum: number, exercise: any) => {
    const count = typeof exercise?.targetSets === "number" ? exercise.targetSets : exercise?.sets?.length ?? 0
    return sum + count
  }, 0)

  const averageSecondsPerSet = useMemo(() => {
    const history = getWorkoutHistory()
    const sameRoutine = history.filter(
      (workout) => normalizeExerciseName(workout.name ?? "") === normalizeExerciseName(routine.name)
    )
    return computeAverageSecondsPerSet(sameRoutine) ?? computeAverageSecondsPerSet(history)
  }, [routine.name])

  // Render-time elapsed for the (non-ticking) pace label — the live per-second
  // clock is owned by SessionClock so it never re-renders this tree.
  const elapsedSeconds = session?.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000))
    : 0

  const pacePillLabel = (() => {
    if (averageSecondsPerSet === null || totalSetsCompleted < 2 || elapsedSeconds <= 0) return null
    const currentSecondsPerSet = elapsedSeconds / totalSetsCompleted
    const status = classifyPace(currentSecondsPerSet, averageSecondsPerSet)
    if (status === "fast") return { text: "FAST PACE", color: "var(--warn-ink)" }
    if (status === "slow") return { text: "SLOW PACE", color: "var(--warn-ink)" }
    return { text: "ON PACE", color: "var(--good-ink)" }
  })()

  const formatSeconds = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const fireRestNotification = async () => {
    if (typeof window === "undefined") return
    if (!("Notification" in window)) return
    if (Notification.permission !== "granted") return
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification("Akt", {
          body: "Rest is over. Start your next set.",
        })
        return
      } catch {
        // fall back to in-page notification
      }
    }
    try {
      new Notification("Akt", {
        body: "Rest is over. Start your next set.",
      })
    } catch {
      // ignore notification errors
    }
  }

  const scheduleRestNotification = (seconds: number) => {
    if (typeof window === "undefined") return
    if (restNotificationTimeoutRef.current) {
      clearTimeout(restNotificationTimeoutRef.current)
      restNotificationTimeoutRef.current = null
    }
    restNotificationEndsAtRef.current = Date.now() + seconds * 1000
    if (!("Notification" in window)) return
    if (Notification.permission === "default") {
      void Notification.requestPermission()
      return
    }
    if (Notification.permission !== "granted") return
    restNotificationTimeoutRef.current = setTimeout(() => {
      void fireRestNotification()
    }, seconds * 1000)
  }

  const restRemainingSeconds = (() => {
    if (!isResting || !restState) return 0
    const startAt = restState.startedAt
      ? new Date(restState.startedAt).getTime()
      : restStartAtRef.current ?? uiNow
    const elapsed = Math.floor((uiNow - startAt) / 1000)
    return Math.max(0, restState.remainingSeconds - elapsed)
  })()

  const setRestStateAndPersist = async (
    nextState: WorkoutSession["restTimer"] | null,
    latestExercises?: any[]
  ) => {
    const nextWithStart = nextState
      ? {
          ...nextState,
          startedAt: new Date().toISOString(),
        }
      : null

    restStartAtRef.current = nextWithStart?.startedAt
      ? new Date(nextWithStart.startedAt).getTime()
      : null
    setRestState(nextWithStart || undefined)
    setUiNow(Date.now())
    if (!nextWithStart && restNotificationTimeoutRef.current) {
      clearTimeout(restNotificationTimeoutRef.current)
      restNotificationTimeoutRef.current = null
    }
    if (!nextWithStart) {
      restNotificationEndsAtRef.current = null
    }
    // Built off the ref, not the render closure: completeSet advances the
    // exercise right after starting rest, and that write reads sessionRef — so
    // the two have to agree or one of them silently loses the other's field.
    const baseSession = sessionRef.current ?? session
    if (baseSession) {
      const updatedSession: WorkoutSession = {
        ...baseSession,
        ...(latestExercises !== undefined ? { exercises: latestExercises } : {}),
        restTimer: nextWithStart || undefined,
      }
      sessionRef.current = updatedSession
      setSession(updatedSession)
      await saveSession(updatedSession)
    }
  }

  useEffect(() => {
    if (!isResting) return
    if (!restStartAtRef.current) {
      restStartAtRef.current = restState?.startedAt
        ? new Date(restState.startedAt).getTime()
        : Date.now()
    }
    const interval = setInterval(() => {
      setUiNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [isResting])

  useEffect(() => {
    if (isResting) {
      setRestExtensionTrend(getRestExtensionTrend())
    } else {
      setRestExtensionTrend(null)
    }
  }, [isResting])

  useEffect(() => {
    if (!isResting) return
    if (restRemainingSeconds <= 0) {
      haptic("restOver")
      playRestChime()
      void setRestStateAndPersist(null)
      if (restNotificationTimeoutRef.current) {
        clearTimeout(restNotificationTimeoutRef.current)
        restNotificationTimeoutRef.current = null
      }
      restNotificationEndsAtRef.current = null
    }
  }, [isResting, restRemainingSeconds])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return
      const endsAt = restNotificationEndsAtRef.current
      if (!endsAt) return
      if (Date.now() >= endsAt) {
        void fireRestNotification()
        restNotificationEndsAtRef.current = null
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleVisibility)
    }
  }, [])

  // Reload plate settings synchronously before paint on exercise switch. Using
  // useEffect here painted the new active exercise with the previous exercise's
  // plate visibility/mode/starting weight for one frame, then corrected it after
  // the effect ran — the visible flicker. A layout effect commits the new
  // exercise's settings before the browser paints, so there is no stale frame.
  useIsomorphicLayoutEffect(() => {
    if (currentExercise?.name && typeof window !== "undefined") {
      const savedPref = localStorage.getItem(`plate_viz_${currentExercise.name}`)
      setShowPlateCalc(savedPref !== null ? JSON.parse(savedPref) : true)
      // Apply localStorage values first (instant), then overlay with Supabase values
      const savedMode = localStorage.getItem(`plate_mode_${currentExercise.name}`)
      if (savedMode === "total" || savedMode === "per-side") {
        setPlateDisplayMode(savedMode)
      }
      const savedStarting = localStorage.getItem(`plate_start_${currentExercise.name}`)
      if (savedStarting) {
        const parsed = Number(savedStarting)
        if (!Number.isNaN(parsed) && parsed >= 0) {
          setPlateStartingWeight(parsed)
        }
      } else {
        setPlateStartingWeight(0)
      }
      if (userId) {
        void loadExerciseSettings(userId, currentExercise.name).then((remote) => {
          if (!remote) return
          if (remote.barWeight !== undefined) {
            setPlateStartingWeight(remote.barWeight)
            localStorage.setItem(`plate_start_${currentExercise.name}`, String(remote.barWeight))
          }
          if (remote.plateDisplayMode) {
            setPlateDisplayMode(remote.plateDisplayMode)
            localStorage.setItem(`plate_mode_${currentExercise.name}`, remote.plateDisplayMode)
          }
          if (remote.seat !== undefined) {
            const machineSeat = remote.seat
            setExercises((prev: any[]) =>
              prev.map((ex: any) =>
                ex.name === currentExercise.name
                  ? { ...ex, machineSettings: { ...(ex.machineSettings ?? {}), seat: machineSeat } }
                  : ex
              )
            )
            saveMachineSettings(currentExercise.name, { seat: machineSeat })
          }
        })
      }
    }
  }, [currentExercise?.name, userId])

  useEffect(() => {
    setRepCapErrors({})
  }, [currentExercise?.id, currentExercise?.sets?.length])

  // The one definition of "put the carousel on page N". Returns false when the
  // container has no width yet, so callers can retry on the next frame instead
  // of scrolling to 0 × 0 and landing on the first exercise.
  const alignCarousel = useCallback(
    (index: number) => {
      const container = scrollContainerRef.current
      if (!container) return false
      const width = container.offsetWidth
      if (!width) return false
      pageWidthRef.current = width
      // Held across the scroll events our own scrollTo is about to emit. One
      // frame is not enough: iOS can dispatch them a frame or two later.
      holdIndexWrites(250)
      container.scrollTo({ left: index * width, behavior: "instant" })
      hasInitialScrollRef.current = true
      return true
    },
    [holdIndexWrites],
  )

  // Align as soon as the container has a width, retrying across frames. Used
  // wherever the carousel has to be put back after a relayout that may not have
  // settled yet.
  const alignCarouselWhenReady = useCallback(
    (index: number) => {
      let rafId = 0
      let attempts = 0
      const attempt = () => {
        if (alignCarousel(index)) return
        if (attempts >= 20) return
        attempts += 1
        rafId = requestAnimationFrame(attempt)
      }
      rafId = requestAnimationFrame(attempt)
      return () => cancelAnimationFrame(rafId)
    },
    [alignCarousel],
  )

  useEffect(() => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current

    if (!hasInitialScrollRef.current) {
      // Restore the carousel to the persisted exercise after a (re)mount or
      // orientation change. Rotating back from landscape remounts this
      // container with scrollLeft 0, and the new portrait layout width is not
      // always ready on the first animation frame — reading offsetWidth too
      // early resolves to 0 and scrolls to exercise 0.
      return alignCarouselWhenReady(currentExerciseIndex)
    }

    if (isScrollingProgrammatically.current) return
    isScrollingProgrammatically.current = true
    container.scrollTo({ left: currentExerciseIndex * container.offsetWidth, behavior: "smooth" })

    const timeout = window.setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [alignCarouselWhenReady, currentExerciseIndex, isLandscapeMobile])

  // Re-align the carousel whenever the layout moves under it.
  //
  // Turning the phone re-lays out PortraitLock's rotated box, and the width the
  // carousel pages against can wobble for a few frames before it settles. The
  // scroll offset left over from the old width then divides into a different
  // exercise, and the first scroll event after the flip persists that as the
  // active one — so rotating the phone silently moved the workout to another
  // exercise. Snapping back to the active exercise fixes that, and also covers
  // the on-screen keyboard and the URL bar collapsing.
  //
  // A changed width is not the only way the offset goes wrong: the scroller can
  // also be handed back sitting on the wrong page at the same width (a return
  // from the background, a snap the browser redid across the resize). So the
  // trigger is "the offset is no longer on the active page", not "the width
  // changed" — the width-only check left exactly those cases unaligned.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => {
      const width = container.offsetWidth
      // Mid-relayout the container can report 0; there is nothing to align to.
      if (!width) return
      // A swipe in flight is not drift. A late layout change (fonts settling,
      // a row growing) used to fire this mid-swipe and snap the pager back to
      // the page the user was leaving; scrollend records where it lands.
      if (userDrivenScrollRef.current) return
      const target = currentExerciseIndexRef.current * width
      if (width === pageWidthRef.current && Math.abs(container.scrollLeft - target) <= 1) return
      alignCarousel(currentExerciseIndexRef.current)
    })
    observer.observe(container)
    return () => observer.disconnect()
    // The container only mounts post-hydration; without isHydrated the effect
    // runs once against a null ref and never attaches.
  }, [alignCarousel, isHydrated])

  // Coming back to the app is its own way of losing the carousel's place.
  //
  // Backgrounding a phone browser can hand the page back with the scroller
  // reset or parked on a different page, at the very same width — so the
  // resize observer never fires, nothing re-aligns, and the first scroll event
  // after the return persists whatever page the offset now divides into. That
  // is the "left the app and came back on the wrong exercise" case. Re-align on
  // every return, and hold index writes while the layout settles.
  useEffect(() => {
    if (!isHydrated) return
    let cancel: (() => void) | undefined
    const realign = () => {
      if (document.visibilityState !== "visible") return
      holdIndexWrites(600)
      cancel?.()
      cancel = alignCarouselWhenReady(currentExerciseIndexRef.current)
    }
    document.addEventListener("visibilitychange", realign)
    window.addEventListener("pageshow", realign)
    return () => {
      document.removeEventListener("visibilitychange", realign)
      window.removeEventListener("pageshow", realign)
      cancel?.()
    }
  }, [alignCarouselWhenReady, holdIndexWrites, isHydrated])

  // Mark scrolling as the user's. Anything that reaches the pager as input is a
  // swipe; everything else that moves it is not.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const mark = () => {
      userDrivenScrollRef.current = true
    }
    container.addEventListener("pointerdown", mark, { passive: true })
    container.addEventListener("touchstart", mark, { passive: true })
    container.addEventListener("wheel", mark, { passive: true })
    container.addEventListener("keydown", mark)
    // Each page scrolls its own set column, and that gesture reaches the pager
    // as input too. When a page's vertical scroll settles with the pager still
    // parked on the current exercise, the gesture was not a swipe: release the
    // mark, or the next layout drift would be read as the user's choice.
    // (Scroll events do not bubble, so this listens in the capture phase.)
    let settle: ReturnType<typeof setTimeout> | null = null
    const onPageScroll = (event: Event) => {
      if (event.target === container) return
      if (settle) clearTimeout(settle)
      settle = setTimeout(() => {
        settle = null
        const pageWidth = container.offsetWidth
        if (!pageWidth) return
        const parked = currentExerciseIndexRef.current * pageWidth
        if (Math.abs(container.scrollLeft - parked) <= 2) userDrivenScrollRef.current = false
      }, 150)
    }
    container.addEventListener("scroll", onPageScroll, { capture: true, passive: true })
    return () => {
      container.removeEventListener("pointerdown", mark)
      container.removeEventListener("touchstart", mark)
      container.removeEventListener("wheel", mark)
      container.removeEventListener("keydown", mark)
      container.removeEventListener("scroll", onPageScroll, { capture: true })
      if (settle) clearTimeout(settle)
    }
  }, [isHydrated])

  // Commit the exercise index the moment the swipe settles, using the native
  // scrollend event where available. This replaces the fixed settle-debounce
  // (the "wakes up late" feel); the debounce in handleScroll remains only as the
  // fallback branch. setExerciseIndex is ref-based, so a once-attached listener
  // never persists a stale session.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    if (!("onscrollend" in window)) return
    const handleScrollEnd = () => {
      const wasUserDriven = userDrivenScrollRef.current
      userDrivenScrollRef.current = false

      if (isScrollingProgrammatically.current) {
        isScrollingProgrammatically.current = false
        return
      }
      const pageWidth = container.offsetWidth
      if (!pageWidth) return
      const nextIndex = Math.round(container.scrollLeft / pageWidth)

      // Nobody swiped, so whatever moved the pager — a rotation, the keyboard,
      // the browser handing the page back after a spell in the background — has
      // parked it on the wrong exercise. Put it back rather than recording where
      // it drifted to. This is the whole bug: the pager used to keep the drift
      // and write it down as the user's choice.
      if (!wasUserDriven || isOrientationChangingRef.current) {
        if (nextIndex !== currentExerciseIndexRef.current) {
          alignCarousel(currentExerciseIndexRef.current)
        }
        return
      }

      // A settled swipe always lands exactly on a snap point.
      if (Math.abs(container.scrollLeft - nextIndex * pageWidth) > 2) return
      if (nextIndex !== currentExerciseIndexRef.current) {
        void setExerciseIndex(nextIndex)
      }
    }
    container.addEventListener("scrollend", handleScrollEnd)
    return () => container.removeEventListener("scrollend", handleScrollEnd)
    // isHydrated is a dep because the scroll container only mounts post-hydration;
    // without it the effect runs once against a null ref and never re-attaches.
  }, [alignCarousel, isLandscapeMobile, isHydrated])


  useEffect(() => {
    if (!currentExercise) return
    if (!focusIntentRef.current) {
      return
    }
    focusIntentRef.current = false
    if (isResting) return
    // No incomplete set remains (e.g. the last set was just completed) — there is
    // nothing to advance to, so don't focus/select a completed field.
    if (firstIncompleteIndex === -1) return
    const activeSet = currentExercise.sets[currentSetIndex]
    if (!activeSet?.id) return
    const weightNode = weightInputRefs.current.get(activeSet.id)
    const repsNode = repsInputRefs.current.get(activeSet.id)
    const shouldFocusReps =
      typeof activeSet.weight === "number" && activeSet.weight > 0 && (!activeSet.reps || activeSet.reps <= 0)
    const target = shouldFocusReps ? repsNode : weightNode
    if (!target) return
    const timeout = window.setTimeout(() => {
      try {
        target.focus()
        target.select()
      } catch {
        // ignore focus errors
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [currentExerciseIndex, currentSetIndex, isResting, currentExercise?.id])

  useEffect(() => {
    if (!session?.remoteSessionId) return
    if (!supabase) return

    const channel = supabase.channel(`workout-session-${session.remoteSessionId}`)

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workout_sets",
        filter: `session_id=eq.${session.remoteSessionId}`,
      },
      (payload) => {
        const row = payload.new as any
        if (!row?.id || !row.updated_at) return
        const lastSeen = lastSeenSetUpdatedAtRef.current.get(row.id)
        if (lastSeen && new Date(row.updated_at).getTime() <= new Date(lastSeen).getTime()) {
          return
        }
        lastSeenSetUpdatedAtRef.current.set(row.id, row.updated_at)

        setExercises((prev) => {
          const next = prev.map((exercise) => {
            if (exercise.id !== row.exercise_id) return exercise
            const updatedSets = [...exercise.sets]
            const existingIndex = updatedSets.findIndex((set: any) => set.id === row.id)
            const existingSet = existingIndex >= 0 ? updatedSets[existingIndex] : null
            const incomingReps = row.reps
            const incomingWeight = row.weight
            const isEditingSame = editingSetIdRef.current === row.id && editingFieldRef.current
            let mergedReps = incomingReps
            let mergedWeight = incomingWeight
            if (existingSet && isEditingSame) {
              if (editingFieldRef.current === "reps" && incomingReps !== existingSet.reps) {
                mergedReps = existingSet.reps
                setPendingRemoteUpdates((prevPending) => ({ ...prevPending, [row.id]: true }))
              }
              if (editingFieldRef.current === "weight" && incomingWeight !== existingSet.weight) {
                mergedWeight = existingSet.weight
                setPendingRemoteUpdates((prevPending) => ({ ...prevPending, [row.id]: true }))
              }
            }

            const flagsResult = row.validation_flags
              ? { flags: row.validation_flags, isIncomplete: isIncomplete(row.validation_flags) }
              : getSetFlags({
                  reps: mergedReps,
                  weight: mergedWeight,
                  targetReps: exercise.targetReps,
                  historyReps: getCachedHistoryReps(exercise.name),
                })

            const resolvedCompleted = row.completed ?? existingSet?.completed ?? false
            const nextSet = {
              ...(existingSet ?? {}),
              id: row.id,
              reps: mergedReps,
              weight: mergedWeight,
              completed: resolvedCompleted,
              validationFlags: row.validation_flags ?? flagsResult.flags,
              isIncomplete: flagsResult.isIncomplete ?? false,
              isOutlier: (row.validation_flags ?? flagsResult.flags)?.includes?.("rep_outlier"),
            }
            if (existingIndex >= 0) {
              updatedSets[existingIndex] = { ...updatedSets[existingIndex], ...nextSet }
            } else if (typeof row.set_index === "number" && row.set_index >= 0) {
              updatedSets.splice(row.set_index, 0, nextSet)
            } else {
              updatedSets.push(nextSet)
            }
            return { ...exercise, sets: updatedSets }
          })
          return next
        })
      }
    )

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workout_sessions",
        filter: `id=eq.${session.remoteSessionId}`,
      },
      (payload) => {
        const row = payload.new as any
        if (!row?.id || !row.updated_at) return
        const lastSeen = lastSeenSessionUpdatedAtRef.current.get(row.id)
        if (lastSeen && new Date(row.updated_at).getTime() <= new Date(lastSeen).getTime()) {
          return
        }
        lastSeenSessionUpdatedAtRef.current.set(row.id, row.updated_at)
        setSession((prev) => {
          if (!prev) return prev
          if (row.status && row.status !== prev.status) {
            const updated = {
              ...prev,
              status: row.status === "active" ? "in_progress" : row.status,
            }
            saveSession(updated)
            return updated
          }
          return prev
        })
      }
    )

    channel.subscribe()

    return () => {
      supabase?.removeChannel(channel)
    }
  }, [session?.remoteSessionId])

  const updateSetDataForExercise = async (
    exerciseIndex: number,
    setIndex: number,
    field: "reps" | "weight",
    value: number | null
  ) => {
    if (!session) return
    const workoutId = session.workoutId
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) {
        return exercise
      }

      const historyReps = getCachedHistoryReps(exercise.name)

      const newSets = exercise.sets.map((set: any, idx: number) => {
        if (idx !== setIndex) {
          return set
        }

        const newSet = {
          ...set,
          [field]: value,
        }

        const flagsResult = getSetFlags({
          reps: newSet.reps,
          weight: newSet.weight,
          targetReps: exercise.targetReps,
          historyReps,
        })

        const updatedSet = {
          ...newSet,
          isOutlier: flagsResult.flags.includes("rep_outlier"),
          validationFlags: flagsResult.flags,
          isIncomplete: flagsResult.isIncomplete,
        }
        if (workoutId) {
          void persistSetDraft(workoutId, exercise, updatedSet, idx)
        }
        if (session?.remoteSessionId) {
          void upsertSet({
            sessionId: session.remoteSessionId,
            setId: updatedSet.id,
            exerciseId: exercise.id,
            setIndex: idx,
            reps: updatedSet.reps,
            weight: updatedSet.weight,
            completed: updatedSet.completed,
            validationFlags: updatedSet.validationFlags,
          }).then(() => {
            setPendingRemoteUpdates((prev) => {
              if (!prev[updatedSet.id]) return prev
              const next = { ...prev }
              delete next[updatedSet.id]
              return next
            })
          })
        }
        return updatedSet
      })

      return {
        ...exercise,
        sets: newSets,
      }
    })

    exercisesRef.current = newExercises
    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
  }

  // Replace one exercise's set list and persist it everywhere the live session
  // lives. Removed sets are deleted from the draft store explicitly: its bulk
  // write merges by set id, so a set merely absent from the list would still
  // ride into the committed workout.
  const commitSetList = async (
    exerciseIndex: number,
    nextSets: any[],
    removedSets: any[],
    extra: Record<string, unknown> = {},
  ) => {
    if (!session) return null
    const workoutId = session.workoutId
    const newExercises = exercises.map((exercise: any, idx: number) => {
      if (idx !== exerciseIndex) return exercise
      return {
        ...exercise,
        ...extra,
        sets: nextSets,
        // An emptied exercise is finishable but not "completed": nothing was
        // done, so it earns no rating prompt.
        completed:
          nextSets.length > 0 && nextSets.every((set: any) => set.completed && !isSetIncomplete(set)),
      }
    })
    const exercise = newExercises[exerciseIndex]
    if (workoutId) {
      removedSets.forEach((set: any) => {
        if (set?.id) void deleteSetDraft(workoutId, set.id)
      })
      void syncExerciseDraft(workoutId, exercise, nextSets)
    }
    if (session.remoteSessionId) {
      nextSets.forEach((set: any, idx: number) => {
        void upsertSet({
          sessionId: session.remoteSessionId!,
          setId: set.id,
          exerciseId: exercise.id,
          setIndex: idx,
          reps: set.reps,
          weight: set.weight,
          completed: set.completed,
          validationFlags: set.validationFlags,
        })
      })
    }

    exercisesRef.current = newExercises
    setExercises(newExercises)
    const updatedSession: WorkoutSession = { ...session, exercises: newExercises }
    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
    return newExercises
  }

  // Drop every unlogged set so the exercise is finishable as it stands. The
  // dropped sets are kept on the exercise for UNDO and never reach the record.
  const endExerciseHere = async (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const kept = exercise.sets.filter((set: any) => set.completed)
    const dropped = exercise.sets.filter((set: any) => !set.completed)
    if (dropped.length === 0) return
    haptic("tap")
    const newExercises = await commitSetList(exerciseIndex, kept, dropped, {
      trimmedSets: [...(Array.isArray(exercise.trimmedSets) ? exercise.trimmedSets : []), ...dropped],
    })
    if (!newExercises) return

    toast(kept.length > 0 ? `Ended after set ${kept.length}` : `Skipped ${getExerciseLabel(exercise.name)}`, {
      duration: 5000,
      action: { label: "Undo", onClick: () => void restoreTrimmedSets(exerciseIndex) },
    })

    // Same hand-off as logging the last set: on to the next exercise that
    // still has work, and no rest dock counting down to nothing.
    const finishable = newExercises.every((ex: any) => canExerciseBeFinished(ex))
    if (finishable && restState) await setRestStateAndPersist(null, newExercises)
    if (!finishable && exerciseIndex === currentExerciseIndex) {
      const nextIndex = newExercises.findIndex(
        (ex: any, idx: number) => idx > exerciseIndex && !canExerciseBeFinished(ex),
      )
      if (nextIndex !== -1) await setExerciseIndex(nextIndex)
    }
  }

  const restoreTrimmedSets = async (exerciseIndex: number) => {
    const exercise = exercisesRef.current[exerciseIndex]
    const trimmed = exercise?.trimmedSets
    if (!Array.isArray(trimmed) || trimmed.length === 0) return
    haptic("tap")
    await commitSetList(exerciseIndex, [...exercise.sets, ...trimmed], [], { trimmedSets: undefined })
  }

  // One more set, prefilled from the row above it so the common case (same
  // weight, see how many reps are left) is a single check away.
  const addSet = async (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex]
    if (!exercise) return
    const last = exercise.sets[exercise.sets.length - 1]
    const reps = last?.reps ?? null
    const weight = last?.weight ?? null
    const flagsResult = getSetFlags({
      reps,
      weight,
      targetReps: exercise.targetReps,
      historyReps: getCachedHistoryReps(exercise.name),
    })
    const newSet = {
      id: generateSetId(),
      reps,
      weight,
      completed: false,
      isOutlier: flagsResult.flags.includes("rep_outlier"),
      validationFlags: flagsResult.flags,
      isIncomplete: flagsResult.isIncomplete,
    }
    haptic("tap")
    await commitSetList(exerciseIndex, [...exercise.sets, newSet], [])
  }

  const updateExerciseMachineSetting = async (
    exerciseIndex: number,
    field: "seat",
    value: string
  ) => {
    if (!session) return
    const normalizedValue = field === "seat" ? value.replace(/\D/g, "") : value
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== exerciseIndex) {
        return exercise
      }
      const nextSettings = {
        ...(exercise.machineSettings || {}),
        [field]: normalizedValue,
      }
      saveMachineSettings(exercise.name, nextSettings)
      if (userId && field === "seat") {
        void saveExerciseSettings(userId, exercise.name, { seat: normalizedValue })
      }
      return { ...exercise, machineSettings: nextSettings }
    })

    exercisesRef.current = newExercises
    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
  }

  const completeSet = async (
    setIndex: number,
    options?: {
      startRest?: boolean
      exerciseIndex?: number
    }
  ) => {
    if (!session) return
    // WebAudio only unlocks from a user gesture. This runs before the first
    // await, so it is still the tap that started rest — the chime can then fire
    // later off a bare timer.
    primeRestChime()
    const workoutId = session.workoutId
    const targetExerciseIndex = options?.exerciseIndex ?? currentExerciseIndex
    const shouldAutoRest = options?.startRest ?? targetExerciseIndex === currentExerciseIndex
    let shouldStartRest = false
    let restSecondsToStart: number | null = null
    const newExercises = exercises.map((exercise: any, exerciseIdx: number) => {
      if (exerciseIdx !== targetExerciseIndex) {
        return exercise
      }

      const historyReps = getCachedHistoryReps(exercise.name)

      const newSets = exercise.sets.map((set: any, idx: number) => {
        if (idx !== setIndex) {
          return set
        }

        const isCompleted = !set.completed
        const flagsResult = getSetFlags({
          reps: set.reps,
          weight: set.weight,
          targetReps: exercise.targetReps,
          historyReps,
        })

        if (
          shouldAutoRest &&
          isCompleted &&
          exercise.restTime > 0
        ) {
          shouldStartRest = true
          restSecondsToStart = exercise.restTime
        }

        const updatedSet = {
          ...set,
          completed: isCompleted,
          validationFlags: flagsResult.flags,
          isOutlier: flagsResult.flags.includes("rep_outlier"),
          isIncomplete: flagsResult.isIncomplete,
        }
        if (workoutId) {
          void persistSetDraft(workoutId, exercise, updatedSet, idx)
        }
        if (session?.remoteSessionId) {
          void upsertSet({
            sessionId: session.remoteSessionId,
            setId: updatedSet.id,
            exerciseId: exercise.id,
            setIndex: idx,
            reps: updatedSet.reps,
            weight: updatedSet.weight,
            completed: updatedSet.completed,
            validationFlags: updatedSet.validationFlags,
          }).then(() => {
            setPendingRemoteUpdates((prev) => {
              if (!prev[updatedSet.id]) return prev
              const next = { ...prev }
              delete next[updatedSet.id]
              return next
            })
          })
        }
        return updatedSet
      })

      const allSetsCompleted = newSets.every((set: any) => set.completed && !isSetIncomplete(set))

      return {
        ...exercise,
        sets: newSets,
        completed: allSetsCompleted,
      }
    })

    exercisesRef.current = newExercises
    setExercises(newExercises)

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: newExercises,
    }

    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()

    const workoutNowFinishable = newExercises.every((ex: any) => canExerciseBeFinished(ex))
    if (workoutNowFinishable) shouldStartRest = false

    if (shouldAutoRest && shouldStartRest) {
      const restSeconds =
        restSecondsToStart ??
        exercises[targetExerciseIndex]?.restTime ??
        extractRestSeconds(exercises[targetExerciseIndex]?.notes)
      await setRestStateAndPersist({
        exerciseIndex: targetExerciseIndex,
        setIndex,
        remainingSeconds: restSeconds,
      }, newExercises)
      scheduleRestNotification(restSeconds)
    }

    // Checking off a set clears any text-box selection so nothing stays
    // highlighted from the set the user just logged, and drops the keyboard. The
    // next set's weight is already prefilled from progression, so it is left
    // un-focused — selectable if the user chooses to change it, but rarely their
    // next move, so we don't force focus there. Only runs when a set was actually
    // completed (not un-checked) on the exercise currently on screen.
    const toggledSet = newExercises[targetExerciseIndex]?.sets?.[setIndex]
    if (toggledSet?.completed && targetExerciseIndex === currentExerciseIndex) {
      if (typeof document !== "undefined") {
        const active = document.activeElement as HTMLElement | null
        if (active && typeof active.blur === "function") active.blur()
      }
      setFocusedInput(null)
    }
    // Confirms the tap landed without the user having to look at the screen —
    // the whole point of a check button you hit with a bar still in your hands.
    if (toggledSet?.completed) haptic("logged")

    // Nothing left to rest for. Without this the dock lingers over a FINISH
    // button counting down to a set that does not exist.
    if (workoutNowFinishable && restState) {
      await setRestStateAndPersist(null, newExercises)
    }

    // Clearing an exercise used to leave the user parked on a finished page,
    // having to swipe or hit the rail before they could log anything else.
    // Advance for them — but without focus intent, since rest has just started
    // and popping the keyboard into a rest period would be wrong.
    if (
      toggledSet?.completed &&
      targetExerciseIndex === currentExerciseIndex &&
      !workoutNowFinishable &&
      canExerciseBeFinished(newExercises[targetExerciseIndex])
    ) {
      const nextIndex = newExercises.findIndex(
        (ex: any, idx: number) => idx > targetExerciseIndex && !canExerciseBeFinished(ex),
      )
      if (nextIndex !== -1) await setExerciseIndex(nextIndex)
    }
  }

  const rateExercise = async (exerciseIndex: number, rating: ExerciseRating) => {
    if (!session) return
    const newExercises = exercises.map((exercise: any, idx: number) => {
      if (idx !== exerciseIndex) return exercise
      return { ...exercise, rating: exercise.rating === rating ? null : rating }
    })
    exercisesRef.current = newExercises
    setExercises(newExercises)
    const updatedSession: WorkoutSession = { ...session, exercises: newExercises }
    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
  }

  // Reads the latest session/exercises via refs so it is safe to call from a
  // once-attached scrollend listener as well as from fresh render closures.
  const setExerciseIndex = async (nextIndex: number) => {
    const baseSession = sessionRef.current
    if (!baseSession) return
    if (nextIndex < 0 || nextIndex >= exercisesRef.current.length) return
    if (nextIndex === currentExerciseIndexRef.current) return

    const updatedSession: WorkoutSession = {
      ...baseSession,
      currentExerciseIndex: nextIndex,
    }
    sessionRef.current = updatedSession
    setSession(updatedSession)
    await saveSession(updatedSession)
    setValidationTrigger(0)
  }

  const canSaveToRoutine = useMemo(
    () => Boolean(session?.routineId && getRoutineById(session.routineId)),
    [session?.routineId],
  )

  // Apply a new exercise order coming from the reorder sheet.
  // Reordering moves whole exercise objects (with their logged sets) so no set
  // data is lost. The active exercise is tracked by id so it stays active.
  const applyReorder = async (orderedIds: string[], saveToRoutine: boolean) => {
    if (!session) return

    const byId = new Map<string, any>(exercises.map((exercise: any) => [exercise.id, exercise]))
    // Rebuild from the requested order, dropping unknown ids and appending any
    // exercise the sheet somehow omitted so nothing is ever lost.
    const seen = new Set<string>()
    const newExercises: any[] = []
    for (const id of orderedIds) {
      if (seen.has(id)) continue
      const exercise = byId.get(id)
      if (!exercise) continue
      seen.add(id)
      newExercises.push(exercise)
    }
    for (const exercise of exercises) {
      if (!seen.has(exercise.id)) newExercises.push(exercise)
    }

    if (newExercises.length !== exercises.length) {
      setIsReorderOpen(false)
      return
    }

    // Keep the active exercise active after the move.
    const activeId = exercises[currentExerciseIndex]?.id
    const remappedIndex = activeId ? newExercises.findIndex((e: any) => e.id === activeId) : -1
    const nextIndex = remappedIndex >= 0 ? remappedIndex : 0

    const orderChanged = newExercises.some((exercise: any, idx: number) => exercise.id !== exercises[idx]?.id)

    if (orderChanged) {
      setExercises(newExercises)
      const updatedSession: WorkoutSession = {
        ...session,
        exercises: newExercises,
        currentExerciseIndex: nextIndex,
      }
      setSession(updatedSession)
      await saveSession(updatedSession)
      // If the active exercise's index changed, the currentExerciseIndex effect
      // re-runs and smooth-scrolls the carousel to it (managing the programmatic
      // scroll guard itself). If the index is unchanged, the carousel is already
      // positioned correctly and the reordered pages just re-key in place.
      setValidationTrigger(0)
    }

    if (saveToRoutine && session.routineId) {
      const routine = getRoutineById(session.routineId)
      if (routine) {
        const normalize = (name: string) => name.toLowerCase().trim().replace(/\s+/g, " ")
        const remaining = [...routine.exercises]
        const reordered: typeof routine.exercises = []
        for (const exercise of newExercises) {
          let matchIdx = remaining.findIndex((r) => r.id === exercise.id)
          if (matchIdx === -1) {
            matchIdx = remaining.findIndex((r) => normalize(r.name) === normalize(exercise.name))
          }
          if (matchIdx >= 0) {
            reordered.push(remaining[matchIdx])
            remaining.splice(matchIdx, 1)
          }
        }
        // Keep any routine exercises that weren't part of this session at the end.
        reordered.push(...remaining)
        saveRoutine({ ...routine, exercises: reordered })
        toast.success("Order saved to routine")
      }
    }

    setIsReorderOpen(false)
  }

  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return

    if (isOrientationChangingRef.current) return

    // A smooth scrollTo emits a stream of scroll events. Clearing the guard on
    // the first of them left the rest — and the scrollend that follows — being
    // read as a swipe. The guard is released by scrollend, or by the timeout in
    // the effect that set it.
    if (isScrollingProgrammatically.current) return

    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const pageWidth = container.offsetWidth
      // Mid-relayout (e.g. an orientation flip) the container can briefly
      // report a 0 width and scrollLeft 0. Ignore those frames so a spurious
      // exercise index 0 is never written to the session.
      if (!pageWidth) return
      const nextIndex = Math.round(container.scrollLeft / pageWidth)
      // Optimistic: highlight the rail segment while the swipe is still moving.
      // Only for a real swipe — a relayout dragging the offset across pages must
      // not walk the header and rail through exercises the user never went to.
      if (userDrivenScrollRef.current && nextIndex !== uiExerciseIndex) {
        setUiExerciseIndex(nextIndex)
      }

      // Persist the index. Prefer the native scrollend event (handled by its own
      // listener); only fall back to the settle-debounce where scrollend is
      // unavailable (e.g. older iOS Safari).
      if (!("onscrollend" in window)) {
        if (scrollSettleTimeoutRef.current) {
          clearTimeout(scrollSettleTimeoutRef.current)
        }
        scrollSettleTimeoutRef.current = setTimeout(() => {
          const wasUserDriven = userDrivenScrollRef.current
          userDrivenScrollRef.current = false
          if (isOrientationChangingRef.current) return
          if (!wasUserDriven) {
            if (nextIndex !== currentExerciseIndexRef.current) {
              alignCarousel(currentExerciseIndexRef.current)
            }
            return
          }
          if (Math.abs(container.scrollLeft - nextIndex * pageWidth) > 2) return
          if (nextIndex !== currentExerciseIndexRef.current) {
            void setExerciseIndex(nextIndex)
          }
        }, 120)
      }
    })
  }

  const finishWorkout = async () => {
    if (!session) return
    if (isFinishing) return
    setIsFinishing(true)
    const cleanedExercises = exercises.map((exercise: any) => {
      const nonGhostSets = exercise.sets.filter((set: any) => !isGhostSet(set))
      const trimmedSets = canCutOffFinalSet({ ...exercise, sets: nonGhostSets })
        ? nonGhostSets.slice(0, -1)
        : nonGhostSets
      const allCompleted = trimmedSets.every((set: any) => set.completed && !isSetIncomplete(set))
      return {
        ...exercise,
        sets: trimmedSets,
        completed: allCompleted,
      }
    })
    const firstInvalidExerciseIndex = cleanedExercises.findIndex(
      (exercise: any) => !canExerciseBeFinished(exercise)
    )
    if (firstInvalidExerciseIndex !== -1) {
      if (firstInvalidExerciseIndex !== currentExerciseIndex) {
        const updatedSession: WorkoutSession = {
          ...session,
          currentExerciseIndex: firstInvalidExerciseIndex,
        }
        setSession(updatedSession)
        await saveSession(updatedSession)
      }
      setValidationTrigger(Date.now())
      setIsFinishing(false)
      return
    }
    const completedSets = cleanedExercises.reduce((total: number, ex: any) => {
      return total + ex.sets.filter((s: any) => isSetEligibleForStats(s)).length
    }, 0)

    const totalSets = cleanedExercises.reduce((total: number, ex: any) => total + ex.sets.length, 0)

    const totalVolume = cleanedExercises.reduce((vol: number, ex: any) => {
      return (
        vol +
        ex.sets.filter((s: any) => isSetEligibleForStats(s)).reduce((sum: number, set: any) => {
          return sum + (set.weight ?? 0) * (set.reps ?? 0)
        }, 0)
      )
    }, 0)

    const totalReps = cleanedExercises.reduce((reps: number, ex: any) => {
      return (
        reps +
        ex.sets
          .filter((s: any) => isSetEligibleForStats(s))
          .reduce((sum: number, set: any) => sum + (set.reps ?? 0), 0)
      )
    }, 0)

    const completedWorkoutId =
      session.workoutId ?? (isUuid(session.id) ? session.id : generateWorkoutId())
    const completedAtDate = new Date()
    const completedAt = completedAtDate.toISOString()
    const localDateForDisplay = new Date(completedAtDate)
    localDateForDisplay.setHours(12, 0, 0, 0)
    const sessionStartedAt = session.startedAt ?? completedAt
    const durationSeconds = Math.floor(
      (completedAtDate.getTime() - new Date(sessionStartedAt).getTime()) / 1000
    )
    const completedWorkout = {
      id: completedWorkoutId,
      name: routine.name,
      date: localDateForDisplay.toISOString(),
      startedAt: sessionStartedAt,
      endedAt: completedAt,
      duration: durationSeconds,
      durationUnit: "seconds" as const,
      exercises: cleanedExercises.map((ex: any) => ({
        id: ex.id,
        name: ex.name,
        targetSets: ex.targetSets,
        targetReps: ex.targetReps,
        targetWeight: ex.targetWeight,
        restTime: ex.restTime,
        completed: ex.completed,
        rating: ex.rating ?? null,
        sets: ex.sets,
        previousPerformance: ex.previousPerformance,
      })),
      stats: {
        totalSets,
        completedSets,
        totalVolume,
        totalReps,
      },
    }

    try {
      await Promise.resolve(saveWorkout(completedWorkout))
    } catch (error) {
      console.error("Failed to save workout", error)
      toast.error("Couldn't save workout. Please try again.")
      setIsFinishing(false)
      return
    }

    try {
      if (userId) {
        const existingDraft = await getWorkoutDraft(completedWorkoutId)
        if (!existingDraft) {
          await createWorkoutDraft({
            workout_id: completedWorkoutId,
            user_id: userId,
            started_at: session.startedAt,
            routine_id: routine.id,
            routine_name: routine.name,
          })
        }
        const exerciseRatings: Record<string, ExerciseRating> = {}
        cleanedExercises.forEach((exercise: any) => {
          const exId = exercise?.id || exercise?.name
          if (exId) exerciseRatings[exId] = exercise.rating ?? null
        })
        await updateWorkoutDraft(completedWorkoutId, {
          completed_at: completedAt,
          routine_id: routine.id,
          routine_name: routine.name,
          exercise_ratings: exerciseRatings,
        })
        await markWorkoutPending(completedWorkoutId)
        const allSetDrafts: WorkoutSetDraft[] = []
        cleanedExercises.forEach((exercise: any) => {
          if (!exercise?.sets) return
          exercise.sets.forEach((set: any, idx: number) => {
            if (!set?.id) return
            allSetDrafts.push({
              set_id: set.id,
              workout_id: completedWorkoutId,
              exercise_id: exercise.id,
              exercise_name: exercise.name,
              set_index: idx,
              reps: set.reps ?? null,
              weight: set.weight ?? null,
              completed: Boolean(set.completed),
              updated_at_client: Date.now(),
            })
          })
        })
        await upsertAllSets(completedWorkoutId, allSetDrafts)
        setSyncState("syncing")
        void attemptWorkoutSync({ workoutId: completedWorkoutId }).then((result) => {
          setSyncState(result.status)
          if (result.status === "synced") {
            setLastSyncedAt(result.syncedAt ?? new Date().toISOString())
          }
        })
      }
    } catch (error) {
      console.warn("Workout commit failed", error)
      void markWorkoutError(completedWorkoutId, "Commit failed")
      setSyncState("error")
    }

    if (session) {
      const completedSession: WorkoutSession = {
        ...session,
        status: "completed",
        endedAt: completedAt,
        activeDurationSeconds: 0,
        restTimer: undefined,
        exercises: cleanedExercises,
      }
      void saveSession(completedSession)
    }

    deleteSetsForSession(session.id)
    deleteSession(session.id)
    saveCurrentSessionId(null)
    clearActiveWorkoutRoute()
    setSession(null)
    setValidationTrigger(0)
    router.push(`/workout-summary?workoutId=${completedWorkoutId}`)
  }

  const handleExit = async () => {
    if (session?.status === "in_progress") {
      const updatedSession: WorkoutSession = {
        ...session,
        status: "paused",
      }

      setSession(updatedSession)
      await saveSession(updatedSession)
    }
    // The user chose to leave the session screen, so home is now where they
    // are. Drop the breadcrumb so a cold start lands on home rather than
    // yanking them back into the workout.
    clearActiveWorkoutRoute()
    router.push("/")
  }


  const pauseSession = async () => {
    const baseSession = sessionRef.current
    if (baseSession?.status !== "in_progress") return
    const persistedRestTimer = baseSession.restTimer ?? restState ?? undefined
    const updatedSession: WorkoutSession = {
      ...baseSession,
      status: "paused",
      restTimer: persistedRestTimer,
      exercises: exercisesRef.current.length > 0 ? exercisesRef.current : baseSession.exercises,
    }
    setSession(updatedSession)
    await saveSession(updatedSession)
    signalAutoSaved()
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void pauseSession()
      }
    }
    const handlePageHide = () => {
      void pauseSession()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [session?.id, session?.status, restState])


  const handleTogglePlateCalc = () => {
    const newValue = !showPlateCalc
    setShowPlateCalc(newValue)
    if (currentExercise?.name && typeof window !== "undefined") {
      localStorage.setItem(`plate_viz_${currentExercise.name}`, JSON.stringify(newValue))
    }
  }

  const handleSetFieldFocus = (setId: string, field: "reps" | "weight") => {
    setEditingSetId(setId)
    setEditingField(field)
    editingSetIdRef.current = setId
    editingFieldRef.current = field
  }

  const handleSetFieldBlur = (setId: string, field: "reps" | "weight") => {
    if (editingSetId === setId && editingField === field) {
      setEditingSetId(null)
      setEditingField(null)
    }
    if (editingSetIdRef.current === setId && editingFieldRef.current === field) {
      editingSetIdRef.current = null
      editingFieldRef.current = null
    }
  }

  const handleInputAutoSelect = (event: React.FocusEvent<HTMLInputElement>) => {
    const target = event.currentTarget
    window.setTimeout(() => {
      try {
        target.select()
      } catch {
        // ignore selection errors
      }
    }, 0)
  }

  const signalAutoSaved = () => {
    setRecentlySaved(true)
    if (recentlySavedTimeoutRef.current) {
      clearTimeout(recentlySavedTimeoutRef.current)
    }
    recentlySavedTimeoutRef.current = setTimeout(() => {
      setRecentlySaved(false)
      recentlySavedTimeoutRef.current = null
    }, 2000)
  }

  // Stable prop identities for the memoized ExercisePage. The heavy data
  // handlers close over session/exercises, so they are wrapped through a "latest
  // handlers" ref: the wrapper identity is stable (empty deps), but it always
  // dispatches to the freshest handler — no stale closures, no touched internals.
  const exercisePageHandlersRef = useRef({
    updateExerciseMachineSetting,
    handleTogglePlateCalc,
    updateSetDataForExercise,
    handleSetFieldFocus,
    handleSetFieldBlur,
    handleInputAutoSelect,
    completeSet,
    rateExercise,
    endExerciseHere,
    restoreTrimmedSets,
    addSet,
  })
  exercisePageHandlersRef.current = {
    updateExerciseMachineSetting,
    handleTogglePlateCalc,
    updateSetDataForExercise,
    handleSetFieldFocus,
    handleSetFieldBlur,
    handleInputAutoSelect,
    completeSet,
    rateExercise,
    endExerciseHere,
    restoreTrimmedSets,
    addSet,
  }
  const stableUpdateMachineSetting = useCallback(
    (i: number, f: "seat", v: string) => exercisePageHandlersRef.current.updateExerciseMachineSetting(i, f, v),
    [],
  )
  const stableTogglePlateCalc = useCallback(
    () => exercisePageHandlersRef.current.handleTogglePlateCalc(),
    [],
  )
  const stableUpdateSetData = useCallback(
    (i: number, s: number, f: "reps" | "weight", v: number | null) =>
      exercisePageHandlersRef.current.updateSetDataForExercise(i, s, f, v),
    [],
  )
  const stableSetFieldFocus = useCallback(
    (id: string, f: "reps" | "weight") => exercisePageHandlersRef.current.handleSetFieldFocus(id, f),
    [],
  )
  const stableSetFieldBlur = useCallback(
    (id: string, f: "reps" | "weight") => exercisePageHandlersRef.current.handleSetFieldBlur(id, f),
    [],
  )
  const stableInputAutoSelect = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => exercisePageHandlersRef.current.handleInputAutoSelect(e),
    [],
  )
  const stableCompleteSet = useCallback(
    (s: number, o?: { startRest?: boolean; exerciseIndex?: number }) =>
      exercisePageHandlersRef.current.completeSet(s, o),
    [],
  )
  const stableRateExercise = useCallback(
    (i: number, r: ExerciseRating) => exercisePageHandlersRef.current.rateExercise(i, r),
    [],
  )
  const stableEndExerciseHere = useCallback(
    (i: number) => exercisePageHandlersRef.current.endExerciseHere(i),
    [],
  )
  const stableRestoreTrimmedSets = useCallback(
    (i: number) => exercisePageHandlersRef.current.restoreTrimmedSets(i),
    [],
  )
  const stableAddSet = useCallback((i: number) => exercisePageHandlersRef.current.addSet(i), [])
  const registerWeightRef = useCallback((setId: string, node: HTMLInputElement | null) => {
    if (node) weightInputRefs.current.set(setId, node)
    else weightInputRefs.current.delete(setId)
  }, [])
  const registerRepsRef = useCallback((setId: string, node: HTMLInputElement | null) => {
    if (node) repsInputRefs.current.set(setId, node)
    else repsInputRefs.current.delete(setId)
  }, [])
  // Lets a set row hand focus to its sibling field (weight -> reps on Enter)
  // without the ref maps leaking out of the parent.
  const focusSetField = useCallback((setId: string, field: "reps" | "weight") => {
    const node =
      field === "weight" ? weightInputRefs.current.get(setId) : repsInputRefs.current.get(setId)
    if (!node) return
    try {
      node.focus()
      node.select()
    } catch {
      // ignore focus errors
    }
  }, [])
  // Keyboard accessory bar. The iOS number pad has no return key, so every
  // Enter shortcut on the set row never exists on the phone: changing a number
  // meant tap, type, tap away to drop the keyboard, hunt for the check. While
  // a set field is focused the bar sits on the visual viewport's bottom edge —
  // above the keypad — with the step the field wants, NEXT and LOG SET.
  const editingSet = (() => {
    if (!editingSetId || !editingField) return null
    for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
      const sets: any[] = exercises[exerciseIndex].sets ?? []
      const setIndex = sets.findIndex((set: any) => set.id === editingSetId)
      if (setIndex === -1) continue
      const set = sets[setIndex]
      const nextTarget: { setId: string; field: "reps" | "weight" } | null =
        editingField === "weight"
          ? { setId: set.id, field: "reps" }
          : sets[setIndex + 1]?.id
            ? { setId: sets[setIndex + 1].id, field: "weight" }
            : null
      return { exerciseIndex, setIndex, set, nextTarget }
    }
    return null
  })()

  const blurActiveInput = () => {
    if (typeof document === "undefined") return
    const active = document.activeElement as HTMLElement | null
    if (active && typeof active.blur === "function") active.blur()
    setFocusedInput(null)
  }

  const stepEditingField = (delta: number) => {
    if (!editingSet || !editingField) return
    const { exerciseIndex, setIndex, set } = editingSet
    haptic("tap")
    if (editingField === "weight") {
      const base = typeof set.weight === "number" ? set.weight : 0
      void updateSetDataForExercise(exerciseIndex, setIndex, "weight", Math.max(0, base + delta))
      return
    }
    const base = typeof set.reps === "number" ? set.reps : 0
    const next = Math.min(REP_MAX, Math.max(REP_MIN, base + delta))
    setRepCapErrors((prev) => ({ ...prev, [set.id]: false }))
    void updateSetDataForExercise(exerciseIndex, setIndex, "reps", next)
  }

  const advanceFromEditingField = () => {
    if (!editingSet) return
    if (editingSet.nextTarget) {
      focusSetField(editingSet.nextTarget.setId, editingSet.nextTarget.field)
      return
    }
    blurActiveInput()
  }

  const logEditingSet = () => {
    if (!editingSet) return
    const { exerciseIndex, setIndex, set } = editingSet
    if (set.completed) {
      blurActiveInput()
      return
    }
    if (isSetIncomplete(set) || repCapErrors[set.id]) {
      setValidationTrigger(Date.now())
      return
    }
    const isCurrent = exerciseIndex === currentExerciseIndex && setIndex === currentSetIndex
    void completeSet(setIndex, { exerciseIndex, startRest: isCurrent })
  }

  const openExercisePage = useCallback(
    (name: string) => {
      router.push(`/exercise/${encodeURIComponent(name)}?from=session`)
    },
    [router],
  )

  if (!isHydrated || exercises.length === 0) {
    return (
      <div
        className="min-h-screen"
        style={{
          background: "var(--background)",
        }}
      />
    )
  }

  if (isLandscapeMobile) {
    const lsExercise = exercises[uiExerciseIndex]
    if (!lsExercise) return null
    const lsCurrentSetIndex = lsExercise.sets.findIndex((s: any) => !s.completed)
    const lsActiveSetIndex = lsCurrentSetIndex === -1 ? 0 : lsCurrentSetIndex
    const lsCanEdit = uiExerciseIndex <= currentExerciseIndex

    return (
      <div
        className="flex flex-col"
        style={{
          height: "var(--app-vh)",
          background: "var(--background)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {/* Rest timer overlay */}
        <AnimatePresence>
          {isResting && restState ? (
            <motion.div
              key="rest-dock-ls"
              className="fixed z-[70] flex items-center justify-between gap-3 border"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.2, ease: "easeOut" } }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{
                left: "calc(16px + env(safe-area-inset-left, 0px))",
                right: "calc(16px + env(safe-area-inset-right, 0px))",
                bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
                borderColor: restRemainingSeconds <= 10 ? "var(--ink-35)" : "var(--ink-15)",
                background: "rgba(0,0,0,0.75)",
                borderRadius: "var(--radius-xs)",
                padding: "6px 10px",
              }}
            >
              <motion.div
                className="flex items-end gap-2"
                animate={{ opacity: restRemainingSeconds <= 10 ? [0.8, 1, 0.8] : 1 }}
                transition={restRemainingSeconds <= 10 ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
              >
                <div className="flex flex-col items-start" style={{ paddingBottom: "3px" }}>
                  <div className="text-ink-50" style={{ fontSize: "8px", fontWeight: 600, letterSpacing: "0.12em" }}>REST</div>
                  {restExtensionTrend && (restExtensionTrend.currentMonthCount > 0 || restExtensionTrend.lastMonthCount > 0) && (
                    <div style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.04em", color: "var(--ink-20)", lineHeight: 1, marginTop: "2px" }}>
                      {restExtensionTrend.direction === "up" ? "↑" : restExtensionTrend.direction === "down" ? "↓" : "–"}{restExtensionTrend.currentMonthCount}/mo
                    </div>
                  )}
                </div>
                <div className="text-white leading-none" style={{ fontSize: "32px", fontWeight: 400, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-display)" }}>
                  {formatSeconds(restRemainingSeconds)}
                </div>
              </motion.div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustRest(-30)}
                  disabled={restRemainingSeconds <= 5}
                  style={{ background: "var(--ink-06)", border: "none", borderRadius: "var(--radius-flat)", padding: "5px 8px", opacity: restRemainingSeconds <= 5 ? 0.35 : 1, touchAction: "manipulation" }}
                  type="button"
                >
                  <span className="text-ink-90" style={{ fontSize: "10px", fontWeight: 500 }}>−30s</span>
                </button>
                <button
                  onClick={() => adjustRest(30)}
                  style={{ background: "var(--ink-06)", border: "none", borderRadius: "var(--radius-flat)", padding: "5px 8px", touchAction: "manipulation" }}
                  type="button"
                >
                  <span className="text-ink-90" style={{ fontSize: "10px", fontWeight: 500 }}>+30s</span>
                </button>
                <button
                  onClick={() => void setRestStateAndPersist(null)}
                  style={{ background: "var(--ink-08)", border: "none", borderRadius: "var(--radius-flat)", padding: "5px 10px" }}
                  type="button"
                >
                  <span className="text-ink-95" style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em" }}>SKIP</span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Header */}
        <div style={{ padding: "10px 16px 6px", flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <button onClick={handleExit} type="button" style={{ flexShrink: 0 }}>
              <ArrowLeft size={16} strokeWidth={1.5} style={{ color: "var(--ink-50)" }} />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                className="text-ink-95"
                style={{ fontSize: "20px", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "var(--font-display)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                onClick={() => router.push(`/exercise/${encodeURIComponent(lsExercise.name)}?from=session`)}
              >
                {getExerciseLabel(lsExercise.name)}
              </h1>
              <div className="text-ink-50" style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.1em", marginTop: "2px", fontFamily: "var(--font-label)" }}>
                EXERCISE {uiExerciseIndex + 1} • {lsExercise.sets.length} {plural(lsExercise.sets.length, "SET", "SETS")}{lsExercise.targetReps ? ` • TARGET ${lsExercise.targetReps} ${plural(Number(lsExercise.targetReps), "REP", "REPS")}` : ""} • {session?.startedAt ? <SessionClock startedAt={session.startedAt} render={(f) => <>{f}</>} /> : formatSeconds(elapsedSeconds)}
                {pacePillLabel && <span style={{ color: pacePillLabel.color }}> • {pacePillLabel.text}</span>}
              </div>
            </div>

            <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
              <div className="text-center">
                <div className="text-ink-50" style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.12em", marginBottom: "1px" }}>SETS</div>
                <div className="text-ink-70" style={{ fontSize: "11px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{totalSetsCompleted}/{totalSets}</div>
              </div>
              <div style={{ width: "1px", height: "16px", background: "var(--ink-06)" }} />
              <button
                onClick={() => { if (!canFinishWorkout) return; void finishWorkout() }}
                className="transition-colors duration-base"
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  padding: "6px 12px",
                  borderRadius: "var(--radius-flat)",
                  color: canFinishWorkout ? "var(--ink-95)" : "var(--ink-30)",
                  background: canFinishWorkout ? "var(--ink-06)" : "var(--ink-02)",
                  border: `1px solid ${canFinishWorkout ? "var(--ink-12)" : "var(--ink-08)"}`,
                }}
                type="button"
                disabled={!canFinishWorkout}
              >
                FINISH
              </button>
            </div>
          </div>

          {/* Exercise navigation dots */}
          <div className="relative flex items-center justify-center gap-1.5 mt-2">
            {exercises.map((ex: any, index: number) => {
              const isComplete = ex.sets.every((s: any) => s.completed && !isSetIncomplete(s))
              const isCurrent = index === uiExerciseIndex
              return (
                <button
                  key={ex.id}
                  onClick={() => { focusIntentRef.current = true; void setExerciseIndex(index) }}
                  type="button"
                  className="transition-all duration-base"
                  style={{
                    width: isCurrent ? "20px" : "5px",
                    height: "5px",
                    background: isCurrent ? "var(--ink-50)" : isComplete ? "var(--ink-30)" : "var(--ink-12)",
                    borderRadius: "var(--radius-flat)",
                    border: "none",
                  }}
                />
              )
            })}
            {exercises.length > 1 ? (
              <button
                type="button"
                aria-label="Reorder exercises"
                onClick={() => setIsReorderOpen(true)}
                className="tap-target absolute"
                style={{ right: 0, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", padding: "4px" }}
              >
                <ListOrdered size={14} strokeWidth={1.5} style={{ color: "var(--ink-50)" }} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, var(--ink-06), transparent)", margin: "0 16px", flexShrink: 0 }} />

        {/* Sets list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 64px" }}>
          {lsExercise.sets.map((set: any, setIndex: number) => {
            const setKey = set.id ?? `${lsExercise.id}-${setIndex}`
            const isCurrentSet = setIndex === lsActiveSetIndex
            const repCapError = repCapErrors[setKey] || set.validationFlags?.includes("reps_hard_invalid")
            const missingWeight = isMissingWeight(set.weight)
            const missingReps = isMissingReps(set.reps)
            const showMissing = Boolean(validationTrigger) && isCurrentSet && (missingWeight || missingReps)
            const lastSet = getMostRecentCompletedSetPerformance(lsExercise.name, setIndex, session?.id)
            const comparison = getSetComparison(
              set, lastSet,
              maxSetVolumeByExercise.get(normalizeExerciseName(lsExercise.name)) ?? 0
            )
            const lsChip =
              typeof set.weight === "number" && typeof set.reps === "number"
                ? setComparisonToChip(comparison, set, lastSet)
                : null

            return (
              <div
                key={setKey}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--ink-04)",
                  opacity: isCurrentSet ? 1 : set.completed ? 0.45 : 0.65,
                }}
              >
                {/* Set number */}
                <div style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.12em", color: "var(--ink-50)", fontFamily: "var(--font-label)", minWidth: "28px", flexShrink: 0 }}>
                  SET {setIndex + 1}
                </div>

                {/* Weight input */}
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={set.weight ?? ""}
                    onChange={(e) => {
                      if (!lsCanEdit) return
                      const raw = e.target.value
                      if (!raw.trim()) { void updateSetDataForExercise(uiExerciseIndex, setIndex, "weight", null); return }
                      const parsed = parseNumber(raw)
                      if (parsed === null || parsed < 0) return
                      void updateSetDataForExercise(uiExerciseIndex, setIndex, "weight", parsed)
                    }}
                    onFocus={(e) => {
                      if (set.id) handleSetFieldFocus(set.id, "weight")
                      handleInputAutoSelect(e)
                      setFocusedInput(`${setKey}-weight`)
                    }}
                    onBlur={() => {
                      if (set.id) handleSetFieldBlur(set.id, "weight")
                      setFocusedInput(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return
                      e.preventDefault()
                      if (set.id) focusSetField(set.id, "reps")
                    }}
                    inputMode="decimal"
                    enterKeyHint="next"
                    placeholder="—"
                    disabled={!lsCanEdit}
                    className="w-full"
                    style={{
                      background: set.completed ? "var(--ink-02)" : focusedInput === `${setKey}-weight` ? "var(--ink-06)" : "var(--ink-04)",
                      border: `1px solid ${showMissing && missingWeight ? "var(--ink-40)" : focusedInput === `${setKey}-weight` ? "var(--ink-20)" : "transparent"}`,
                      borderRadius: "var(--radius-flat)", padding: "6px", fontSize: "16px", fontWeight: 600, letterSpacing: "-0.02em",
                      color: set.completed ? "var(--ink-25)" : "var(--ink-95)",
                      fontVariantNumeric: "tabular-nums", outline: "none", textAlign: "center",
                    }}
                  />
                  <div style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-50)", textAlign: "center", marginTop: "2px" }}>LBS</div>
                </div>

                {/* Reps input */}
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={set.reps ?? ""}
                    onChange={(e) => {
                      if (!lsCanEdit) return
                      const raw = e.target.value
                      if (!raw.trim()) { setRepCapErrors((prev) => ({ ...prev, [setKey]: false })); void updateSetDataForExercise(uiExerciseIndex, setIndex, "reps", null); return }
                      const parsed = parseNumber(raw)
                      if (parsed === null) return
                      if (parsed > REP_MAX) { setRepCapErrors((prev) => ({ ...prev, [setKey]: true })); return }
                      setRepCapErrors((prev) => ({ ...prev, [setKey]: false }))
                      void updateSetDataForExercise(uiExerciseIndex, setIndex, "reps", Math.max(REP_MIN, parsed))
                    }}
                    onFocus={(e) => {
                      if (set.id) handleSetFieldFocus(set.id, "reps")
                      handleInputAutoSelect(e)
                      setFocusedInput(`${setKey}-reps`)
                    }}
                    onBlur={() => {
                      if (set.id) handleSetFieldBlur(set.id, "reps")
                      setFocusedInput(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return
                      e.preventDefault()
                      e.currentTarget.blur()
                      if (!lsCanEdit || set.completed) return
                      if (isSetIncomplete(set) || repCapError) {
                        setValidationTrigger(Date.now())
                        return
                      }
                      void completeSet(setIndex, {
                        exerciseIndex: uiExerciseIndex,
                        startRest: isCurrentSet && uiExerciseIndex === currentExerciseIndex,
                      })
                    }}
                    inputMode="numeric"
                    enterKeyHint="done"
                    placeholder="—"
                    disabled={!lsCanEdit}
                    className="w-full"
                    style={{
                      background: set.completed ? "var(--ink-02)" : focusedInput === `${setKey}-reps` ? "var(--ink-06)" : "var(--ink-04)",
                      border: `1px solid ${(repCapError || (showMissing && missingReps)) ? "var(--ink-40)" : focusedInput === `${setKey}-reps` ? "var(--ink-20)" : "transparent"}`,
                      borderRadius: "var(--radius-flat)", padding: "6px", fontSize: "16px", fontWeight: 600, letterSpacing: "-0.02em",
                      color: set.completed ? "var(--ink-25)" : "var(--ink-95)",
                      fontVariantNumeric: "tabular-nums", outline: "none", textAlign: "center",
                    }}
                  />
                  <div style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-50)", textAlign: "center", marginTop: "2px" }}>REPS</div>
                </div>

                {/* Complete button */}
                <button
                  onClick={() => {
                    if (!lsCanEdit) return
                    if (!set.completed && (isSetIncomplete(set) || repCapError)) { setValidationTrigger(Date.now()); return }
                    void completeSet(setIndex, { exerciseIndex: uiExerciseIndex, startRest: isCurrentSet && uiExerciseIndex === currentExerciseIndex })
                  }}
                  disabled={!lsCanEdit || (!set.completed && (isSetIncomplete(set) || repCapError))}
                  className="tap-target flex items-center justify-center"
                  style={{
                    width: "32px", height: "32px",
                    background: set.completed ? "var(--ink-08)" : "var(--ink-04)",
                    border: "none", borderRadius: "var(--radius-flat)", flexShrink: 0,
                    opacity: !lsCanEdit || (!set.completed && (isSetIncomplete(set) || repCapError)) ? 0.35 : 1,
                  }}
                  type="button"
                  aria-label={set.completed ? "Mark Set Incomplete" : "Complete Set"}
                >
                  {set.completed ? (
                    <Check size={14} strokeWidth={2} style={{ color: "rgba(255,255,255,0.8)" }} />
                  ) : (
                    <div style={{ width: "10px", height: "10px", borderRadius: "var(--radius-flat)", border: "1px solid var(--ink-35)" }} />
                  )}
                </button>

                {/* Last set comparison */}
                {lastSet && (
                  <div className="flex flex-col items-start gap-1" style={{ minWidth: "72px", flexShrink: 0 }}>
                    <div style={{ fontFamily: "var(--font-label)", fontSize: "8px", fontWeight: 500, letterSpacing: "0.1em", color: "var(--ink-20)", fontVariantNumeric: "tabular-nums" }}>
                      LAST {lastSet.weight} × {lastSet.reps}
                    </div>
                    {lsChip && <DeltaChip size="sm" tone={lsChip.tone} arrow={lsChip.arrow} value={lsChip.value} />}
                  </div>
                )}

                {/* Validation error */}
                {(repCapError || showMissing) && (
                  <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                    <AlertCircle size={8} strokeWidth={2} style={{ color: "var(--ink-50)" }} />
                    <div style={{ fontFamily: "var(--font-label)", fontSize: "8px", color: "var(--ink-50)" }}>
                      {repCapError ? `Max ${REP_MAX}` : missingWeight ? "Enter weight" : "Enter reps"}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <style>{`
          input[type="number"]::-webkit-inner-spin-button,
          input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
          input[type="number"] { -moz-appearance: textfield; }
        `}</style>

        <ReorderExercisesSheet
          open={isReorderOpen}
          onOpenChange={setIsReorderOpen}
          exercises={exercises}
          currentExerciseId={exercises[currentExerciseIndex]?.id}
          canSaveToRoutine={canSaveToRoutine}
          onApply={applyReorder}
        />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col relative overflow-hidden"
      style={{
        height: "var(--app-vh)",
        background: "var(--background)",
      }}
    >
      <div
        className="relative z-10 flex-1 flex flex-col min-h-0"
        style={{
          paddingLeft: "calc(20px + env(safe-area-inset-left, 0px))",
          paddingRight: "calc(20px + env(safe-area-inset-right, 0px))",
          // viewport-fit=cover means the page paints under the status bar, so
          // the header has to clear the Dynamic Island itself.
          paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
        }}
      >
        <AnimatePresence>
          {showRestDock ? (
            <motion.div
              key="rest-dock"
              ref={restDockRef}
              className="ios-glass fixed z-[70] flex items-center justify-between"
              // Slides up from below rather than dropping in: it occupies the
              // tab bar's slot, and it never blocks the set inputs behind it.
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 24,
                transition: { duration: 0.3, ease: "easeOut" },
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{
                left: "calc(16px + env(safe-area-inset-left, 0px))",
                right: "calc(16px + env(safe-area-inset-right, 0px))",
                bottom: "calc(36px + env(safe-area-inset-bottom, 0px))",
                height: "66px",
                borderRadius: "999px",
                padding: "0 8px 0 22px",
                pointerEvents: "auto",
              }}
            >
              <motion.div
                className="flex items-baseline"
                style={{ gap: "10px", minWidth: 0 }}
                animate={{
                  opacity: restRemainingSeconds <= 10 ? [0.8, 1, 0.8] : 1,
                }}
                transition={
                  restRemainingSeconds <= 10
                    ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.2, ease: "linear" }
                }
              >
                <span
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "9px",
                    fontWeight: 700,
                    letterSpacing: "0.19em",
                    color: "var(--ink-50)",
                    lineHeight: 1,
                  }}
                >
                  REST
                </span>
                <span
                  className="leading-none"
                  style={{
                    fontSize: "38px",
                    fontWeight: 400,
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "var(--font-display)",
                    color: "#fff",
                  }}
                >
                  {formatSeconds(restRemainingSeconds)}
                </span>
              </motion.div>

              <div className="flex items-center" style={{ gap: "6px", flexShrink: 0 }}>
                <RestCapsuleButton
                  label="−30"
                  onClick={() => adjustRest(-30)}
                  disabled={restRemainingSeconds <= 5}
                />
                <RestCapsuleButton label="+30" onClick={() => adjustRest(30)} />
                <button
                  onClick={() => {
                    // One tap, and rest is over: the countdown stops and the
                    // capsule unmounts. No second tap to get rid of it.
                    haptic("tap")
                    void setRestStateAndPersist(null)
                  }}
                  className="flex items-center justify-center"
                  aria-label="Skip rest"
                  style={{
                    width: "50px",
                    height: "50px",
                    borderRadius: "999px",
                    background: "#fff",
                    border: "none",
                    color: "#000",
                    touchAction: "manipulation",
                    cursor: "pointer",
                  }}
                  type="button"
                >
                  <SkipForward size={20} strokeWidth={2} fill="currentColor" />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          className="flex-shrink-0 pt-2"
          style={{
            paddingBottom: "12px",
            marginTop: "0px",
          }}
        >
          {/* Nav bar: chevron + routine name leading, the three live stats as
              the centre title view, Finish as a trailing text action. */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <button
              onClick={handleExit}
              className="tap-target flex items-center transition-colors"
              type="button"
              aria-label="Exit workout"
              style={{
                flexShrink: 0,
                maxWidth: "34%",
                gap: "2px",
                background: "transparent",
                border: "none",
                padding: "4px 4px 4px 0",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <ChevronLeft size={24} strokeWidth={2.4} style={{ flexShrink: 0 }} />
              <span
                className="truncate"
                style={{ fontSize: "17px", fontWeight: 400, letterSpacing: "-0.01em" }}
              >
                {session?.routineName || "Back"}
              </span>
            </button>

            <div className="flex items-center justify-center" style={{ gap: "18px", flex: 1, minWidth: 0 }}>
              {session?.startedAt ? (
                <SessionClock
                  startedAt={session.startedAt}
                  render={(formatted) => <StatUnit value={formatted} label="TIME" size="sm" />}
                />
              ) : (
                <StatUnit value="0:00" label="TIME" size="sm" />
              )}
              <StatUnit value={formatVolumeK(totalVolume)} unit="LB" label="VOLUME" size="sm" />
              <StatUnit value={`${totalSetsCompleted}`} unit={`/ ${totalSets}`} label="SETS" size="sm" />
            </div>

            <button
              onClick={() => {
                if (!canFinishWorkout) return
                void finishWorkout()
              }}
              className="tap-target transition-colors duration-base"
              style={{
                flexShrink: 0,
                fontSize: "17px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                padding: "4px 0 4px 8px",
                background: "transparent",
                border: "none",
                color: canFinishWorkout ? "#fff" : "var(--ink-30)",
                cursor: canFinishWorkout ? "pointer" : "default",
              }}
              type="button"
              disabled={!canFinishWorkout}
            >
              Finish
            </button>
          </div>

          <div className="flex items-center" style={{ gap: "8px" }}>
            <div style={{ display: "flex", gap: "3px", flex: 1 }}>
              {exercises.map((exercise, index) => {
                const isComplete = exercise.sets.every((set: any) => set.completed && !isSetIncomplete(set))
                const isCurrent = index === uiExerciseIndex
                const totalExSets = exercise.sets.length
                const completedEligible = exercise.sets.filter(
                  (set: any) => set.completed && !isSetIncomplete(set)
                ).length
                const fillPct = totalExSets > 0 ? (completedEligible / totalExSets) * 100 : 0
                const baseColor = isComplete
                  ? "var(--ink-35)"
                  : isCurrent
                    ? "var(--ink-15)"
                    : "var(--ink-10)"
                const fillColor = isCurrent ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.65)"
                return (
                  <button
                    key={exercise.id}
                    onClick={() => { focusIntentRef.current = true; void setExerciseIndex(index) }}
                    className="tap-target"
                    type="button"
                    aria-label={`Exercise ${index + 1} of ${exercises.length}: ${getExerciseLabel(exercise.name)}, ${completedEligible} of ${totalExSets} sets`}
                    style={{
                      flex: 1,
                      padding: "12px 0",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        height: "3px",
                        borderRadius: "var(--radius-flat)",
                        background: baseColor,
                        overflow: "hidden",
                      }}
                    >
                      {!isComplete && fillPct > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: `${fillPct}%`,
                            background: fillColor,
                            borderRadius: "var(--radius-flat)",
                          }}
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            {exercises.length > 1 ? (
              <button
                type="button"
                aria-label="Reorder exercises"
                onClick={() => setIsReorderOpen(true)}
                className="tap-target"
                style={{ flexShrink: 0, background: "transparent", border: "none", padding: "4px" }}
              >
                <ListOrdered size={15} strokeWidth={1.5} style={{ color: "var(--ink-50)" }} />
              </button>
            ) : null}
          </div>

          {/* scope="workout" notes belong to the session, not to any one
              exercise, so they sit once under the rail rather than repeating on
              every page of the carousel. */}
          <CoachNoteList
            notes={coachWorkoutNotes}
            onDismiss={dismissCoachNote}
            style={{ marginTop: "10px" }}
          />
        </div>

        <div
          ref={scrollContainerRef}
          data-testid="exercise-pager"
          onScroll={handleScroll}
          className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden"
          style={{
            scrollSnapType: "x mandatory",
            scrollBehavior: "smooth",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {exercises.map((exercise: any, exerciseIndex: number) => (
            <ExercisePage
              key={exercise.id}
              exercise={exercise}
              exerciseIndex={exerciseIndex}
              currentExerciseIndex={currentExerciseIndex}
              exercisesCount={exercises.length}
              isDeload={isDeload}
              showPlateCalc={showPlateCalc}
              plateDisplayMode={plateDisplayMode}
              plateStartingWeight={plateStartingWeight}
              focusedInput={focusedInput}
              validationTrigger={validationTrigger}
              repCapErrors={repCapErrors}
              sessionId={session?.id}
              userId={userId}
              maxSetVolumeByExercise={maxSetVolumeByExercise}
              updateExerciseMachineSetting={stableUpdateMachineSetting}
              handleTogglePlateCalc={stableTogglePlateCalc}
              updateSetDataForExercise={stableUpdateSetData}
              handleSetFieldFocus={stableSetFieldFocus}
              handleSetFieldBlur={stableSetFieldBlur}
              handleInputAutoSelect={stableInputAutoSelect}
              setFocusedInput={setFocusedInput}
              setRepCapErrors={setRepCapErrors}
              setValidationTrigger={setValidationTrigger}
              completeSet={stableCompleteSet}
              rateExercise={stableRateExercise}
              endExerciseHere={stableEndExerciseHere}
              restoreTrimmedSets={stableRestoreTrimmedSets}
              addSet={stableAddSet}
              setPlateDisplayMode={setPlateDisplayMode}
              setPlateStartingWeight={setPlateStartingWeight}
              onOpenExercise={openExercisePage}
              coachNotes={notesForExercise(exercise.name)}
              onDismissCoachNote={dismissCoachNote}
              registerWeightRef={registerWeightRef}
              registerRepsRef={registerRepsRef}
              focusSetField={focusSetField}
              isRestDockOpen={showRestDock}
              restDockHeight={restDockHeight}
            />
          ))}
        </div>
      </div>

      {editingSet && editingField ? (
        <SetKeyboardBar
          field={editingField}
          isLogged={Boolean(editingSet.set.completed)}
          canLog={!isSetIncomplete(editingSet.set) && !repCapErrors[editingSet.set.id]}
          hasNext={editingSet.nextTarget !== null}
          onStep={stepEditingField}
          onNext={advanceFromEditingField}
          onLog={logEditingSet}
        />
      ) : null}

      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        input[type="number"] {
          -moz-appearance: textfield;
        }

        @keyframes rest-shimmer {
          0%   { opacity: 0.5;  box-shadow: 0 0 1.5px rgba(255,255,255,0.15); }
          8%   { opacity: 1;    box-shadow: 0 0 6px rgba(255,255,255,0.62), 0 0 11px rgba(255,255,255,0.3); }
          22%  { opacity: 0.6;  box-shadow: 0 0 2px rgba(210,205,255,0.2); }
          52%  { opacity: 0.86; box-shadow: 0 0 5px rgba(165,185,255,0.44), 0 0 9px rgba(190,160,255,0.22); }
          70%  { opacity: 0.66; box-shadow: 0 0 2px rgba(200,190,255,0.18); }
          100% { opacity: 0.5;  box-shadow: 0 0 1.5px rgba(255,255,255,0.15); }
        }
        .rest-shimmer {
          animation: rest-shimmer 3.4s ease-in-out infinite;
          will-change: opacity, box-shadow;
        }
        @media (prefers-reduced-motion: reduce) {
          .rest-shimmer { animation: none; opacity: 1; box-shadow: 0 0 3px rgba(255,255,255,0.25); }
        }
      `}</style>

      <ReorderExercisesSheet
        open={isReorderOpen}
        onOpenChange={setIsReorderOpen}
        exercises={exercises}
        currentExerciseId={exercises[currentExerciseIndex]?.id}
        canSaveToRoutine={canSaveToRoutine}
        onApply={applyReorder}
      />
    </div>
  )
}

/**
 * The keyboard accessory bar: glass strip on the visual viewport's bottom edge
 * (above the on-screen keyboard) while a set field is focused. Its buttons
 * cancel pointerdown so the field keeps focus and the keyboard stays up; the
 * one that logs the set drops both on purpose.
 */
function SetKeyboardBar({
  field,
  isLogged,
  canLog,
  hasNext,
  onStep,
  onNext,
  onLog,
}: {
  field: "reps" | "weight"
  isLogged: boolean
  canLog: boolean
  hasNext: boolean
  onStep: (delta: number) => void
  onNext: () => void
  onLog: () => void
}) {
  const [inset, setInset] = useState(0)
  // iOS floats its own ▲ ▼ ✓ form-assistant pill over the page just above
  // the keyboard — roughly 20–60pt up from the keyboard's top edge, outside
  // what the visual viewport reports. A bar parked on the viewport's bottom
  // edge ends up underneath it, half covered and half untappable, so on iOS
  // the bar lifts clear of it while a keyboard is up.
  const isIOS =
    typeof navigator !== "undefined" &&
    (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  const assistantClearance = inset > 0 && isIOS ? 64 : 0

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    // The layout viewport does not shrink for the keyboard in a standalone
    // web app, but the visual viewport does: its bottom edge is the keyboard.
    const update = () =>
      setInset(Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height)))
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
    }
  }, [])

  const step = field === "weight" ? 5 : 1
  const keepFocus = (event: React.PointerEvent) => event.preventDefault()

  const button = (
    label: string,
    onClick: () => void,
    options: { primary?: boolean; dim?: boolean; testId?: string } = {},
  ) => (
    <button
      type="button"
      onPointerDown={keepFocus}
      onClick={onClick}
      data-testid={options.testId}
      className="flex items-center justify-center transition-opacity duration-150"
      style={{
        minWidth: options.primary ? "92px" : "56px",
        height: "44px",
        padding: "0 14px",
        borderRadius: "999px",
        border: "none",
        background: options.primary ? "#fff" : "var(--ink-12)",
        boxShadow: options.primary ? "none" : "inset 0 0 0 0.5px var(--ink-15)",
        color: options.primary ? "#000" : "#fff",
        fontFamily: options.primary ? "var(--font-label)" : undefined,
        fontSize: options.primary ? "11px" : "15px",
        fontWeight: 600,
        letterSpacing: options.primary ? "0.12em" : "0",
        fontVariantNumeric: "tabular-nums",
        opacity: options.dim ? 0.5 : 1,
        touchAction: "manipulation",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      role="toolbar"
      aria-label={field === "weight" ? "Weight entry" : "Reps entry"}
      data-testid="set-keyboard-bar"
      className="ios-glass fixed z-[95] flex items-center"
      style={{
        // Lifted clear of the iOS pill it floats as a toolbar; on the edge it
        // runs edge to edge like a keyboard row.
        left: assistantClearance ? 12 : 0,
        right: assistantClearance ? 12 : 0,
        bottom: inset + assistantClearance,
        gap: "8px",
        padding: "6px 12px",
        // With no keyboard (hardware keyboard, desktop) the bar sits on the
        // home indicator instead, so it clears that.
        paddingBottom: inset > 0 ? "6px" : "calc(6px + env(safe-area-inset-bottom, 0px))",
        borderRadius: assistantClearance ? 20 : 0,
      }}
    >
      {button(`−${step}`, () => onStep(-step), { testId: "kb-step-down" })}
      {button(`+${step}`, () => onStep(step), { testId: "kb-step-up" })}
      <span
        style={{
          flex: 1,
          textAlign: "center",
          fontFamily: "var(--font-label)",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--ink-50)",
        }}
      >
        {field === "weight" ? "LB" : "REPS"}
      </span>
      {hasNext ? button("NEXT", onNext, { testId: "kb-next" }) : null}
      {isLogged
        ? button("DONE", onLog, { primary: true, testId: "kb-log" })
        : button("LOG SET", onLog, { primary: true, dim: !canLog, testId: "kb-log" })}
    </div>
  )
}

/** A 50pt circular ±30 button on the rest capsule's glass. */
function RestCapsuleButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center transition-opacity duration-150"
      style={{
        width: "50px",
        height: "50px",
        borderRadius: "999px",
        background: "var(--ink-12)",
        border: "none",
        boxShadow: "inset 0 0 0 0.5px var(--ink-15)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: 600,
        opacity: disabled ? 0.35 : 1,
        touchAction: "manipulation",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  )
}
