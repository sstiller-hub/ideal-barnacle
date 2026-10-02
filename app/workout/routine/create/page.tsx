"use client"

import { useRouter } from "next/navigation"
import { saveRoutine, type WorkoutRoutine } from "@/lib/routine-storage"
import RoutineForm from "@/components/routine-form"

export default function CreateRoutinePage() {
  const router = useRouter()

  return (
    <RoutineForm
      title="New Routine"
      backLabel="Routines"
      onBack={() => router.push("/workout")}
      initial={{ name: "", description: "", category: "Strength", exercises: [] }}
      onSave={({ name, description, category, exercises }) => {
        const routine: WorkoutRoutine = {
          id: Date.now().toString(),
          name,
          description,
          exercises,
          estimatedTime: `${exercises.length * 10} min`,
          category,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        saveRoutine(routine)
        router.push("/workout")
      }}
    />
  )
}
