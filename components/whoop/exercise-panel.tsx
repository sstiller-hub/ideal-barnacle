"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, Pencil } from "lucide-react"
import { toast } from "sonner"
import { formatExerciseName } from "@/lib/format-exercise-name"
import { formatExerciseAsText, type TranscriptionExercise } from "@/lib/whoop-transcription"
import SetRow from "./set-row"

type ExercisePanelProps = {
  exercise: TranscriptionExercise
  checkedSetIds: Set<string>
  onToggleSet: (setId: string) => void
  onSaveAlias: (whoopName: string) => void
}

export default function ExercisePanel({
  exercise,
  checkedSetIds,
  onToggleSet,
  onSaveAlias,
}: ExercisePanelProps) {
  const [editingAlias, setEditingAlias] = useState(false)
  const [draftAlias, setDraftAlias] = useState(exercise.whoopName ?? "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditingAlias(false)
    setDraftAlias(exercise.whoopName ?? "")
  }, [exercise.index, exercise.whoopName])

  useEffect(() => {
    if (editingAlias) inputRef.current?.focus()
  }, [editingAlias])

  const aktLabel = formatExerciseName(exercise.aktName)
  const commitAlias = () => {
    setEditingAlias(false)
    if (draftAlias.trim() !== (exercise.whoopName ?? "")) onSaveAlias(draftAlias)
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <div>
        {editingAlias ? (
          <input
            ref={inputRef}
            value={draftAlias}
            onChange={(e) => setDraftAlias(e.target.value)}
            onBlur={commitAlias}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAlias()
              if (e.key === "Escape") {
                setDraftAlias(exercise.whoopName ?? "")
                setEditingAlias(false)
              }
            }}
            placeholder="Name in Whoop's library"
            aria-label="Whoop exercise name"
            style={{
              width: "100%",
              fontFamily: "var(--font-display)",
              fontSize: "30px",
              lineHeight: 1.05,
              letterSpacing: "0.01em",
              color: "var(--ink-95)",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--ink-25)",
              outline: "none",
              padding: "0 0 4px",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingAlias(true)}
            aria-label={
              exercise.whoopName
                ? `Whoop name: ${exercise.whoopName}. Tap to edit.`
                : `Map ${aktLabel} to a Whoop exercise`
            }
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
              width: "100%",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              className={exercise.whoopName ? "text-ink-95" : "text-ink-70"}
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "30px",
                lineHeight: 1.05,
                letterSpacing: "0.01em",
                textTransform: "uppercase",
              }}
            >
              {exercise.whoopName ?? aktLabel}
            </span>
            <Pencil size={12} strokeWidth={2} className="text-ink-25 shrink-0" />
          </button>
        )}

        <p
          className="text-ink-35 mt-1.5"
          style={{ fontFamily: "var(--font-label)", fontSize: "11px", letterSpacing: "0.04em" }}
        >
          {exercise.whoopName ? aktLabel : "Tap to map to a Whoop exercise"}
          {exercise.isWarmup && " · warm-up"}
        </p>
      </div>

      <div className="space-y-2">
        {exercise.sets.map((set, i) => (
          <SetRow
            key={set.id}
            set={set}
            ordinal={i + 1}
            checked={checkedSetIds.has(set.id)}
            onToggle={() => onToggleSet(set.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(formatExerciseAsText(exercise))
            toast.success("Exercise copied")
          } catch {
            toast.error("Failed to copy exercise")
          }
        }}
        className="text-ink-40 hover:text-ink-70 transition-colors duration-base"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "transparent",
          border: "none",
          padding: "4px 0",
          cursor: "pointer",
          fontFamily: "var(--font-label)",
          fontSize: "11px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <Copy size={12} strokeWidth={2} />
        Copy this exercise
      </button>

      {exercise.sets.every((set) => checkedSetIds.has(set.id)) && (
        <div
          className="text-ink-50"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "var(--font-label)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <Check size={12} strokeWidth={2} />
          All sets entered
        </div>
      )}
    </div>
  )
}
