"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import WorkoutSession from "@/components/workout-session"
import { getRoutineById, type WorkoutRoutine } from "@/lib/routine-storage"

export default function WorkoutSessionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const routineId = searchParams.get("routineId")
  const [routine, setRoutine] = useState<WorkoutRoutine | null>(null)

  useEffect(() => {
    if (routineId) {
      const loadedRoutine = getRoutineById(routineId)
      setRoutine(loadedRoutine)
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
