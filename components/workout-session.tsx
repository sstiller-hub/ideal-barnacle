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
  upsertAllSets,
  getWorkoutDraft,
  type WorkoutSetDraft,
  type SyncState,
} from "@/lib/workout-draft-storage"
import { attemptWorkoutSync, ensureWorkoutSync } from "@/lib/workout-sync"
import { computeAverageSecondsPerSet, classifyPace } from "@/lib/workout-analytics"
import { getMachineSettings, saveMachineSettings } from "@/lib/machine-settings-storage"
import { loadExerciseSettings, saveExerciseSettings } from "@/lib/supabase-exercise-settings"
import { recordRestExtension, getRestExtensionTrend, type RestExtensionTrend } from "@/lib/rest-extension-storage"
import { ArrowLeft, AlertCircle, Check, ThumbsUp, ThumbsDown, ListOrdered } from "lucide-react"
import { ReorderExercisesSheet } from "@/components/reorder-exercises-sheet"
import { StatUnit } from "@/components/ledger/stat-unit"
import { SessionClock } from "@/components/ledger/session-clock"
import { DeltaChip } from "@/components/ledger/delta-chip"

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

function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ")
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
      const value = weightDelta > 0 ? `+${weightDelta} LB` : `+${repsDelta} REPS`
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

function calculatePlates(
  weight: number,
  startingWeight: number,
  mode: "per-side" | "total",
): { plate: number; count: number }[] {
  const adjusted = Math.max(0, weight - startingWeight)
  const plateWeight = mode === "per-side" ? adjusted / 2 : adjusted

  if (plateWeight <= 0) return []

  const availablePlates = [45, 35, 25, 10, 5, 2.5]
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

function parseRepRange(targetReps: string): { low: number; high: number } | null {
  const match = targetReps.match(/^(\d+)\s*[-–]\s*(\d+)$/)
  if (!match) return null
  return { low: parseInt(match[1], 10), high: parseInt(match[2], 10) }
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
  handleApplyProgressiveOverload: (exerciseIndex: number) => void
  setPlateDisplayMode: (mode: "per-side" | "total") => void
  setPlateStartingWeight: (value: number) => void
  onOpenExercise: (name: string) => void
  registerWeightRef: (setId: string, node: HTMLInputElement | null) => void
  registerRepsRef: (setId: string, node: HTMLInputElement | null) => void
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
  handleApplyProgressiveOverload,
  setPlateDisplayMode,
  setPlateStartingWeight,
  onOpenExercise,
  registerWeightRef,
  registerRepsRef,
}: ExercisePageProps) {
  const exerciseCurrentSetIndex = exercise.sets.findIndex((set: any) => !set.completed)
  const activeSetIndex = exerciseCurrentSetIndex === -1 ? 0 : exerciseCurrentSetIndex
  const isExerciseComplete =
    exercise.sets.length > 0 &&
    exercise.sets.every((set: any) => set.completed && !isSetIncomplete(set))
  const isCompactSets = exercise.sets.length >= 4
  const canEditExercise = exerciseIndex === currentExerciseIndex || exerciseIndex < currentExerciseIndex
  const exerciseRepRange = parseRepRange(exercise.targetReps ?? "")
  const showProgressiveOverload =
    exerciseIndex === currentExerciseIndex &&
    exerciseRepRange !== null &&
    exercise.sets.length > 0 &&
    exercise.sets.every(
      (set: any) => set.completed && typeof set.reps === "number" && set.reps >= exerciseRepRange.high
    )

  return (
    <div
      style={{
        scrollSnapAlign: "start",
        width: "100%",
        flexShrink: 0,
        paddingBottom: "120px",
      }}
    >
      <div style={{ marginBottom: isCompactSets ? "10px" : "18px" }}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "9px",
              fontWeight: 600,
              letterSpacing: "0.2em",
              color: "var(--ink-35)",
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
                placeholder="SEAT"
                className="transition-colors duration-150"
                style={{
                  background: "var(--ink-02)",
                  border: "1px solid var(--ink-08)",
                  borderRadius: "var(--radius-flat)",
                  padding: "4px 9px",
                  fontFamily: "var(--font-label)",
                  fontSize: "8px",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: "var(--ink-70)",
                  width: "52px",
                  textAlign: "center",
                }}
              />
            )}
            <button
              onClick={() => {
                if (exerciseIndex !== currentExerciseIndex) return
                handleTogglePlateCalc()
              }}
              className="transition-colors duration-150"
              style={{
                background: showPlateCalc ? "var(--ink-06)" : "var(--ink-02)",
                border: `1px solid ${showPlateCalc ? "var(--ink-12)" : "var(--ink-08)"}`,
                borderRadius: "var(--radius-flat)",
                padding: "4px 9px",
                fontFamily: "var(--font-label)",
                fontSize: "8px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: showPlateCalc ? "var(--ink-85)" : "var(--ink-35)",
              }}
              type="button"
            >
              PLATES
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
                color: "var(--ink-35)",
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
            color: "var(--ink-30)",
            marginTop: "8px",
          }}
        >
          {exercise.sets.length} SET{exercise.sets.length !== 1 ? "S" : ""}
          {exercise.targetReps ? ` · TARGET ${exercise.targetReps} REPS` : ""}
          {!isExerciseComplete && (
            <>
              {" · "}
              <span style={{ color: "var(--ink-50)", fontWeight: 600 }}>
                NOW SET {activeSetIndex + 1}
              </span>
            </>
          )}
        </div>
      </div>

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
              ? calculatePlates(set.weight, plateStartingWeight, plateDisplayMode)
              : []
          const isPlateSetActive =
            exerciseIndex === currentExerciseIndex &&
            !set.completed &&
            plates.length > 0 &&
            (isCurrentSet || focusedWeight || focusedReps)

          // Fixed geometry — density varies per exercise (set count), never per set state.
          const inputPadding = isCompactSets ? "12px 8px" : "15px 8px"
          const inputFontSize = isCompactSets ? "22px" : "26px"
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
                    color: isCurrentSet ? "var(--ink-50)" : "var(--ink-30)",
                  }}
                >
                  SET {String(setIndex + 1).padStart(2, "0")}
                </span>
                {isCurrentSet && (
                  <span
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "7.5px",
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
                    if (!isExerciseComplete) handleInputAutoSelect(e)
                    setFocusedInput(`${setKey}-weight`)
                  }}
                  onBlur={() => {
                    if (set.id) handleSetFieldBlur(set.id, "weight")
                    setFocusedInput(null)
                  }}
                  placeholder="—"
                  className="transition-colors duration-150"
                  disabled={!canEditExercise}
                  style={{
                    width: "100%",
                    background: weightBg,
                    border: `1px solid ${weightBorder}`,
                    borderRadius: "var(--radius-flat)",
                    padding: inputPadding,
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
                    if (!isExerciseComplete) handleInputAutoSelect(e)
                    setFocusedInput(`${setKey}-reps`)
                  }}
                  onBlur={() => {
                    if (set.id) handleSetFieldBlur(set.id, "reps")
                    setFocusedInput(null)
                  }}
                  placeholder="—"
                  className="transition-colors duration-150"
                  disabled={!canEditExercise}
                  style={{
                    width: "100%",
                    background: repsBg,
                    border: `1px solid ${repsBorder}`,
                    borderRadius: "var(--radius-flat)",
                    padding: inputPadding,
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
                  className="flex items-center justify-center transition-colors duration-150"
                  style={{
                    width: "100%",
                    height: "100%",
                    background: set.completed ? "var(--ink-06)" : "var(--ink-02)",
                    border: `1px solid ${set.completed ? "transparent" : "var(--ink-08)"}`,
                    borderRadius: "var(--radius-flat)",
                    opacity: !canEditExercise || (!set.completed && (isSetIncomplete(set) || repCapError)) ? 0.35 : 1,
                  }}
                  type="button"
                  aria-label={set.completed ? "Mark Set Incomplete" : "Complete Set"}
                >
                  {set.completed ? (
                    <Check size={16} strokeWidth={2} style={{ color: "var(--ink-85)" }} />
                  ) : (
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "var(--radius-flat)",
                        border: "1px solid var(--ink-35)",
                        background: "transparent",
                      }}
                    />
                  )}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 44px", gap: "12px", marginTop: "5px" }}>
                <div
                  className="text-center transition-colors duration-150"
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "7.5px",
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    color: focusedWeight ? "var(--ink-50)" : "var(--ink-25)",
                  }}
                >
                  LB
                </div>
                <div
                  className="text-center transition-colors duration-150"
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "7.5px",
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    color: focusedReps ? "var(--ink-50)" : "var(--ink-25)",
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
                    <AlertCircle size={10} strokeWidth={2} style={{ color: "var(--ink-40)" }} />
                    <span
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "9px",
                        fontWeight: 500,
                        color: "var(--ink-40)",
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
                        color: "var(--ink-25)",
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
                      className="transition-colors duration-150"
                      style={{
                        background: "var(--ink-02)",
                        border: "1px solid var(--ink-08)",
                        borderRadius: "var(--radius-flat)",
                        padding: "4px 9px",
                        fontFamily: "var(--font-label)",
                        fontSize: "8px",
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        color: "var(--ink-70)",
                      }}
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
                      {plateDisplayMode === "per-side" ? "PER SIDE" : "TOTAL"}
                    </button>
                    <span
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "8px",
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        color: "var(--ink-30)",
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
                      className="transition-colors duration-150"
                      style={{
                        width: "52px",
                        background: "var(--ink-02)",
                        border: "1px solid var(--ink-08)",
                        borderRadius: "var(--radius-flat)",
                        padding: "4px 8px",
                        fontSize: "13px",
                        color: "var(--ink-70)",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                    />
                  </div>

                  <div className={`flex items-center gap-1.5 ${isCompactSets ? "mb-2" : "mb-3"}`}>
                    {plates.map((plate, plateIndex) => (
                      <div key={plateIndex} className="flex items-center gap-1">
                        {Array.from({ length: plate.count }).map((_, countIndex) => {
                          const getPlateColor = () => {
                            if (plate.plate === 45) return "rgba(180, 60, 60, 0.6)"
                            if (plate.plate === 35) return "rgba(60, 100, 180, 0.6)"
                            if (plate.plate === 25) return "rgba(60, 160, 100, 0.6)"
                            if (plate.plate === 10) return "rgba(200, 160, 70, 0.6)"
                            if (plate.plate === 5) return "rgba(200, 200, 200, 0.6)"
                            return "rgba(100, 100, 100, 0.6)"
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
                                border: "1px solid rgba(255, 255, 255, 0.1)",
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
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "var(--radius-flat)",
                        marginLeft: "4px",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "8px",
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "0.02em",
                      color: "var(--ink-30)",
                    }}
                  >
                    {plates.map((plate, plateIndex) => (
                      <span key={plateIndex}>
                        {plateIndex > 0 && " + "}
                        {plate.count > 1 ? `${plate.count}×` : ""}{plate.plate}
                      </span>
                    ))} {plateDisplayMode === "per-side" ? "per side" : "total"}
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
            style={{ marginTop: "24px" }}
          >
            <div
              className="text-center"
              style={{ fontFamily: "var(--font-label)", fontSize: "9px", fontWeight: 600, letterSpacing: "0.2em", color: "var(--ink-35)", marginBottom: "12px" }}
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
                <ThumbsDown size={14} strokeWidth={1.5} style={{ color: "var(--ink-40)" }} />
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
                <ThumbsUp size={14} strokeWidth={1.5} style={{ color: "var(--ink-40)" }} />
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
            style={{ marginTop: "24px" }}
          >
            <div className="flex items-center justify-center gap-2">
              {exercise.rating === "thumbs_up" ? (
                <ThumbsUp size={12} strokeWidth={1.5} style={{ color: "var(--ink-30)" }} />
              ) : (
                <ThumbsDown size={12} strokeWidth={1.5} style={{ color: "var(--ink-30)" }} />
              )}
              <span
                style={{ fontFamily: "var(--font-label)", fontSize: "8px", fontWeight: 600, letterSpacing: "0.16em", color: "var(--ink-30)" }}
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

      <AnimatePresence>
        {showProgressiveOverload && (
          <motion.div
            key="progressive-overload"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ display: "flex", justifyContent: "center", marginTop: "28px" }}
          >
            <button
              onClick={() => void handleApplyProgressiveOverload(exerciseIndex)}
              type="button"
              className="transition-colors duration-150"
              style={{
                background: "var(--ink-02)",
                border: "1px solid var(--ink-08)",
                borderRadius: "var(--radius-flat)",
                padding: "7px 16px",
                fontFamily: "var(--font-label)",
                fontSize: "9px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "var(--ink-70)",
                cursor: "pointer",
              }}
            >
              PROGRESSIVE OVERLOAD ↑
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

export default function WorkoutSessionComponent({ routine, isDeload = false }: { routine: WorkoutRoutine; isDeload?: boolean }) {
  const router = useRouter()
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
  const isScrollingProgrammatically = useRef(false)
  const hasInitialScrollRef = useRef(false)
  const scrollRafRef = useRef<number | null>(null)
  const scrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOrientationChangingRef = useRef(false)
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

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape) and (max-width: 1024px) and (pointer: coarse)")
    let orientationResetTimeout: ReturnType<typeof setTimeout> | null = null
    const update = () => {
      if (scrollSettleTimeoutRef.current) {
        clearTimeout(scrollSettleTimeoutRef.current)
        scrollSettleTimeoutRef.current = null
      }
      isOrientationChangingRef.current = true
      hasInitialScrollRef.current = false
      setIsLandscapeMobile(query.matches)
      // Safety reset: if the matchMedia value doesn't change (e.g.
      // orientationchange fires without flipping landscape/portrait), the
      // scroll effect's deps stay equal and its RAF — which normally clears
      // this flag — never runs. Without this fallback, handleScroll stays
      // blocked forever and swipes can't advance the carousel.
      if (orientationResetTimeout) clearTimeout(orientationResetTimeout)
      orientationResetTimeout = setTimeout(() => {
        isOrientationChangingRef.current = false
      }, 300)
    }
    update()
    query.addEventListener("change", update)
    window.addEventListener("orientationchange", update)
    return () => {
      query.removeEventListener("change", update)
      window.removeEventListener("orientationchange", update)
      if (orientationResetTimeout) clearTimeout(orientationResetTimeout)
    }
  }, [])

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
    if (session) {
      const updatedSession: WorkoutSession = {
        ...session,
        ...(latestExercises !== undefined ? { exercises: latestExercises } : {}),
        restTimer: nextWithStart || undefined,
      }
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

  useEffect(() => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current

    if (!hasInitialScrollRef.current) {
      // Restore the carousel to the persisted exercise after a (re)mount or
      // orientation change. Rotating back from landscape remounts this
      // container with scrollLeft 0, and the new portrait layout width is not
      // always ready on the first animation frame — reading offsetWidth too
      // early resolves to 0 and scrolls to exercise 0. Retry across frames
      // until the width is known, then scroll, and only re-enable handleScroll
      // one frame later (via isOrientationChangingRef). That way the transient
      // scrollLeft 0 the browser reports during the relayout — and the scroll
      // event emitted by our own scrollTo — are never persisted as index 0.
      let rafId = 0
      let attempts = 0
      const restore = () => {
        const c = scrollContainerRef.current
        if (!c) return
        const width = c.offsetWidth
        if (width === 0 && attempts < 20) {
          attempts += 1
          rafId = requestAnimationFrame(restore)
          return
        }
        c.scrollTo({ left: currentExerciseIndex * width, behavior: "instant" })
        hasInitialScrollRef.current = true
        rafId = requestAnimationFrame(() => {
          isOrientationChangingRef.current = false
        })
      }
      rafId = requestAnimationFrame(restore)
      return () => cancelAnimationFrame(rafId)
    }

    if (isScrollingProgrammatically.current) return
    isScrollingProgrammatically.current = true
    container.scrollTo({ left: currentExerciseIndex * container.offsetWidth, behavior: "smooth" })

    const timeout = window.setTimeout(() => {
      isScrollingProgrammatically.current = false
    }, 400)

    return () => window.clearTimeout(timeout)
  }, [currentExerciseIndex, isLandscapeMobile])

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
      if (isOrientationChangingRef.current) return
      if (isScrollingProgrammatically.current) {
        isScrollingProgrammatically.current = false
        return
      }
      const pageWidth = container.offsetWidth
      if (!pageWidth) return
      const nextIndex = Math.round(container.scrollLeft / pageWidth)
      if (nextIndex !== currentExerciseIndexRef.current) {
        void setExerciseIndex(nextIndex)
      }
    }
    container.addEventListener("scrollend", handleScrollEnd)
    return () => container.removeEventListener("scrollend", handleScrollEnd)
    // isHydrated is a dep because the scroll container only mounts post-hydration;
    // without it the effect runs once against a null ref and never re-attaches.
  }, [isLandscapeMobile, isHydrated])


  useEffect(() => {
    if (!currentExercise) return
    if (!focusIntentRef.current) {
      return
    }
    focusIntentRef.current = false
    if (isResting) return
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

  const handleApplyProgressiveOverload = async (exerciseIndex: number) => {
    if (!session) return
    const exercise = exercises[exerciseIndex]
    if (!exercise) return

    const repRange = parseRepRange(exercise.targetReps ?? "")
    if (!repRange) return

    const workoutId = session.workoutId
    const historyReps = getCachedHistoryReps(exercise.name)

    const newExercises = exercises.map((ex: any, idx: number) => {
      if (idx !== exerciseIndex) return ex

      const newSets = ex.sets.map((set: any, setIdx: number) => {
        const newWeight = typeof set.weight === "number" ? set.weight + 5 : 5
        const newReps = repRange.low

        const newSet = { ...set, weight: newWeight, reps: newReps, completed: false }

        const flagsResult = getSetFlags({
          reps: newSet.reps,
          weight: newSet.weight,
          targetReps: ex.targetReps,
          historyReps,
        })

        const updatedSet = {
          ...newSet,
          isOutlier: flagsResult.flags.includes("rep_outlier"),
          validationFlags: flagsResult.flags,
          isIncomplete: flagsResult.isIncomplete,
        }

        if (workoutId) {
          void persistSetDraft(workoutId, ex, updatedSet, setIdx)
        }
        if (session?.remoteSessionId) {
          void upsertSet({
            sessionId: session.remoteSessionId,
            setId: updatedSet.id,
            exerciseId: ex.id,
            setIndex: setIdx,
            reps: updatedSet.reps,
            weight: updatedSet.weight,
            completed: updatedSet.completed,
            validationFlags: updatedSet.validationFlags,
          })
        }

        return updatedSet
      })

      return { ...ex, sets: newSets, completed: false }
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

    toast.success("+5 lbs applied", { duration: 2000 })
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
    // Completing a set is explicit intent — allow the auto-focus effect to move
    // the keyboard to the next set (consumed there; suppressed while resting).
    focusIntentRef.current = true
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

    if (isScrollingProgrammatically.current) {
      isScrollingProgrammatically.current = false
    }

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
      if (nextIndex !== uiExerciseIndex) {
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
    handleApplyProgressiveOverload,
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
    handleApplyProgressiveOverload,
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
  const stableApplyProgressiveOverload = useCallback(
    (i: number) => exercisePageHandlersRef.current.handleApplyProgressiveOverload(i),
    [],
  )
  const registerWeightRef = useCallback((setId: string, node: HTMLInputElement | null) => {
    if (node) weightInputRefs.current.set(setId, node)
    else weightInputRefs.current.delete(setId)
  }, [])
  const registerRepsRef = useCallback((setId: string, node: HTMLInputElement | null) => {
    if (node) repsInputRefs.current.set(setId, node)
    else repsInputRefs.current.delete(setId)
  }, [])
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
          background: "#0D0D0F",
          boxShadow: "inset 0 0 200px rgba(255, 255, 255, 0.01)",
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
    const lsIsExerciseComplete =
      lsExercise.sets.length > 0 &&
      lsExercise.sets.every((s: any) => s.completed && !isSetIncomplete(s))

    return (
      <div
        className="flex flex-col"
        style={{
          height: "100dvh",
          background: "#0D0D0F",
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
                borderColor: restRemainingSeconds <= 10 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)",
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
                  <div className="text-ink-35" style={{ fontSize: "7px", fontWeight: 600, letterSpacing: "0.12em" }}>REST</div>
                  {restExtensionTrend && (restExtensionTrend.currentMonthCount > 0 || restExtensionTrend.lastMonthCount > 0) && (
                    <div style={{ fontSize: "6px", fontWeight: 500, letterSpacing: "0.04em", color: "rgba(255,255,255,0.22)", lineHeight: 1, marginTop: "2px" }}>
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
                  onClick={() => {
                    if (!isResting || !restState) return
                    const next = restRemainingSeconds + 30
                    void setRestStateAndPersist({ ...restState, remainingSeconds: next })
                    scheduleRestNotification(next)
                    recordRestExtension(session?.id ?? "unknown")
                    setRestExtensionTrend(getRestExtensionTrend())
                  }}
                  style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: "var(--radius-flat)", padding: "5px 8px" }}
                  type="button"
                >
                  <span className="text-ink-90" style={{ fontSize: "10px", fontWeight: 500 }}>+30s</span>
                </button>
                <button
                  onClick={() => void setRestStateAndPersist(null)}
                  style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "var(--radius-flat)", padding: "5px 10px" }}
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
              <ArrowLeft size={16} strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.3)" }} />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                className="text-ink-95"
                style={{ fontSize: "20px", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "var(--font-display)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                onClick={() => router.push(`/exercise/${encodeURIComponent(lsExercise.name)}?from=session`)}
              >
                {getExerciseLabel(lsExercise.name)}
              </h1>
              <div className="text-ink-30" style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.1em", marginTop: "2px", fontFamily: "var(--font-label)" }}>
                EXERCISE {uiExerciseIndex + 1} • {lsExercise.sets.length} SET{lsExercise.sets.length !== 1 ? "S" : ""}{lsExercise.targetReps ? ` • TARGET ${lsExercise.targetReps} REPS` : ""} • {session?.startedAt ? <SessionClock startedAt={session.startedAt} render={(f) => <>{f}</>} /> : formatSeconds(elapsedSeconds)}
                {pacePillLabel && <span style={{ color: pacePillLabel.color }}> • {pacePillLabel.text}</span>}
              </div>
            </div>

            <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
              <div className="text-center">
                <div className="text-ink-30" style={{ fontSize: "6px", fontWeight: 500, letterSpacing: "0.12em", marginBottom: "1px" }}>SETS</div>
                <div className="text-ink-70" style={{ fontSize: "11px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{totalSetsCompleted}/{totalSets}</div>
              </div>
              <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.06)" }} />
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
                    background: isCurrent ? "rgba(255,255,255,0.5)" : isComplete ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
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
                className="absolute"
                style={{ right: 0, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", padding: "4px" }}
              >
                <ListOrdered size={14} strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.3)" }} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)", margin: "0 16px", flexShrink: 0 }} />

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
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  opacity: isCurrentSet ? 1 : set.completed ? 0.45 : 0.65,
                }}
              >
                {/* Set number */}
                <div style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-label)", minWidth: "28px", flexShrink: 0 }}>
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
                      if (!lsIsExerciseComplete) handleInputAutoSelect(e)
                      setFocusedInput(`${setKey}-weight`)
                    }}
                    onBlur={() => {
                      if (set.id) handleSetFieldBlur(set.id, "weight")
                      setFocusedInput(null)
                    }}
                    placeholder="—"
                    disabled={!lsCanEdit}
                    className="w-full"
                    style={{
                      background: set.completed ? "rgba(255,255,255,0.02)" : focusedInput === `${setKey}-weight` ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${showMissing && missingWeight ? "rgba(255,255,255,0.4)" : focusedInput === `${setKey}-weight` ? "rgba(255,255,255,0.2)" : "transparent"}`,
                      borderRadius: "var(--radius-flat)", padding: "6px", fontSize: "16px", fontWeight: 600, letterSpacing: "-0.02em",
                      color: set.completed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.95)",
                      fontVariantNumeric: "tabular-nums", outline: "none", textAlign: "center",
                    }}
                  />
                  <div style={{ fontSize: "6px", fontWeight: 500, letterSpacing: "0.06em", color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: "2px" }}>LBS</div>
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
                      if (!lsIsExerciseComplete) handleInputAutoSelect(e)
                      setFocusedInput(`${setKey}-reps`)
                    }}
                    onBlur={() => {
                      if (set.id) handleSetFieldBlur(set.id, "reps")
                      setFocusedInput(null)
                    }}
                    placeholder="—"
                    disabled={!lsCanEdit}
                    className="w-full"
                    style={{
                      background: set.completed ? "rgba(255,255,255,0.02)" : focusedInput === `${setKey}-reps` ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${(repCapError || (showMissing && missingReps)) ? "rgba(255,255,255,0.4)" : focusedInput === `${setKey}-reps` ? "rgba(255,255,255,0.2)" : "transparent"}`,
                      borderRadius: "var(--radius-flat)", padding: "6px", fontSize: "16px", fontWeight: 600, letterSpacing: "-0.02em",
                      color: set.completed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.95)",
                      fontVariantNumeric: "tabular-nums", outline: "none", textAlign: "center",
                    }}
                  />
                  <div style={{ fontSize: "6px", fontWeight: 500, letterSpacing: "0.06em", color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: "2px" }}>REPS</div>
                </div>

                {/* Complete button */}
                <button
                  onClick={() => {
                    if (!lsCanEdit) return
                    if (!set.completed && (isSetIncomplete(set) || repCapError)) { setValidationTrigger(Date.now()); return }
                    void completeSet(setIndex, { exerciseIndex: uiExerciseIndex, startRest: isCurrentSet && uiExerciseIndex === currentExerciseIndex })
                  }}
                  disabled={!lsCanEdit || (!set.completed && (isSetIncomplete(set) || repCapError))}
                  className="flex items-center justify-center"
                  style={{
                    width: "32px", height: "32px",
                    background: set.completed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                    border: "none", borderRadius: "var(--radius-flat)", flexShrink: 0,
                    opacity: !lsCanEdit || (!set.completed && (isSetIncomplete(set) || repCapError)) ? 0.35 : 1,
                  }}
                  type="button"
                  aria-label={set.completed ? "Mark Set Incomplete" : "Complete Set"}
                >
                  {set.completed ? (
                    <Check size={14} strokeWidth={2} style={{ color: "rgba(255,255,255,0.8)" }} />
                  ) : (
                    <div style={{ width: "10px", height: "10px", borderRadius: "var(--radius-flat)", border: "1px solid rgba(255,255,255,0.35)" }} />
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
                    <AlertCircle size={8} strokeWidth={2} style={{ color: "var(--ink-40)" }} />
                    <div style={{ fontFamily: "var(--font-label)", fontSize: "8px", color: "var(--ink-40)" }}>
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
        height: "100dvh",
        background: "#0D0D0F",
      }}
    >
      <div className="relative z-10 flex-1 flex flex-col min-h-0" style={{ paddingLeft: "20px", paddingRight: "20px", paddingTop: "20px" }}>
        <AnimatePresence>
          {isResting && restState ? (
            <motion.div
              key="rest-dock"
              className="fixed z-[70] flex items-center justify-between gap-3 border"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: 8,
                transition: { duration: 0.2, ease: "easeOut" },
              }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{
                left: "calc(16px + env(safe-area-inset-left, 0px))",
                right: "calc(16px + env(safe-area-inset-right, 0px))",
                bottom: "calc(20px + env(safe-area-inset-bottom))",
                borderColor: restRemainingSeconds <= 10 ? "var(--ink-35)" : "var(--ink-12)",
                background: "rgba(13, 13, 15, 0.92)",
                borderRadius: "var(--radius-xs)",
                padding: "10px 14px",
                pointerEvents: "auto",
              }}
            >
              <motion.div
                className="flex items-end gap-3"
                animate={{
                  opacity: restRemainingSeconds <= 10 ? [0.8, 1, 0.8] : 1,
                }}
                transition={
                  restRemainingSeconds <= 10
                    ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.2, ease: "linear" }
                }
              >
                <div className="flex flex-col items-start" style={{ paddingBottom: "5px" }}>
                  <div className="flex items-center" style={{ gap: "5px" }}>
                    <span
                      className="rest-breathe"
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        background: "var(--ink-85)",
                        display: "inline-block",
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "8px",
                        fontWeight: 600,
                        letterSpacing: "0.18em",
                        color: "var(--ink-35)",
                        lineHeight: 1,
                      }}
                    >
                      REST
                    </span>
                  </div>
                  {restExtensionTrend && (restExtensionTrend.currentMonthCount > 0 || restExtensionTrend.lastMonthCount > 0) && (
                    <div style={{ fontFamily: "var(--font-label)", fontSize: "7.5px", fontWeight: 500, letterSpacing: "0.04em", color: "var(--ink-25)", lineHeight: 1, marginTop: "3px" }}>
                      {restExtensionTrend.direction === "up" ? "↑" : restExtensionTrend.direction === "down" ? "↓" : "–"}{restExtensionTrend.currentMonthCount}/mo
                    </div>
                  )}
                </div>
                <div
                  className="leading-none"
                  style={{
                    fontSize: "38px",
                    fontWeight: 400,
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "var(--font-display)",
                    color: "var(--ink-95)",
                  }}
                >
                  {formatSeconds(restRemainingSeconds)}
                </div>
              </motion.div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!isResting || !restState) return
                    const next = restRemainingSeconds + 30
                    void setRestStateAndPersist({
                      ...restState,
                      remainingSeconds: next,
                    })
                    scheduleRestNotification(next)
                    recordRestExtension(session?.id ?? "unknown")
                    setRestExtensionTrend(getRestExtensionTrend())
                  }}
                  className="transition-colors duration-150"
                  style={{
                    background: "var(--ink-02)",
                    border: "1px solid var(--ink-08)",
                    borderRadius: "var(--radius-flat)",
                    padding: "6px 12px",
                    fontFamily: "var(--font-label)",
                    fontSize: "9.5px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: "var(--ink-70)",
                  }}
                  type="button"
                >
                  +30S
                </button>
                <button
                  onClick={() => void setRestStateAndPersist(null)}
                  className="transition-colors duration-150"
                  style={{
                    background: "var(--ink-06)",
                    border: "1px solid var(--ink-12)",
                    borderRadius: "var(--radius-flat)",
                    padding: "6px 12px",
                    fontFamily: "var(--font-label)",
                    fontSize: "9.5px",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: "var(--ink-95)",
                  }}
                  type="button"
                >
                  SKIP
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
          <div className="flex items-center justify-between gap-3 mb-4">
            <button onClick={handleExit} className="text-ink-30 hover:text-ink-50 transition-colors" type="button" style={{ flexShrink: 0 }}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </button>

            <div className="flex items-center justify-center" style={{ gap: "18px", flex: 1 }}>
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
              className="transition-colors duration-base"
              style={{
                flexShrink: 0,
                fontFamily: "var(--font-label)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                padding: "7px 12px",
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
                        borderRadius: "1px",
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
                            borderRadius: "1px",
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
                style={{ flexShrink: 0, background: "transparent", border: "none", padding: "4px" }}
              >
                <ListOrdered size={15} strokeWidth={1.5} style={{ color: "var(--ink-30)" }} />
              </button>
            ) : null}
          </div>
        </div>

        <div
          ref={scrollContainerRef}
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
              handleApplyProgressiveOverload={stableApplyProgressiveOverload}
              setPlateDisplayMode={setPlateDisplayMode}
              setPlateStartingWeight={setPlateStartingWeight}
              onOpenExercise={openExercisePage}
              registerWeightRef={registerWeightRef}
              registerRepsRef={registerRepsRef}
            />
          ))}
        </div>
      </div>

      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        input[type="number"] {
          -moz-appearance: textfield;
        }

        @keyframes rest-breathe {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .rest-breathe {
          animation: rest-breathe 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .rest-breathe { animation: none; opacity: 1; }
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
