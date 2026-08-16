"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import TranscriptionSession from "@/components/whoop/transcription-session"

export default function WhoopTranscribePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workoutId = searchParams.get("workoutId") ?? searchParams.get("id")

  const [workout, setWorkout] = useState<CompletedWorkout | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Same retry-on-miss as the summary page: the workout may not have landed in
  // localStorage yet when we arrive straight from a finished session.
  useEffect(() => {
    if (!workoutId) {
      router.push("/")
      return
    }

    let cancelled = false
    const maxAttempts = 5

    const load = (attempt: number) => {
      const record = getWorkoutHistory().find((w) => w.id === workoutId) || null

      if (!record) {
        if (attempt < maxAttempts - 1) {
          setTimeout(() => {
            if (!cancelled) load(attempt + 1)
          }, 250)
          return
        }
        if (!cancelled) {
          setLoading(false)
          setNotFound(true)
        }
        return
      }

      if (cancelled) return
      setWorkout(record)
      setLoading(false)
      setNotFound(false)
    }

    load(0)

    return () => {
      cancelled = true
    }
  }, [router, workoutId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading workout...</p>
      </div>
    )
  }

  if (notFound || !workout) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Workout not found.</p>
          <button
            type="button"
            onClick={() => router.push("/history")}
            className="text-ink-70 hover:text-ink-95 transition-colors duration-base"
            style={{
              background: "transparent",
              border: "1px solid var(--ink-15)",
              borderRadius: "8px",
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            All workouts
          </button>
        </div>
      </div>
    )
  }

  return (
    <TranscriptionSession
      workout={workout}
      onClose={() => router.push(`/workout-summary?workoutId=${workout.id}`)}
    />
  )
}
