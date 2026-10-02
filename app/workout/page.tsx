"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { plural } from "@/lib/utils"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosGroup, IosSectionFooter, IosSectionHeader } from "@/components/ios/grouped"
import { useState, useEffect } from "react"
import { getRoutines, deleteRoutine, type WorkoutRoutine } from "@/lib/routine-storage"
import {
  deleteSession,
  deleteSetsForSession,
  getCurrentInProgressSession,
  saveCurrentSessionId,
} from "@/lib/autosave-workout-storage"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function WorkoutsPage() {
  const router = useRouter()
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([])
  const [session, setSession] = useState<any>(null)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pendingRoutineId, setPendingRoutineId] = useState<string | null>(null)

  useEffect(() => {
    setRoutines(getRoutines())
    const currentSession = getCurrentInProgressSession()
    setSession(currentSession)
  }, [])

  const handleDeleteRoutine = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Are you sure you want to delete this routine?")) {
      deleteRoutine(id)
      setRoutines(getRoutines())
    }
  }

  const handleStartWorkout = (routineId: string) => {
    if (session) {
      // Show confirmation dialog
      setPendingRoutineId(routineId)
      setShowConflictDialog(true)
    } else {
      // No active workout - start new one
      router.push(`/workout/session?routineId=${routineId}`)
    }
  }

  const handleResumeExisting = () => {
    setShowConflictDialog(false)
    setPendingRoutineId(null)
    if (session?.routineId) {
      router.push(`/workout/session?routineId=${session.routineId}`)
    }
  }

  const handleDiscardExisting = () => {
    if (session?.id) {
      deleteSetsForSession(session.id)
      deleteSession(session.id)
    }
    saveCurrentSessionId(null)
    setSession(null)
    setShowConflictDialog(false)
    if (pendingRoutineId) {
      router.push(`/workout/session?routineId=${pendingRoutineId}`)
    }
    setPendingRoutineId(null)
  }

  return (
    <main style={{ minHeight: "100%", background: "var(--background)", paddingBottom: "40px" }}>
      <IosNavPage
        backLabel="Home"
        onBack={() => router.push("/")}
        title="Routines"
        action={
          <button
            type="button"
            className="ios-navbar__action"
            aria-label="New routine"
            onClick={() => router.push("/workout/routine/create")}
          >
            <Plus size={22} strokeWidth={2.2} />
          </button>
        }
      >
        {routines.length > 0 ? (
          <>
            <IosSectionHeader>
              {routines.length} {plural(routines.length, "routine", "routines")}
            </IosSectionHeader>
            <IosGroup>
              {routines.map((routine) => {
                const isActive = session?.routineId === routine.id
                return (
                  <div key={routine.id} className="ios-row" style={{ paddingTop: 0, paddingBottom: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleStartWorkout(routine.id)}
                      className="flex-1 text-left"
                      style={{
                        minWidth: 0,
                        padding: "12px 0",
                        background: "transparent",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      <span className="flex items-center" style={{ gap: "8px" }}>
                        <span style={{ fontSize: "17px" }}>{routine.name}</span>
                        {isActive && (
                          <span
                            style={{
                              fontFamily: "var(--font-label)",
                              fontSize: "10px",
                              fontWeight: 600,
                              letterSpacing: "0.05em",
                              padding: "2px 7px",
                              borderRadius: "var(--radius-flat)",
                              color: "var(--ink-70)",
                              background: "var(--ink-04)",
                              border: "1px solid var(--ink-08)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {session.status === "paused" ? "PAUSED" : "IN PROGRESS"}
                          </span>
                        )}
                      </span>
                      <span style={{ display: "block", fontSize: "13px", color: "var(--ink-50)", marginTop: "2px" }}>
                        {routine.exercises.length} {plural(routine.exercises.length, "exercise", "exercises")} ·{" "}
                        {routine.estimatedTime} · {routine.category}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ios-icon-btn"
                      style={{ margin: 0 }}
                      aria-label={`Edit ${routine.name}`}
                      onClick={() => router.push(`/workout/routine/edit?id=${routine.id}`)}
                    >
                      <Pencil size={17} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      className="ios-icon-btn"
                      style={{ margin: "0 -12px 0 0" }}
                      aria-label={`Delete ${routine.name}`}
                      onClick={(e) => handleDeleteRoutine(routine.id, e)}
                    >
                      <Trash2 size={17} strokeWidth={1.8} />
                    </button>
                  </div>
                )
              })}
            </IosGroup>
            <IosSectionFooter>Tap a routine to start it.</IosSectionFooter>
          </>
        ) : (
          <div className="ios-gft" style={{ paddingTop: "24px" }}>
            No routines yet. Tap + to create your first one.
          </div>
        )}
      </IosNavPage>

      {/* Conflict Resolution Dialog */}
      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Active Workout Detected</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active workout in progress ({session?.routineName || "Workout"}). Would you like to resume it
              or start a new workout? Starting a new workout will discard your current progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConflictDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardExisting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard & Start New
            </AlertDialogAction>
            <AlertDialogAction onClick={handleResumeExisting}>Resume Existing</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </main>
  )
}
