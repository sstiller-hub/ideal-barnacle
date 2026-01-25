"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import WorkoutSession from "@/components/workout-session"
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
  const [routine, setRoutine] = useState<WorkoutRoutine | null>(null)
  const [activeSession, setActiveSession] = useState<AutosaveWorkoutSession | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)

  const resolveRoutine = useMemo(() => {
    return (id: string | null) => {
      if (!id) return null
      return getRoutineById(id) || GROWTH_V2_ROUTINES.find((routine) => routine.id === id) || null
    }
  }, [])

  useEffect(() => {
    if (routineId) {
      const current = getCurrentInProgressSession()
      if (current?.routineId && current.routineId !== routineId) {
        setActiveSession(current)
        setConflictOpen(true)
        setRoutine(null)
        return
      }
      setRoutine(resolveRoutine(routineId))
    }
  }, [routineId, resolveRoutine])

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
        <div className="min-h-screen bg-[#0A0A0C]" />
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

  if (!routine) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading workout...</p>
      </div>
    )
  }

  return <WorkoutSession routine={routine} />
}
