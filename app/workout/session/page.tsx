"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import WorkoutSession from "@/components/workout-session"
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"
import { getRoutineById, type WorkoutRoutine } from "@/lib/routine-storage"

export default function WorkoutSessionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const routineId = searchParams.get("routineId")
  const [routine, setRoutine] = useState<WorkoutRoutine | null>(null)

  useEffect(() => {
    if (routineId) {
      const loadedRoutine = getRoutineById(routineId)
      if (loadedRoutine) {
        setRoutine(loadedRoutine)
        return
      }
      const growthRoutine = GROWTH_V2_ROUTINES.find((routine) => routine.id === routineId) || null
      setRoutine(growthRoutine)
    }
  }, [routineId])

  if (!routine) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading workout...</p>
      </div>
    )
  }

  return <WorkoutSession routine={routine} />
}
