"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getWorkoutHistory } from "@/lib/workout-storage"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { filterByTimeRange, filterByWorkoutType, getVolumeSeriesGlobal } from "@/lib/volume-analytics"
import type { TimeRange, Aggregation, WorkoutTypeFilter, AnnotatedPoint } from "@/lib/volume-analytics"
import { VolumeControls } from "@/components/volume-controls"

type VolumePoint = { date: string; volume: number }

function formatPeriodLabel(date: string, aggregation: Aggregation): string {
  const d = new Date(date)
  if (aggregation === "month") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }
  if (aggregation === "week") {
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function VolumeHistoryPage() {
  const router = useRouter()
  const history = getWorkoutHistory()

  const [timeRange, setTimeRange] = useState<TimeRange>("8W")
  const [aggregation, setAggregation] = useState<Aggregation>("week")
  const [typeFilter, setTypeFilter] = useState<WorkoutTypeFilter>("All")
  const [selectedPoint, setSelectedPoint] = useState<AnnotatedPoint | null>(null)

  const globalSeries = useMemo(
    () => getVolumeSeriesGlobal(history, timeRange, aggregation, typeFilter),
    [history, timeRange, aggregation, typeFilter]
  )

  const exercises = useMemo(() => {
    const filtered = filterByWorkoutType(filterByTimeRange(history, timeRange), typeFilter)
    const map = new Map<string, VolumePoint[]>()

    filtered.forEach((workout) => {
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
        return { name, timeline: sorted, lastVolume: last?.volume ?? 0, trendPct }
      })
      .sort((a, b) => b.lastVolume - a.lastVolume)
  }, [history, timeRange, typeFilter])

  // Build global chart SVG coords
  const chartW = 400
  const chartH = 80
  const maxVol = Math.max(...globalSeries.map((p) => p.volume), 1)
  const minVol = Math.min(...globalSeries.filter((p) => p.volume > 0).map((p) => p.volume), 0)
  const volRange = maxVol - minVol || 1

  function toX(i: number) {
    return (i / Math.max(globalSeries.length - 1, 1)) * chartW
  }
  function toY(v: number) {
    return chartH - ((v - minVol) / volRange) * (chartH - 10) - 5
  }

  const areaPoints = globalSeries.map((p, i) => `${toX(i)},${toY(p.volume)}`).join(" ")
  const rollingPoints = globalSeries
    .map((p, i) => (p.rollingAvg !== null ? `${toX(i)},${toY(p.rollingAvg)}` : null))
    .filter(Boolean)
    .join(" ")

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
              <h1 className="text-white/95" style={{ fontSize: "20px", fontWeight: 500, letterSpacing: "-0.02em" }}>
                Volume by Exercise
              </h1>
              <p className="text-white/35" style={{ fontSize: "11px" }}>
                {exercises.length} exercises tracked
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* Controls */}
        <VolumeControls
          timeRange={timeRange}
          aggregation={aggregation}
          typeFilter={typeFilter}
          onTimeRangeChange={setTimeRange}
          onAggregationChange={setAggregation}
          onTypeFilterChange={setTypeFilter}
        />

        {/* Global volume chart */}
        {globalSeries.length > 0 && (
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
                marginBottom: "8px",
              }}
            >
              TOTAL VOLUME OVER TIME
            </div>

            <div style={{ position: "relative" }}>
              <svg
                width="100%"
                viewBox={`0 0 ${chartW} ${chartH}`}
                preserveAspectRatio="none"
                style={{ display: "block", height: "80px" }}
              >
                <defs>
                  <linearGradient id="globalVolFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
                  </linearGradient>
                </defs>

                {globalSeries.length > 1 && (
                  <>
                    <polygon
                      points={`0,${chartH} ${areaPoints} ${chartW},${chartH}`}
                      fill="url(#globalVolFill)"
                    />
                    <polyline
                      points={areaPoints}
                      fill="none"
                      stroke="rgba(255,255,255,0.65)"
                      strokeWidth="1.5"
                    />
                    {rollingPoints && (
                      <polyline
                        points={rollingPoints}
                        fill="none"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth="1.2"
                        strokeDasharray="4 3"
                      />
                    )}
                  </>
                )}

                {globalSeries.map((point, i) => {
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
                        <circle cx={x} cy={y} r={7} fill="rgba(255,255,255,0.06)" />
                      )}
                      {!isMissed && (
                        <circle
                          cx={x}
                          cy={y}
                          r={isAnnotated || isSelected ? 4 : 3}
                          fill={isSelected ? "rgba(255,255,255,0.95)" : isAnnotated ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)"}
                        />
                      )}
                      {isPeak && (
                        <text
                          x={x}
                          y={y - 8}
                          textAnchor="middle"
                          fontSize="8"
                          fill="rgba(255,255,255,0.6)"
                        >
                          ▲
                        </text>
                      )}
                      {isDip && (
                        <text
                          x={x}
                          y={y + 14}
                          textAnchor="middle"
                          fontSize="8"
                          fill="rgba(255,255,255,0.4)"
                        >
                          ▼
                        </text>
                      )}
                      {isMissed && (
                        <line
                          x1={x}
                          y1={5}
                          x2={x}
                          y2={chartH - 5}
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                      )}
                      {/* Hit target */}
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

            {/* Legend */}
            <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "16px", height: "1.5px", background: "rgba(255,255,255,0.6)" }} />
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.30)", fontFamily: "'Archivo Narrow', sans-serif" }}>
                  Volume
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "16px", height: "1px", background: "rgba(255,255,255,0.25)", borderTop: "1px dashed rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.30)", fontFamily: "'Archivo Narrow', sans-serif" }}>
                  Rolling avg
                </span>
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
                {selectedPoint.rollingAvg !== null && (
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
                  background: selectedPoint.annotation.kind === "peak"
                    ? "rgba(255,255,255,0.08)"
                    : selectedPoint.annotation.kind === "dip"
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.04)",
                  fontSize: "10px",
                  color: selectedPoint.annotation.kind === "peak"
                    ? "rgba(255,255,255,0.70)"
                    : "rgba(255,255,255,0.40)",
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
                No workouts recorded this week.
              </div>
            )}

            {(selectedPoint.workoutIds ?? []).length > 0 && (
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
                  {aggregation === "session" ? "WORKOUT" : "WORKOUTS IN PERIOD"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {(selectedPoint.workoutIds ?? []).map((wid) => {
                    const workout = history.find((w) => w.id === wid)
                    if (!workout) return null
                    const d = new Date(workout.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    return (
                      <div key={wid} style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)" }}>
                        {d} · {workout.name}
                      </div>
                    )
                  })}
                  {selectedPoint.workoutId && !selectedPoint.workoutIds && (() => {
                    const workout = history.find((w) => w.id === selectedPoint.workoutId)
                    if (!workout) return null
                    return (
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)" }}>
                        {workout.name}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {selectedPoint.sessionCount !== undefined && (
              <div style={{ marginTop: "8px", fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
                {selectedPoint.sessionCount} session{selectedPoint.sessionCount !== 1 ? "s" : ""} in period
              </div>
            )}
          </div>
        )}

        {/* Exercise list */}
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
