"use client"

import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getExerciseHistory } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"

export default function ExerciseHistoryPage() {
  const router = useRouter()
  const params = useParams<{ name?: string }>()
  const rawName = typeof params?.name === "string" ? params.name : ""
  const exerciseName = rawName ? decodeURIComponent(rawName) : "Unknown exercise"
  const rawHistory = getExerciseHistory(exerciseName)
  const seenWorkoutIds = new Set<string>()
  const seenWorkoutKeys = new Set<string>()
  const history = rawHistory.filter((workout) => {
    if (workout?.id) {
      if (seenWorkoutIds.has(workout.id)) return false
      seenWorkoutIds.add(workout.id)
    }

    const day = workout?.date ? new Date(workout.date) : null
    const dayKey = day && !Number.isNaN(day.getTime())
      ? day.toISOString().slice(0, 10)
      : "unknown-date"
    const workoutName = workout?.name || "Unknown"

    const exercise = workout.exercises.find((e) => e.name === exerciseName)
    const setSignature = exercise
      ? exercise.sets
          .filter((set) => set.completed)
          .map((set) => `${set.weight ?? 0}x${set.reps ?? 0}`)
          .join("|")
      : "no-sets"
    const volume = exercise
      ? exercise.sets
          .filter((set) => isSetEligibleForStats(set))
          .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      : 0

    const compositeKey = `${dayKey}::${workoutName}::${setSignature}::${Math.round(volume)}`
    if (seenWorkoutKeys.has(compositeKey)) return false
    seenWorkoutKeys.add(compositeKey)
    return true
  })

  const volumeSeries = history
    .map((workout) => {
      const exercise = workout.exercises.find((e) => e.name === exerciseName)
      if (!exercise) return null
      const volume = exercise.sets
        .filter((set) => isSetEligibleForStats(set))
        .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      return {
        date: workout.date,
        volume,
        workoutName: workout.name,
      }
    })
    .filter(Boolean) as Array<{ date: string; volume: number; workoutName: string }>

  const chartData = [...volumeSeries].reverse()
  const maxVolume = Math.max(...chartData.map((point) => point.volume), 0)
  const minVolume = Math.min(...chartData.map((point) => point.volume), 0)
  const range = maxVolume - minVolume || 1
  const points = chartData
    .map((point, idx) => {
      const x = (idx / Math.max(chartData.length - 1, 1)) * 400
      const y = 100 - ((point.volume - minVolume) / range) * 80 - 10
      return `${x},${y}`
    })
    .join(" ")

  return (
    <div
      className="min-h-screen pb-20"
      style={{
        background: "#0D0D0F",
        boxShadow: "inset 0 0 200px rgba(255, 255, 255, 0.01)",
      }}
    >
      <div className="sticky top-0 z-10" style={{ background: "rgba(10, 10, 12, 0.92)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              style={{ color: "rgba(255, 255, 255, 0.7)" }}
            >
              ‹
            </Button>
            <div>
              <div
                className="text-white/25 tracking-widest"
                style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                EXERCISE HISTORY
              </div>
              <h1
                className="text-white/95"
                style={{ fontSize: "20px", fontWeight: 500, letterSpacing: "-0.02em" }}
              >
                {exerciseName}
              </h1>
              <p className="text-white/35" style={{ fontSize: "11px" }}>
                {history.length} workouts logged
              </p>
            </div>
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div
            className="p-4"
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
            }}
          >
            <div
              className="text-white/25 tracking-widest mb-2"
              style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "'Archivo Narrow', sans-serif" }}
            >
              WORKOUT VOLUME
            </div>
            <div className="text-white/70" style={{ fontSize: "12px", marginBottom: "10px" }}>
              Total volume per workout
            </div>
            <div className="relative h-32">
              <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255, 255, 255, 0.18)" />
                    <stop offset="100%" stopColor="rgba(255, 255, 255, 0.00)" />
                  </linearGradient>
                </defs>
                {chartData.length > 1 ? (
                  <>
                    <polygon
                      points={`0,100 ${points} 400,100`}
                      fill="url(#volumeFill)"
                    />
                    <polyline
                      points={points}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.7)"
                      strokeWidth="2"
                    />
                  </>
                ) : (
                  <circle cx={200} cy={50} r="4" fill="rgba(255, 255, 255, 0.7)" />
                )}
              </svg>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 space-y-3 pb-4">
        {history.map((workout) => {
          const exercise = workout.exercises.find((e) => e.name === exerciseName)!
          const date = new Date(workout.date)
          const formattedDate = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          const volume = exercise.sets
            .filter((set) => isSetEligibleForStats(set))
            .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)

          return (
            <div
              key={workout.id}
              className="p-4"
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-white/90" style={{ fontSize: "13px", fontWeight: 500 }}>
                    {formattedDate}
                  </div>
                  <div className="text-white/35" style={{ fontSize: "10px" }}>
                    {workout.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white/70" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
                    VOLUME
                  </div>
                  <div className="text-white/90" style={{ fontSize: "12px", fontWeight: 600 }}>
                    {Math.round(volume).toLocaleString()} lbs
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {exercise.sets
                  .filter((s) => s.completed)
                  .map((set, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-white/35" style={{ fontSize: "11px" }}>
                        Set {idx + 1}
                      </span>
                      <span className="text-white/85" style={{ fontSize: "12px", fontWeight: 500 }}>
                        {set.weight} lbs × {set.reps} reps
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )
        })}

        {history.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/40">No history for this exercise yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
