"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { CompletedWorkout } from "@/lib/workout-storage"
import {
  buildTranscriptionPlan,
  countVisibleSets,
  normalizeExerciseName,
  visibleExercises,
  type AliasMap,
} from "@/lib/whoop-transcription"
import {
  getExerciseAliases,
  getTranscriptionProgress,
  saveExerciseAlias,
  saveTranscriptionProgress,
} from "@/lib/whoop-transcription-storage"
import TranscriptionHeader from "./transcription-header"
import ExercisePager from "./exercise-pager"
import ExercisePanel from "./exercise-panel"

type TranscriptionSessionProps = {
  workout: CompletedWorkout
  onClose: () => void
}

export default function TranscriptionSession({ workout, onClose }: TranscriptionSessionProps) {
  const [aliases, setAliases] = useState<AliasMap>({})
  const [checkedSetIds, setCheckedSetIds] = useState<Set<string>>(new Set())
  const [activeIndex, setActiveIndex] = useState(0)
  const [showWarmups, setShowWarmups] = useState(false)
  const [restored, setRestored] = useState(false)

  // Restore aliases and progress once, on mount. Everything after this writes
  // through synchronously, so an app switch or a lock screen loses nothing.
  useEffect(() => {
    setAliases(getExerciseAliases())
    const progress = getTranscriptionProgress(workout.id)
    if (progress) {
      setCheckedSetIds(new Set(progress.checkedSetIds))
      setActiveIndex(progress.lastExerciseIndex)
      setShowWarmups(Boolean(progress.showWarmups))
    }
    setRestored(true)
  }, [workout.id])

  const plan = useMemo(() => buildTranscriptionPlan(workout, aliases), [workout, aliases])
  const exercises = useMemo(() => visibleExercises(plan, showWarmups), [plan, showWarmups])
  const visibleSetCount = useMemo(() => countVisibleSets(exercises), [exercises])

  const safeIndex = exercises.length === 0 ? 0 : Math.min(activeIndex, exercises.length - 1)
  const activeExercise = exercises[safeIndex] ?? null

  const persist = useCallback(
    (next: { checkedSetIds?: Set<string>; lastExerciseIndex?: number; showWarmups?: boolean }) => {
      saveTranscriptionProgress(workout.id, {
        checkedSetIds: Array.from(next.checkedSetIds ?? checkedSetIds),
        lastExerciseIndex: next.lastExerciseIndex ?? safeIndex,
        showWarmups: next.showWarmups ?? showWarmups,
      })
    },
    [workout.id, checkedSetIds, safeIndex, showWarmups],
  )

  const toggleSet = useCallback(
    (setId: string) => {
      setCheckedSetIds((current) => {
        const next = new Set(current)
        if (next.has(setId)) next.delete(setId)
        else next.add(setId)
        persist({ checkedSetIds: next })
        return next
      })
    },
    [persist],
  )

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, exercises.length - 1))
      setActiveIndex(clamped)
      persist({ lastExerciseIndex: clamped })
      window.scrollTo({ top: 0 })
    },
    [exercises.length, persist],
  )

  const handleSaveAlias = useCallback(
    (whoopName: string) => {
      if (!activeExercise) return
      setAliases(saveExerciseAlias(normalizeExerciseName(activeExercise.aktName), whoopName))
    },
    [activeExercise],
  )

  const toggleWarmups = useCallback(() => {
    const next = !showWarmups
    setShowWarmups(next)
    setActiveIndex(0)
    persist({ showWarmups: next, lastExerciseIndex: 0 })
  }, [showWarmups, persist])

  if (!restored) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!activeExercise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">No completed sets to transcribe.</p>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-70 hover:text-ink-95 transition-colors duration-base"
            style={{
              background: "transparent",
              border: "1px solid var(--ink-15)",
              borderRadius: "8px",
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Back to summary
          </button>
        </div>
      </div>
    )
  }

  const checkedInActive = activeExercise.sets.filter((set) => checkedSetIds.has(set.id)).length
  const activeComplete = checkedInActive === activeExercise.sets.length
  const isLast = safeIndex === exercises.length - 1
  const hasWarmups = plan.exercises.some((ex) => ex.isWarmup && ex.sets.length > 0)

  return (
    <div className="min-h-screen bg-background" style={{ paddingBottom: "96px" }}>
      <TranscriptionHeader
        workoutName={plan.workoutName}
        exerciseOrdinal={safeIndex + 1}
        exerciseTotal={exercises.length}
        checkedSets={checkedSetIds.size}
        totalSets={visibleSetCount}
        onClose={onClose}
      />

      <div className="max-w-2xl mx-auto">
        <ExercisePager onPrevious={() => goTo(safeIndex - 1)} onNext={() => goTo(safeIndex + 1)}>
          <ExercisePanel
            key={activeExercise.index}
            exercise={activeExercise}
            checkedSetIds={checkedSetIds}
            onToggleSet={toggleSet}
            onSaveAlias={handleSaveAlias}
          />
        </ExercisePager>

        {hasWarmups && (
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={toggleWarmups}
              className="text-ink-30 hover:text-ink-50 transition-colors duration-base"
              style={{
                background: "transparent",
                border: "none",
                padding: "4px 0",
                cursor: "pointer",
                fontFamily: "var(--font-label)",
                fontSize: "10px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              {showWarmups ? "Hide warm-ups" : "Show warm-ups"}
            </button>
          </div>
        )}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0"
        style={{
          background: "rgba(10, 10, 12, 0.94)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid var(--ink-06)",
        }}
      >
        <div
          className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => goTo(safeIndex - 1)}
            disabled={safeIndex === 0}
            aria-label="Previous exercise"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "48px",
              width: "56px",
              background: "transparent",
              border: "1px solid var(--ink-12)",
              borderRadius: "10px",
              color: safeIndex === 0 ? "var(--ink-15)" : "var(--ink-70)",
              cursor: safeIndex === 0 ? "default" : "pointer",
            }}
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onClose() : goTo(safeIndex + 1))}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              flex: 1,
              minHeight: "48px",
              background: activeComplete ? "var(--foreground)" : "transparent",
              border: `1px solid ${activeComplete ? "var(--foreground)" : "var(--ink-12)"}`,
              borderRadius: "10px",
              color: activeComplete ? "var(--background)" : "var(--ink-70)",
              cursor: "pointer",
              fontFamily: "var(--font-label)",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              transition: "background 160ms ease, color 160ms ease, border-color 160ms ease",
            }}
          >
            {isLast ? "Done" : "Next exercise"}
            {!isLast && <ChevronRight size={16} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </div>
  )
}
