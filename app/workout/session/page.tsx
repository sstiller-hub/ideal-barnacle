"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import WorkoutSession from "@/components/workout-session"
import { useDeloadWeek } from "@/hooks/useDeloadWeek"
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import { getRoutineById, type WorkoutRoutine } from "@/lib/routine-storage"
import { rememberActiveWorkoutRoute } from "@/lib/active-workout-route"
import { buildCapeRoutine, detectSessionGym, fetchCapeContext, GYM_LABELS, type Gym } from "@/lib/gym"
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
  // ?gym=sowa|bodystrong picks the gym up front and skips the question.
  const gymParam = searchParams.get("gym")
  const presetGym: Gym | null = gymParam === "sowa" || gymParam === "bodystrong" ? gymParam : null
  const { isDeload } = useDeloadWeek()
  const [routine, setRoutine] = useState<WorkoutRoutine | null>(null)
  const [activeSession, setActiveSession] = useState<AutosaveWorkoutSession | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  // A new workout asks where you are before it builds its sets; a resumed one
  // already knows from the exercise names it was started with.
  const [gym, setGym] = useState<Gym | null>(null)
  const [needsGymChoice, setNeedsGymChoice] = useState(false)
  const [sessionRoutine, setSessionRoutine] = useState<WorkoutRoutine | null>(null)

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
      setGym(detectSessionGym(current?.exercises as Array<{ name?: string }>))
      setNeedsGymChoice(false)
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
      const resuming = current?.routineId === routineId
      if (resuming) {
        setGym(detectSessionGym(current?.exercises as Array<{ name?: string }>))
        setNeedsGymChoice(false)
      } else {
        setGym(presetGym)
        setNeedsGymChoice(presetGym === null)
      }
      setRoutine(resolved)
      return
    }

    setGym(detectSessionGym(current?.exercises as Array<{ name?: string }>))
    setNeedsGymChoice(false)
    setRoutine(toRoutineFromSession(current))
  }, [routineId, presetGym, resolveRoutine, toRoutineFromSession])

  // Leave a breadcrumb while the session screen is open. If the app is evicted
  // from memory and relaunched at the manifest's start_url ("/"), the home
  // screen uses this to send the user back into the workout they were in.
  // Cape sessions run on the Cape version of the routine: machine exercises
  // take their Cape names (and calibrated starting weights).
  useEffect(() => {
    if (!routine) {
      setSessionRoutine(null)
      return
    }
    if (gym === null) {
      setSessionRoutine(needsGymChoice ? null : routine)
      return
    }
    if (gym === "sowa") {
      setSessionRoutine(routine)
      return
    }
    let cancelled = false
    void fetchCapeContext().then((context) => {
      if (!cancelled) setSessionRoutine(buildCapeRoutine(routine, context))
    })
    return () => {
      cancelled = true
    }
  }, [routine, gym, needsGymChoice])

  useEffect(() => {
    if (!routine) return
    rememberActiveWorkoutRoute(
      routineId ? `/workout/session?routineId=${encodeURIComponent(routineId)}` : "/workout/session",
    )
  }, [routine, routineId])

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
    setGym(null)
    setNeedsGymChoice(true)
    setRoutine(resolveRoutine(routineId))
  }

  const chooseGym = (choice: Gym) => {
    setGym(choice)
    setNeedsGymChoice(false)
  }

  if (conflictOpen) {
    return (
      <>
        <div
          className="min-h-screen"
          style={{
            background: "var(--background)",
          }}
        />
        <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
          <AlertDialogContent
            className="border-0"
            style={{
              background: "rgba(10, 10, 12, 0.96)",
              borderRadius: "var(--radius-2xl)",
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
                className="text-ink-50"
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
                  background: "var(--ink-08)",
                  border: "1px solid var(--ink-15)",
                  borderRadius: "var(--radius-xs)",
                  padding: "12px",
                }}
              >
                <span className="text-ink-90" style={{ fontSize: "12px", fontWeight: 500, letterSpacing: "0.02em" }}>
                  Resume Existing
                </span>
              </AlertDialogAction>
              <AlertDialogAction
                onClick={handleDiscardExisting}
                className="w-full"
                style={{
                  background: "var(--ink-04)",
                  border: "1px solid var(--ink-08)",
                  borderRadius: "var(--radius-xs)",
                  padding: "12px",
                }}
              >
                <span className="text-ink-50" style={{ fontSize: "12px", fontWeight: 400, letterSpacing: "0.02em" }}>
                  Discard & Start New
                </span>
              </AlertDialogAction>
              <AlertDialogCancel
                onClick={() => setConflictOpen(false)}
                className="w-full"
                style={{
                  background: "transparent",
                  border: "1px solid var(--ink-06)",
                  borderRadius: "var(--radius-xs)",
                  padding: "10px",
                }}
              >
                <span className="text-ink-50" style={{ fontSize: "11px", fontWeight: 400 }}>
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
      <div
        className="min-h-screen"
        style={{
          background: "var(--background)",
        }}
      />
    )
  }

  if (needsGymChoice && gym === null) {
    return <GymChoice routineName={routine.name} onChoose={chooseGym} />
  }

  if (!sessionRoutine) {
    return (
      <div
        className="min-h-screen"
        style={{
          background: "var(--background)",
        }}
      />
    )
  }

  return <WorkoutSession routine={sessionRoutine} isDeload={isDeload} gym={gym ?? "sowa"} />
}

function GymChoice({ routineName, onChoose }: { routineName: string; onChoose: (gym: Gym) => void }) {
  const options: Gym[] = ["sowa", "bodystrong"]
  return (
    <div
      className="min-h-screen flex flex-col justify-end"
      style={{
        background: "var(--background)",
        padding: "24px 16px calc(32px + env(safe-area-inset-bottom))",
      }}
    >
      <div className="text-ink-50" style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {routineName}
      </div>
      <div className="text-white" style={{ fontSize: "22px", fontWeight: 500, letterSpacing: "-0.01em", margin: "6px 0 20px" }}>
        Where are you training?
      </div>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChoose(option)}
            className="w-full text-left"
            style={{
              background: option === "sowa" ? "var(--ink-08)" : "var(--ink-04)",
              border: `1px solid ${option === "sowa" ? "var(--ink-15)" : "var(--ink-08)"}`,
              borderRadius: "var(--radius-xs)",
              padding: "16px",
              minHeight: "56px",
            }}
          >
            <span className="text-ink-90" style={{ fontSize: "15px", fontWeight: 500 }}>
              {GYM_LABELS[option].name}
            </span>
            <span className="text-ink-50" style={{ fontSize: "12px", marginLeft: "8px" }}>
              {GYM_LABELS[option].place}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
