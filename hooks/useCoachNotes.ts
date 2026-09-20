"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  coachNoteTarget,
  dismissCoachNote,
  fetchOpenCoachNotes,
  groupExerciseNotes,
  selectGlobalNotes,
  selectWorkoutNotes,
  type CoachNote,
} from "@/lib/coach-notes"

const NO_NOTES: CoachNote[] = []

/**
 * Open coach notes for the current screen.
 *
 * Fetched exactly once per mount — at workout start for the session screen, on
 * load for the pre-workout screen. Notes are authored between sessions, so
 * there is nothing to re-read while one is running.
 *
 * Dismissal is optimistic: the card leaves on the swipe and the write follows.
 * A failed write is rolled back so the note is not silently lost.
 */
export function useCoachNotes(options?: { workoutName?: string | null }) {
  const workoutName = options?.workoutName ?? null
  const [notes, setNotes] = useState<CoachNote[]>(NO_NOTES)

  useEffect(() => {
    let cancelled = false
    fetchOpenCoachNotes().then((rows) => {
      // Nothing to show is the common case and the state already holds the
      // empty sentinel, so returning here settles the fetch without a
      // re-render that would paint exactly the same screen.
      if (cancelled || rows.length === 0) return
      setNotes(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const notesByTarget = useMemo(() => groupExerciseNotes(notes), [notes])

  const workoutNotes = useMemo(
    () => (workoutName ? selectWorkoutNotes(notes, workoutName) : NO_NOTES),
    [notes, workoutName]
  )

  const globalNotes = useMemo(() => selectGlobalNotes(notes), [notes])

  const notesForExercise = useCallback(
    (exerciseName: string): CoachNote[] => notesByTarget.get(coachNoteTarget(exerciseName)) ?? NO_NOTES,
    [notesByTarget]
  )

  const dismiss = useCallback(async (noteId: string): Promise<boolean> => {
    let removed: CoachNote | undefined
    setNotes((prev) => {
      removed = prev.find((note) => note.id === noteId)
      return prev.filter((note) => note.id !== noteId)
    })

    const ok = await dismissCoachNote(noteId)
    if (!ok && removed) {
      const restored = removed
      setNotes((prev) => (prev.some((note) => note.id === restored.id) ? prev : [restored, ...prev]))
    }
    return ok
  }, [])

  return { notes, notesByTarget, notesForExercise, workoutNotes, globalNotes, dismiss }
}
