"use client"

import { useState, useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getExerciseHistory } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { getVolumeSeriesForExercise } from "@/lib/volume-analytics"
import type { TimeRange, Aggregation, WorkoutTypeFilter, AnnotatedPoint } from "@/lib/volume-analytics"
import { VolumeControls } from "@/components/volume-controls"

function areEquivalentSets(a: { reps: number | null; weight: number | null; completed: boolean }, b: { reps: number | null; weight: number | null; completed: boolean }): boolean {
  return (
    (a.reps ?? null) === (b.reps ?? null) &&
    (a.weight ?? null) === (b.weight ?? null) &&
    Boolean(a.completed) === Boolean(b.completed)
  )
}

function collapseMirroredSixSetPattern<T extends { reps: number | null; weight: number | null; completed: boolean }>(sets: T[]): T[] {
  if (sets.length < 4 || sets.length % 2 !== 0) return sets
  for (let i = 0; i < sets.length; i += 2) {
    if (!areEquivalentSets(sets[i], sets[i + 1])) return sets
  }
  return sets.filter((_, i) => i % 2 === 0)
}

function formatPeriodLabel(date: string, aggregation: Aggregation): string {
  const d = new Date(date)
  if (aggregation === "month") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }
  if (aggregation === "week") {
    return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function ExerciseHistoryPage() {
  const router = useRouter()
  const params = useParams<{ name?: string }>()
  const searchParams = useSearchParams()
  const fromSession = searchParams.get("from") === "session"
  const rawName = typeof params?.name === "string" ? params.name : ""
  const exerciseName = rawName ? decodeURIComponent(rawName) : "Unknown exercise"
  const rawHistory = getExerciseHistory(exerciseName)

  const [timeRange, setTimeRange] = useState<TimeRange>("All")
  const [aggregation, setAggregation] = useState<Aggregation>("session")
  const [typeFilter, setTypeFilter] = useState<WorkoutTypeFilter>("All")
  const [selectedPoint, setSelectedPoint] = useState<AnnotatedPoint | null>(null)

  const seenWorkoutIds = new Set<string>()
  const seenWorkoutKeys = new Set<string>()
  const baseHistory = rawHistory.filter((workout) => {
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

  const history = baseHistory.map((workout) => {
    const exercises = workout.exercises.map((exercise) => {
      const collapsedSets = collapseMirroredSixSetPattern(exercise.sets)
      if (collapsedSets === exercise.sets) return exercise
      return { ...exercise, sets: collapsedSets }
    })
    return { ...workout, exercises }
  })

  const annotatedSeries = useMemo(
    () => getVolumeSeriesForExercise(rawHistory, exerciseName, timeRange, aggregation, typeFilter),
    [rawHistory, exerciseName, timeRange, aggregation, typeFilter]
  )

  const chartW = 400
  const chartH = 100
  const maxVolume = Math.max(...annotatedSeries.map((p) => p.volume), 0)
  const minVolume = Math.min(...annotatedSeries.filter((p) => p.volume > 0).map((p) => p.volume), 0)
  const range = maxVolume - minVolume || 1

  function toX(i: number) {
    return (i / Math.max(annotatedSeries.length - 1, 1)) * chartW
  }
  function toY(v: number) {
    return chartH - ((v - minVolume) / range) * 80 - 10
  }

  const areaPoints = annotatedSeries.map((p, i) => `${toX(i)},${toY(p.volume)}`).join(" ")
  const rollingPoints = annotatedSeries
    .map((p, i) => (p.rollingAvg !== null ? `${toX(i)},${toY(p.rollingAvg)}` : null))
    .filter(Boolean)
    .join(" ")

  const historyForDrilldown = history

  return (
    <div
      className="min-h-screen pb-20"
      style={{ background: "#0D0D0F", boxShadow: "inset 0 0 200px rgba(255, 255, 255, 0.01)" }}
    >
      <div
        className="sticky top-0 z-10"
        style={{ background: "rgba(10, 10, 12, 0.92)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fromSession ? router.push("/workout/session") : router.back()}
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
              <h1 className="text-white/95" style={{ fontSize: "20px", fontWeight: 500, letterSpacing: "-0.02em" }}>
                {exerciseName}
              </h1>
              <p className="text-white/35" style={{ fontSize: "11px" }}>
                {history.length} workouts logged
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Controls */}
        <VolumeControls
          timeRange={timeRange}
          aggregation={aggregation}
          typeFilter={typeFilter}
          onTimeRangeChange={(r) => { setTimeRange(r); setSelectedPoint(null) }}
          onAggregationChange={(a) => { setAggregation(a); setSelectedPoint(null) }}
          onTypeFilterChange={setTypeFilter}
          showTypeFilter={false}
        />

        {/* Chart */}
        {annotatedSeries.length > 0 && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "7px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                fontFamily: "'Archivo Narrow', sans-serif",
                color: "rgba(255,255,255,0.25)",
                marginBottom: "6px",
              }}
            >
              WORKOUT VOLUME
            </div>
            <div className="text-white/70" style={{ fontSize: "12px", marginBottom: "10px" }}>
              Total volume per {aggregation === "session" ? "workout" : aggregation}
            </div>

            <div className="relative h-32">
              <svg
                className="w-full h-full"
                viewBox={`0 0 ${chartW} ${chartH}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255, 255, 255, 0.18)" />
                    <stop offset="100%" stopColor="rgba(255, 255, 255, 0.00)" />
                  </linearGradient>
                </defs>

                {annotatedSeries.length > 1 ? (
                  <>
                    <polygon
                      points={`0,${chartH} ${areaPoints} ${chartW},${chartH}`}
                      fill="url(#volumeFill)"
                    />
                    <polyline
                      points={areaPoints}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.7)"
                      strokeWidth="2"
                    />
                    {rollingPoints && (
                      <polyline
                        points={rollingPoints}
                        fill="none"
                        stroke="rgba(255,255,255,0.30)"
                        strokeWidth="1.2"
                        strokeDasharray="4 3"
                      />
                    )}
                  </>
                ) : (
                  <circle cx={200} cy={50} r="4" fill="rgba(255, 255, 255, 0.7)" />
                )}

                {annotatedSeries.map((point, i) => {
                  const x = toX(i)
                  const y = toY(point.volume)
                  const isAnnotated = point.annotation !== null
                  const isMissed = point.annotation?.kind === "missed_week"
                  const isPeak = point.annotation?.kind === "peak"
                  const isDip = point.annotation?.kind === "dip"
                  const isSelected = selectedPoint === point

                  return (
                    <g key={i}>
                      {isAnnotated && !isMissed && (
                        <circle cx={x} cy={y} r={8} fill="rgba(255,255,255,0.06)" />
                      )}
                      {!isMissed && (
                        <circle
                          cx={x}
                          cy={y}
                          r={isAnnotated || isSelected ? 4 : 3}
                          fill={isSelected ? "rgba(255,255,255,0.95)" : isAnnotated ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)"}
                        />
                      )}
                      {isPeak && (
                        <text x={x} y={y - 9} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.55)">▲</text>
                      )}
                      {isDip && (
                        <text x={x} y={y + 16} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)">▼</text>
                      )}
                      {isMissed && (
                        <line
                          x1={x} y1={5} x2={x} y2={chartH - 5}
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                      )}
                      <circle
                        cx={x}
                        cy={isMissed ? chartH / 2 : y}
                        r={12}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelectedPoint(selectedPoint === point ? null : point)}
                      />
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Chart legend */}
            <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "16px", height: "1.5px", background: "rgba(255,255,255,0.6)" }} />
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.30)", fontFamily: "'Archivo Narrow', sans-serif" }}>Volume</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "16px", height: "1px", borderTop: "1px dashed rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.30)", fontFamily: "'Archivo Narrow', sans-serif" }}>Rolling avg</span>
              </div>
            </div>
          </div>
        )}

        {/* Drill-down panel */}
        {selectedPoint && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "14px",
              padding: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.40)", marginBottom: "2px" }}>
                  {formatPeriodLabel(selectedPoint.date, aggregation)}
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600, color: "rgba(255,255,255,0.90)", letterSpacing: "-0.02em" }}>
                  {Math.round(selectedPoint.volume).toLocaleString()} lbs
                </div>
                {selectedPoint.rollingAvg !== null && selectedPoint.volume > 0 && (
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                    vs {Math.round(selectedPoint.rollingAvg).toLocaleString()} lbs rolling avg
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedPoint(null)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: "16px", padding: "0 0 0 8px" }}
              >
                ✕
              </button>
            </div>

            {selectedPoint.annotation && (
              <div
                style={{
                  display: "inline-block",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: selectedPoint.annotation.kind === "peak" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                  fontSize: "10px",
                  color: selectedPoint.annotation.kind === "peak" ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.40)",
                  marginBottom: "10px",
                  fontFamily: "'Archivo Narrow', sans-serif",
                  letterSpacing: "0.05em",
                }}
              >
                {selectedPoint.annotation.kind === "peak" ? "▲ " : selectedPoint.annotation.kind === "dip" ? "▼ " : ""}
                {selectedPoint.annotation.label.toUpperCase()}
              </div>
            )}

            {selectedPoint.annotation?.kind === "missed_week" && (
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
                No workouts with this exercise recorded this week.
              </div>
            )}

            {/* Set breakdown for session aggregation */}
            {aggregation === "session" && selectedPoint.workoutId && (() => {
              const workout = historyForDrilldown.find((w) => w.id === selectedPoint.workoutId)
              const exercise = workout?.exercises.find((e) => e.name === exerciseName)
              if (!exercise) return null
              return (
                <div>
                  <div
                    style={{
                      fontSize: "8px",
                      fontWeight: 500,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.25)",
                      fontFamily: "'Archivo Narrow', sans-serif",
                      marginBottom: "6px",
                    }}
                  >
                    SETS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    {exercise.sets.filter((s) => s.completed).map((set, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>Set {idx + 1}</span>
                        <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.80)" }}>
                          {set.weight} lbs × {set.reps} reps
                        </span>
                      </div>
                    ))}
                  </div>
                  {workout && (
                    <div style={{ marginTop: "8px", fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
                      {workout.name}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Workout list for week/month aggregation */}
            {aggregation !== "session" && (selectedPoint.workoutIds ?? []).length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "8px",
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    color: "rgba(255,255,255,0.25)",
                    fontFamily: "'Archivo Narrow', sans-serif",
                    marginBottom: "6px",
                  }}
                >
                  WORKOUTS IN PERIOD
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {(selectedPoint.workoutIds ?? []).map((wid) => {
                    const workout = rawHistory.find((w) => w.id === wid)
                    if (!workout) return null
                    const exercise = workout.exercises.find((e) => e.name === exerciseName)
                    const vol = exercise
                      ? exercise.sets
                          .filter((s) => isSetEligibleForStats(s))
                          .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
                      : 0
                    const d = new Date(workout.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    return (
                      <div key={wid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.50)" }}>{d}</span>
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.30)", marginLeft: "6px" }}>{workout.name}</span>
                        </div>
                        {vol > 0 && (
                          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.60)", fontWeight: 500 }}>
                            {Math.round(vol).toLocaleString()} lbs
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {selectedPoint.sessionCount !== undefined && (
                  <div style={{ marginTop: "8px", fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
                    {selectedPoint.sessionCount} session{selectedPoint.sessionCount !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Workout history list */}
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
                  <div className="flex items-center gap-2">
                    <div className="text-white/90" style={{ fontSize: "13px", fontWeight: 500 }}>
                      {formattedDate}
                    </div>
                    {exercise.rating && (
                      <span
                        style={{
                          fontSize: "8px",
                          fontWeight: 500,
                          letterSpacing: "0.08em",
                          padding: "2px 6px",
                          borderRadius: "6px",
                          background: exercise.rating === "thumbs_up" ? "rgba(52, 211, 153, 0.1)" : "rgba(251, 191, 36, 0.1)",
                          color: exercise.rating === "thumbs_up" ? "rgba(52, 211, 153, 0.7)" : "rgba(251, 191, 36, 0.7)",
                          fontFamily: "'Archivo Narrow', sans-serif",
                        }}
                      >
                        {exercise.rating === "thumbs_up" ? "GOOD" : "ROUGH"}
                      </span>
                    )}
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
