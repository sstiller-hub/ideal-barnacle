"use client"

import { useId, useState } from "react"
import { MinusCircle, Plus } from "lucide-react"
import { plural } from "@/lib/utils"
import type { RoutineExercise } from "@/lib/routine-storage"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosActionRow, IosGroup, IosRow, IosSectionFooter, IosSectionHeader } from "@/components/ios/grouped"

const BASE_CATEGORIES = ["Strength", "Cardio", "Hybrid"]

export type RoutineFormValues = {
  name: string
  description: string
  category: string
  exercises: RoutineExercise[]
}

type Props = {
  title: string
  backLabel: string
  onBack: () => void
  initial: RoutineFormValues
  onSave: (values: RoutineFormValues) => void
}

/**
 * Shared editor for Create Routine and Edit Routine. The category picker always
 * offers the routine's own category, so a routine filed under something like
 * "Upper" shows that instead of silently displaying the first option.
 */
export default function RoutineForm({ title, backLabel, onBack, initial, onSave }: Props) {
  const ids = useId()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [category, setCategory] = useState(initial.category)
  const [exercises, setExercises] = useState<RoutineExercise[]>(initial.exercises)
  const [draft, setDraft] = useState({ name: "", targetSets: 3, targetReps: "8-10" })
  const [error, setError] = useState<string | null>(null)

  const categories = BASE_CATEGORIES.includes(category) ? BASE_CATEGORIES : [category, ...BASE_CATEGORIES]

  const addExercise = () => {
    if (!draft.name.trim()) return
    setExercises([
      ...exercises,
      { id: Date.now().toString(), type: "strength", name: draft.name.trim(), targetSets: draft.targetSets, targetReps: draft.targetReps },
    ])
    setDraft({ name: "", targetSets: 3, targetReps: "8-10" })
  }

  const save = () => {
    if (!name.trim()) return setError("Give the routine a name.")
    if (exercises.length === 0) return setError("Add at least one exercise.")
    setError(null)
    onSave({ name: name.trim(), description, category, exercises })
  }

  return (
    <main style={{ minHeight: "100%", background: "var(--background)", paddingBottom: "40px" }}>
      <IosNavPage
        backLabel={backLabel}
        onBack={onBack}
        title={title}
        action={
          <button type="button" className="ios-navbar__action" onClick={save}>
            Save
          </button>
        }
      >
        <IosSectionHeader>Details</IosSectionHeader>
        <IosGroup>
          <label className="ios-row" htmlFor={`${ids}-name`}>
            <span style={{ flex: "0 0 auto" }}>Name</span>
            <input
              id={`${ids}-name`}
              className="ios-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Upper Body Push"
            />
          </label>
          <label className="ios-row" htmlFor={`${ids}-desc`}>
            <span style={{ flex: "0 0 auto" }}>Description</span>
            <input
              id={`${ids}-desc`}
              className="ios-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="ios-row" htmlFor={`${ids}-cat`}>
            <span style={{ flex: "0 0 auto" }}>Category</span>
            <select
              id={`${ids}-cat`}
              className="ios-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </IosGroup>

        <IosSectionHeader>
          {exercises.length} {plural(exercises.length, "exercise", "exercises")}
        </IosSectionHeader>
        {exercises.length > 0 ? (
          <IosGroup>
            {exercises.map((exercise) => (
              <IosRow
                key={exercise.id}
                label={exercise.name}
                detail={`${exercise.targetSets} ${plural(exercise.targetSets, "set", "sets")} × ${exercise.targetReps} reps`}
                accessory={
                  <button
                    type="button"
                    className="ios-icon-btn"
                    aria-label={`Remove ${exercise.name}`}
                    onClick={() => setExercises(exercises.filter((e) => e.id !== exercise.id))}
                  >
                    <MinusCircle size={20} strokeWidth={1.8} />
                  </button>
                }
              />
            ))}
          </IosGroup>
        ) : null}

        <IosSectionHeader>Add exercise</IosSectionHeader>
        <IosGroup>
          <label className="ios-row" htmlFor={`${ids}-ex-name`}>
            <span style={{ flex: "0 0 auto" }}>Exercise</span>
            <input
              id={`${ids}-ex-name`}
              className="ios-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name"
            />
          </label>
          <label className="ios-row" htmlFor={`${ids}-ex-sets`}>
            <span style={{ flex: "0 0 auto" }}>Sets</span>
            <input
              id={`${ids}-ex-sets`}
              className="ios-input"
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.targetSets}
              onChange={(e) => setDraft({ ...draft, targetSets: Number.parseInt(e.target.value) || 1 })}
            />
          </label>
          <label className="ios-row" htmlFor={`${ids}-ex-reps`}>
            <span style={{ flex: "0 0 auto" }}>Reps</span>
            <input
              id={`${ids}-ex-reps`}
              className="ios-input"
              value={draft.targetReps}
              onChange={(e) => setDraft({ ...draft, targetReps: e.target.value })}
            />
          </label>
          <IosActionRow
            label={
              <span className="inline-flex items-center" style={{ gap: "6px" }}>
                <Plus size={16} strokeWidth={2.4} /> Add to routine
              </span>
            }
            onClick={addExercise}
            emphasis
            disabled={!draft.name.trim()}
          />
        </IosGroup>
        {error ? (
          <IosSectionFooter>
            <span role="alert" style={{ color: "var(--warn)" }}>
              {error}
            </span>
          </IosSectionFooter>
        ) : null}
      </IosNavPage>
    </main>
  )
}
