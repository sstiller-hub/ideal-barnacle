"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getWorkoutHistory } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"

type VolumePoint = { date: string; volume: number }

export default function VolumeHistoryPage() {
  const router = useRouter()
  const history = getWorkoutHistory()

  const exercises = useMemo(() => {
    const map = new Map<string, VolumePoint[]>()

    history.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const volume = exercise.sets
          .filter((set) => isSetEligibleForStats(set))
          .reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
        if (volume <= 0) return
        const list = map.get(exercise.name) ?? []
        list.push({ date: workout.date, volume })
        map.set(exercise.name, list)
      })
    })

    return Array.from(map.entries())
      .map(([name, timeline]) => {
        const sorted = [...timeline].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        const last = sorted[sorted.length - 1]
        const prev = sorted[sorted.length - 2]
        const trendPct =
          prev && prev.volume > 0 ? Math.round(((last.volume - prev.volume) / prev.volume) * 100) : null
        return {
          name,
          timeline: sorted,
          lastVolume: last?.volume ?? 0,
          trendPct,
        }
      })
      .sort((a, b) => b.lastVolume - a.lastVolume)
  }, [history])

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
                TRAINING VOLUME
              </div>
              <h1
                className="text-white/95"
                style={{ fontSize: "20px", fontWeight: 500, letterSpacing: "-0.02em" }}
              >
                Volume by Exercise
              </h1>
              <p className="text-white/35" style={{ fontSize: "11px" }}>
                {exercises.length} exercises tracked
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {exercises.map((exercise) => {
          const series = exercise.timeline.slice(-7)
          const max = Math.max(...series.map((p) => p.volume), 0)
          const min = Math.min(...series.map((p) => p.volume), 0)
          const range = max - min || 1
          const points = series
            .map((point, idx) => {
              const x = (idx / Math.max(series.length - 1, 1)) * 120
              const y = 40 - ((point.volume - min) / range) * 30 - 5
              return `${x},${y}`
            })
            .join(" ")

          return (
            <button
              key={exercise.name}
              onClick={() => router.push(`/exercise/${encodeURIComponent(exercise.name)}`)}
              className="w-full text-left transition-all duration-200"
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                padding: "14px",
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-white/90" style={{ fontSize: "13px", fontWeight: 500 }}>
                    {exercise.name}
                  </div>
                  <div className="text-white/35" style={{ fontSize: "10px" }}>
                    Last volume: {Math.round(exercise.lastVolume).toLocaleString()} lbs
                  </div>
                </div>
                <div className="text-right">
                  {typeof exercise.trendPct === "number" && (
                    <div className="text-white/50" style={{ fontSize: "10px" }}>
                      {exercise.trendPct >= 0 ? "+" : ""}
                      {exercise.trendPct}%
                    </div>
                  )}
                  <svg width="120" height="40" viewBox="0 0 120 40">
                    <polyline
                      points={points}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.6)"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </button>
          )
        })}

        {exercises.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/40">No volume data yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
