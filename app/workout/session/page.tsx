"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import WorkoutSession from "@/components/workout-session"
import { useDeloadWeek } from "@/hooks/useDeloadWeek"
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import { getRoutineById, type WorkoutRoutine } from "@/lib/routine-storage"
import {
  deleteSession,
  deleteSetsForSession,
  getCurrentInProgressSession,
  saveCurrentSessionId,
  type WorkoutSession as AutosaveWorkoutSession,
} from "@/lib/autosave-workout-storage"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function WorkoutSessionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const routineId = searchParams.get("routineId")
  const { isDeload, loading: deloadLoading } = useDeloadWeek()
  const [routine, setRoutine] = useState<WorkoutRoutine | null>(null)
  const [activeSession, setActiveSession] = useState<AutosaveWorkoutSession | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)

  const resolveRoutine = useMemo(() => {
    return (id: string | null) => {
      if (!id) return null
      return getRoutineById(id) || GROWTH_V2_ROUTINES.find((routine) => routine.id === id) || null
    }
  }, [])

  const toRoutineFromSession = useMemo(() => {
    return (session: AutosaveWorkoutSession | null): WorkoutRoutine | null => {
      if (!session) return null
      const byId = resolveRoutine(session.routineId || null)
      if (byId) return byId

      const fallbackExercises = Array.isArray(session.exercises) ? session.exercises : []
      if (fallbackExercises.length === 0) return null

      const nowIso = new Date().toISOString()
      return {
        id: session.routineId || `resumed-${session.id}`,
        name: session.routineName || "Resumed Workout",
        description: "Recovered from active session",
        estimatedTime: "45 min",
        category: "Recovered",
        createdAt: nowIso,
        updatedAt: nowIso,
        exercises: fallbackExercises.map((exercise: any, index: number) => ({
          id: exercise.id || `exercise-${index + 1}`,
          name: exercise.name || `Exercise ${index + 1}`,
          type: "strength",
          targetSets:
            typeof exercise.targetSets === "number"
              ? exercise.targetSets
              : Array.isArray(exercise.sets)
                ? exercise.sets.length
                : 1,
          targetReps:
            typeof exercise.targetReps === "string"
              ? exercise.targetReps
              : exercise.targetReps != null
                ? String(exercise.targetReps)
                : "8-12",
          notes: typeof exercise.notes === "string" ? exercise.notes : undefined,
        })),
      }
    }
  }, [resolveRoutine])

  useEffect(() => {
    const current = getCurrentInProgressSession()

    if (!routineId) {
      setRoutine(toRoutineFromSession(current))
      return
    }

    if (current?.routineId && current.routineId !== routineId) {
      setActiveSession(current)
      setConflictOpen(true)
      setRoutine(null)
      return
    }

    const resolved = resolveRoutine(routineId)
    if (resolved) {
      setRoutine(resolved)
      return
    }

    setRoutine(toRoutineFromSession(current))
  }, [routineId, resolveRoutine, toRoutineFromSession])

  const handleResumeExisting = () => {
    if (!activeSession?.routineId) return
    setConflictOpen(false)
    router.replace(`/workout/session?routineId=${activeSession.routineId}`)
  }

  const handleDiscardExisting = () => {
    if (activeSession?.id) {
      deleteSetsForSession(activeSession.id)
      deleteSession(activeSession.id)
    }
    saveCurrentSessionId(null)
    setActiveSession(null)
    setConflictOpen(false)
    setRoutine(resolveRoutine(routineId))
  }

  if (conflictOpen) {
    return (
      <>
        <div
          className="min-h-screen"
          style={{
            background: "#0D0D0F",
            boxShadow: "inset 0 0 200px rgba(255, 255, 255, 0.01)",
          }}
        />
        <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
          <AlertDialogContent
            className="border-0"
            style={{
              background: "rgba(10, 10, 12, 0.96)",
              borderRadius: "18px",
              boxShadow: "0 30px 80px rgba(0, 0, 0, 0.45)",
              padding: "24px",
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle
                className="text-white"
                style={{ fontSize: "18px", fontWeight: 500, letterSpacing: "-0.01em" }}
              >
                Active Workout Detected
              </AlertDialogTitle>
              <div
                className="text-white/40"
                style={{ fontSize: "12px", fontWeight: 400, letterSpacing: "0.01em", lineHeight: "1.5" }}
              >
                You have an active workout in progress ({activeSession?.routineName || "Workout"}). Would you like to
                resume it or start a new workout? Starting a new workout will discard your current progress.
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
              <AlertDialogAction
                onClick={handleResumeExisting}
                className="w-full"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
              >
                <span className="text-white/90" style={{ fontSize: "12px", fontWeight: 500, letterSpacing: "0.02em" }}>
                  Resume Existing
                </span>
              </AlertDialogAction>
              <AlertDialogAction
                onClick={handleDiscardExisting}
                className="w-full"
                style={{
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
              >
                <span className="text-white/60" style={{ fontSize: "12px", fontWeight: 400, letterSpacing: "0.02em" }}>
                  Discard & Start New
                </span>
              </AlertDialogAction>
              <AlertDialogCancel
                onClick={() => setConflictOpen(false)}
                className="w-full"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "8px",
                  padding: "10px",
                }}
              >
                <span className="text-white/40" style={{ fontSize: "11px", fontWeight: 400 }}>
                  Cancel
                </span>
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  if (!routine || deloadLoading) {
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

  return <WorkoutSession routine={routine} isDeload={isDeload} />
}
