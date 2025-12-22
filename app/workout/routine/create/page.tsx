"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { saveRoutine, type WorkoutRoutine, type RoutineExercise } from "@/lib/routine-storage"

export default function CreateRoutinePage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("Strength")
  const [exercises, setExercises] = useState<RoutineExercise[]>([])
  const [showAddExercise, setShowAddExercise] = useState(false)

  const [newExercise, setNewExercise] = useState({
    name: "",
    type: "strength" as const,
    targetSets: 3,
    targetReps: "8-10",
  })

  const handleAddExercise = () => {
    if (!newExercise.name.trim()) return
    const exercise: RoutineExercise = {
      id: Date.now().toString(),
      ...newExercise,
    }
    setExercises([...exercises, exercise])
    setNewExercise({ name: "", type: "strength", targetSets: 3, targetReps: "8-10" })
    setShowAddExercise(false)
  }

  const handleRemoveExercise = (id: string) => {
    setExercises(exercises.filter((e) => e.id !== id))
  }

  const handleSave = () => {
    if (!name.trim() || exercises.length === 0) {
      alert("Please add a name and at least one exercise")
      return
    }

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
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border px-4 py-4 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-muted-foreground">
          ‹
        </button>
        <h1 className="text-lg font-bold">Create Routine</h1>
        <button onClick={handleSave} className="text-primary font-medium">
          Save
        </button>
      </header>

      <div className="px-4 py-4 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Routine Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Upper Body Push"
            className="bg-background"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description"
            className="bg-background"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-input rounded-md"
          >
            <option value="Strength">Strength</option>
            <option value="Cardio">Cardio</option>
            <option value="Hybrid">Hybrid</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Exercises</label>
            <Button size="sm" onClick={() => setShowAddExercise(true)}>
              + Add Exercise
            </Button>
          </div>

          {exercises.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              <p className="text-sm">No exercises added yet</p>
            </Card>
          )}

          <div className="space-y-2">
            {exercises.map((exercise, index) => (
              <Card key={exercise.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{exercise.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {exercise.targetSets} sets × {exercise.targetReps} reps
                    </div>
                  </div>
                  <button onClick={() => handleRemoveExercise(exercise.id)} className="text-destructive px-2">
                    ×
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {showAddExercise && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowAddExercise(false)} />
          <div className="fixed inset-x-4 top-20 bg-card border border-border rounded-lg p-4 z-50 space-y-3">
            <h3 className="font-semibold">Add Exercise</h3>
            <Input
              value={newExercise.name}
              onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })}
              placeholder="Exercise name"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Sets</label>
                <Input
                  type="number"
                  value={newExercise.targetSets}
                  onChange={(e) => setNewExercise({ ...newExercise, targetSets: Number.parseInt(e.target.value) || 3 })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reps</label>
                <Input
                  value={newExercise.targetReps}
                  onChange={(e) => setNewExercise({ ...newExercise, targetReps: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddExercise(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleAddExercise} className="flex-1">
                Add
              </Button>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
