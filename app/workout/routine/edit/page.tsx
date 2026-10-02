"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getRoutineById, saveRoutine, type WorkoutRoutine } from "@/lib/routine-storage"
import RoutineForm from "@/components/routine-form"
import { IosNavPage } from "@/components/ios/nav-bar"

export default function EditRoutinePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const routineId = searchParams.get("id")
  // undefined = still loading from storage, null = no routine with that id
  const [routine, setRoutine] = useState<WorkoutRoutine | null | undefined>(undefined)

  useEffect(() => {
    setRoutine(routineId ? getRoutineById(routineId) ?? null : null)
  }, [routineId])

  if (routine === undefined) return <main style={{ minHeight: "100%", background: "var(--background)" }} />

  if (routine === null) {
    return (
      <main style={{ minHeight: "100%", background: "var(--background)" }}>
        <IosNavPage backLabel="Routines" onBack={() => router.push("/workout")} title="Edit Routine">
          <div className="ios-gft">This routine no longer exists.</div>
        </IosNavPage>
      </main>
    )
  }

  return (
    <RoutineForm
      title="Edit Routine"
      backLabel="Routines"
      onBack={() => router.push("/workout")}
      initial={{
        name: routine.name,
        description: routine.description,
        category: routine.category,
        exercises: routine.exercises,
      }}
      onSave={({ name, description, category, exercises }) => {
        saveRoutine({
          ...routine,
          name,
          description,
          exercises,
          category,
          estimatedTime: `${exercises.length * 10} min`,
        })
        router.push("/workout")
      }}
    />
  )
}
