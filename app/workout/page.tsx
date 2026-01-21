"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
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
  const [showActionMenu, setShowActionMenu] = useState(false)
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
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-4 flex items-center justify-between">
        <button onClick={() => router.push("/")} className="text-muted-foreground">
          ‹
        </button>
        <h1 className="text-lg font-bold">Workout Routines</h1>
        <div className="w-6" />
      </header>

      {/* Workout Routines */}
      <div className="px-4 py-4">
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground">MY ROUTINES</h2>
        <div className="space-y-2">
          {routines.map((routine) => {
            const isActive = session?.routineId === routine.id

            return (
              <Card
                key={routine.id}
                className={`p-4 cursor-pointer hover:bg-accent/50 transition-colors ${
                  isActive ? "border-2 border-primary bg-primary/5" : ""
                }`}
                onClick={() => handleStartWorkout(routine.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base">{routine.name}</h3>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                          {session.status === "paused" ? "Paused" : "In Progress"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{routine.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/workout/routine/edit?id=${routine.id}`)
                      }}
                      className="text-muted-foreground hover:text-foreground px-2"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => handleDeleteRoutine(routine.id, e)}
                      className="text-muted-foreground hover:text-destructive px-2"
                    >
                      🗑️
                    </button>
                    <span className="text-muted-foreground">›</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">💪 {routine.exercises.length} exercises</span>
                  <span className="flex items-center gap-1">⏱️ {routine.estimatedTime}</span>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                    {routine.category}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>

        {routines.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No routines yet</p>
            <p className="text-xs mt-1">Tap the + button to create your first routine</p>
          </div>
        )}
      </div>

      {/* Action Menu (floating above FAB) */}
      {showActionMenu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setShowActionMenu(false)} />
          <div className="fixed bottom-36 right-6 bg-card border border-border rounded-lg shadow-xl p-2 z-30 min-w-[160px]">
            <button
              onClick={() => {
                setShowActionMenu(false)
                router.push("/workout/routine/create")
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent rounded text-sm flex items-center gap-2"
            >
              <span>💪</span> New Routine
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => setShowActionMenu(!showActionMenu)}
        className={`fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl text-primary-foreground transition-all z-10 ${
          showActionMenu ? "bg-muted-foreground rotate-45" : "bg-primary hover:scale-110"
        }`}
        aria-label="Actions"
      >
        +
      </button>

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

      {/* Bottom Navigation */}
    </main>
  )
}
