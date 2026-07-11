"use client"

import { useState, useMemo, useEffect } from "react"

// Catmull-Rom → cubic bezier smooth path
function buildSmoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return ""
  if (pts.length === 1) return `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const pm1 = pts[Math.max(i - 2, 0)]
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const p2 = pts[Math.min(i + 1, pts.length - 1)]
    const cp1x = p0[0] + (p1[0] - pm1[0]) / 6
    const cp1y = p0[1] + (p1[1] - pm1[1]) / 6
    const cp2x = p1[0] - (p2[0] - p0[0]) / 6
    const cp2y = p1[1] - (p2[1] - p0[1]) / 6
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`
  }
  return d
}

function buildSegmentedLinePath(
  series: { volume: number }[],
  toX: (i: number) => number,
  toY: (v: number) => number
): string {
  const segments: [number, number][][] = []
  let cur: [number, number][] = []
  series.forEach((p, i) => {
    if (p.volume > 0) {
      cur.push([toX(i), toY(p.volume)])
    } else {
      if (cur.length > 0) { segments.push(cur); cur = [] }
    }
  })
  if (cur.length > 0) segments.push(cur)
  return segments.map(buildSmoothPath).join(" ")
}

function buildSegmentedAreaPath(
  series: { volume: number }[],
  toX: (i: number) => number,
  toY: (v: number) => number,
  chartH: number
): string {
  const segments: { pts: [number, number][]; firstX: number; lastX: number }[] = []
  let cur: [number, number][] = []
  series.forEach((p, i) => {
    if (p.volume > 0) {
      cur.push([toX(i), toY(p.volume)])
    } else {
      if (cur.length > 0) {
        segments.push({ pts: cur, firstX: cur[0][0], lastX: cur[cur.length - 1][0] })
        cur = []
      }
    }
  })
  if (cur.length > 0) segments.push({ pts: cur, firstX: cur[0][0], lastX: cur[cur.length - 1][0] })
  return segments
    .map(({ pts, firstX, lastX }) =>
      `${buildSmoothPath(pts)} L ${lastX.toFixed(1)},${chartH} L ${firstX.toFixed(1)},${chartH} Z`
    )
    .join(" ")
}

function formatMaxVol(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k lbs`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k lbs`
  return `${Math.round(v)} ${plural(Math.round(v), "lb", "lbs")}`
}

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { plural } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { getExerciseHistory, getExerciseIdForName, normalizeExerciseName } from "@/lib/workout-storage"
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
  if (aggregation === "month") {
    const [year, month] = date.split("-").map(Number)
    return new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }
  const [year, month, day] = date.split("-").map(Number)
  const d = new Date(year, month - 1, day)
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
  const [rawHistory, setRawHistory] = useState(() => getExerciseHistory(exerciseName))

  useEffect(() => {
    const exerciseId = getExerciseIdForName(exerciseName)
    if (!exerciseId) return

    import("@/lib/supabase-sync")
      .then(({ pullWorkoutsForExerciseId }) =>
        pullWorkoutsForExerciseId(exerciseId).then(() => {
          setRawHistory(getExerciseHistory(exerciseName))
        })
      )
      .catch(() => {
        // Sync unavailable — local data is sufficient
      })
  }, [exerciseName])

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

    const exercise = workout.exercises.find((e) => normalizeExerciseName(e.name) === normalizeExerciseName(exerciseName))
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

  const ratingTrend = useMemo(() => {
    const sessions = history
      .map((workout) => {
        const exercise = workout.exercises.find(
          (e) => normalizeExerciseName(e.name) === normalizeExerciseName(exerciseName)
        )
        const topWeight = exercise
          ? exercise.sets
              .filter((s) => isSetEligibleForStats(s))
              .reduce((max, s) => Math.max(max, s.weight ?? 0), 0)
          : 0
        return { date: workout.date, rating: exercise?.rating ?? null, topWeight }
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const rated = sessions.filter((s) => s.rating === "thumbs_up" || s.rating === "thumbs_down")
    const good = rated.filter((s) => s.rating === "thumbs_up").length
    const rough = rated.length - good
    const pctGood = rated.length > 0 ? Math.round((good / rated.length) * 100) : 0

    let direction: "better" | "rougher" | "steady" | null = null
    let recentPct = 0
    let olderPct = 0
    if (rated.length >= 4) {
      const recentCount = Math.min(5, Math.floor(rated.length / 2))
      const recent = rated.slice(-recentCount)
      const older = rated.slice(0, rated.length - recentCount)
      if (older.length > 0) {
        const pct = (group: typeof rated) =>
          Math.round((group.filter((s) => s.rating === "thumbs_up").length / group.length) * 100)
        recentPct = pct(recent)
        olderPct = pct(older)
        const delta = recentPct - olderPct
        direction = delta >= 15 ? "better" : delta <= -15 ? "rougher" : "steady"
      }
    }

    const avg = (values: number[]) =>
      values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0
    const goodWeights = rated.filter((s) => s.rating === "thumbs_up" && s.topWeight > 0).map((s) => s.topWeight)
    const roughWeights = rated.filter((s) => s.rating === "thumbs_down" && s.topWeight > 0).map((s) => s.topWeight)
    const goodAvgWeight = Math.round(avg(goodWeights))
    const roughAvgWeight = Math.round(avg(roughWeights))
    const weightInsight =
      goodWeights.length >= 2 && roughWeights.length >= 2 && Math.abs(roughAvgWeight - goodAvgWeight) >= 5
        ? { roughHeavier: roughAvgWeight > goodAvgWeight, goodAvgWeight, roughAvgWeight }
        : null

    return { sessions, ratedCount: rated.length, good, rough, pctGood, direction, recentPct, olderPct, weightInsight }
  }, [history, exerciseName])

  const chartW = 400
  const chartH = 100
  const maxVolume = Math.max(...annotatedSeries.map((p) => p.volume), 0)

  function toX(i: number) {
    return (i / Math.max(annotatedSeries.length - 1, 1)) * chartW
  }
  function toY(v: number) {
    return chartH - (v / (maxVolume || 1)) * 80 - 10
  }

  const linePath = buildSegmentedLinePath(annotatedSeries, toX, toY)
  const areaPath = buildSegmentedAreaPath(annotatedSeries, toX, toY, chartH)
  const rollingPath = buildSmoothPath(
    annotatedSeries
      .map((p, i) => (p.rollingAvg !== null ? [toX(i), toY(p.rollingAvg)] as [number, number] : null))
      .filter((p): p is [number, number] => p !== null)
  )

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
                className="text-ink-25 tracking-widest"
                style={{ fontSize: "8px", fontWeight: 500, letterSpacing: "0.18em", fontFamily: "var(--font-label)" }}
              >
                EXERCISE HISTORY
              </div>
              <h1 className="text-ink-95" style={{ fontSize: "20px", fontWeight: 500, letterSpacing: "-0.02em" }}>
                {exerciseName}
              </h1>
              <p className="text-ink-35" style={{ fontSize: "11px" }}>
                {history.length} {plural(history.length, "workout", "workouts")} logged
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
              borderRadius: "var(--radius-2xl)",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "7px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                fontFamily: "var(--font-label)",
                color: "rgba(255,255,255,0.25)",
                marginBottom: "6px",
              }}
            >
              WORKOUT VOLUME
            </div>
            <div className="text-ink-70" style={{ fontSize: "12px", marginBottom: "10px" }}>
              Total volume per {aggregation === "session" ? "workout" : aggregation}
            </div>

            <div className="relative h-32">
              {annotatedSeries.length > 0 && (
                <div style={{
                  position: "absolute", top: 0, left: 0, zIndex: 1,
                  fontSize: "8px", color: "rgba(255,255,255,0.20)",
                  fontFamily: "var(--font-label)",
                  lineHeight: 1, pointerEvents: "none",
                }}>
                  {formatMaxVol(maxVolume)}
                </div>
              )}
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
                    <path d={areaPath} fill="url(#volumeFill)" />
                    <path
                      d={linePath}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.7)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {rollingPath && (
                      <path
                        d={rollingPath}
                        fill="none"
                        stroke="rgba(255,255,255,0.45)"
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
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.30)", fontFamily: "var(--font-label)" }}>Volume</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "16px", height: "1px", borderTop: "1px dashed rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.30)", fontFamily: "var(--font-label)" }}>Rolling avg</span>
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
                  {Math.round(selectedPoint.volume).toLocaleString()} {plural(Math.round(selectedPoint.volume), "lb", "lbs")}
                </div>
                {selectedPoint.rollingAvg !== null && selectedPoint.volume > 0 && (
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
                    vs {Math.round(selectedPoint.rollingAvg).toLocaleString()} {plural(Math.round(selectedPoint.rollingAvg), "lb", "lbs")} rolling avg
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
                  fontFamily: "var(--font-label)",
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
              const exercise = workout?.exercises.find((e) => normalizeExerciseName(e.name) === normalizeExerciseName(exerciseName))
              if (!exercise) return null
              return (
                <div>
                  <div
                    style={{
                      fontSize: "8px",
                      fontWeight: 500,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.25)",
                      fontFamily: "var(--font-label)",
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
                          {set.weight} {plural(set.weight, "lb", "lbs")} × {set.reps} {plural(set.reps, "rep", "reps")}
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
                    fontFamily: "var(--font-label)",
                    marginBottom: "6px",
                  }}
                >
                  WORKOUTS IN PERIOD
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {(selectedPoint.workoutIds ?? []).map((wid) => {
                    const workout = rawHistory.find((w) => w.id === wid)
                    if (!workout) return null
                    const exercise = workout.exercises.find((e) => normalizeExerciseName(e.name) === normalizeExerciseName(exerciseName))
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
                            {Math.round(vol).toLocaleString()} {plural(Math.round(vol), "lb", "lbs")}
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

        {/* Felt ratings trend */}
        {ratingTrend.ratedCount > 0 && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--radius-2xl)",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "7px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                fontFamily: "var(--font-label)",
                color: "rgba(255,255,255,0.25)",
                marginBottom: "10px",
              }}
            >
              FELT RATINGS
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "12px" }}>
              <div>
                <span style={{ fontSize: "22px", fontWeight: 600, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
                  {ratingTrend.pctGood}%
                </span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginLeft: "6px" }}>felt good</span>
              </div>
              <div style={{ display: "flex", gap: "10px", fontSize: "11px" }}>
                <span style={{ color: "rgba(52, 211, 153, 0.75)" }}>{ratingTrend.good} good</span>
                <span style={{ color: "rgba(251, 191, 36, 0.75)" }}>{ratingTrend.rough} rough</span>
              </div>
            </div>

            {/* Chronological timeline */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginBottom: ratingTrend.direction || ratingTrend.weightInsight ? "12px" : 0 }}>
              {ratingTrend.sessions.slice(-40).map((s, i) => (
                <div
                  key={i}
                  title={`${new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${
                    s.rating === "thumbs_up" ? "Good" : s.rating === "thumbs_down" ? "Rough" : "Unrated"
                  }`}
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "2px",
                    background:
                      s.rating === "thumbs_up"
                        ? "rgba(52, 211, 153, 0.7)"
                        : s.rating === "thumbs_down"
                        ? "rgba(251, 191, 36, 0.7)"
                        : "rgba(255, 255, 255, 0.08)",
                  }}
                />
              ))}
            </div>

            {ratingTrend.direction && (
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                {ratingTrend.direction === "better" && (
                  <span style={{ color: "rgba(52, 211, 153, 0.8)" }}>Trending better</span>
                )}
                {ratingTrend.direction === "rougher" && (
                  <span style={{ color: "rgba(251, 191, 36, 0.8)" }}>Trending rougher</span>
                )}
                {ratingTrend.direction === "steady" && <span>Holding steady</span>}
                {ratingTrend.direction === "steady"
                  ? ` — around ${ratingTrend.recentPct}% good lately`
                  : ` — ${ratingTrend.recentPct}% good recently vs ${ratingTrend.olderPct}% earlier`}
              </div>
            )}

            {ratingTrend.weightInsight && (
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginTop: "4px" }}>
                {ratingTrend.weightInsight.roughHeavier
                  ? `Rough sessions averaged ${ratingTrend.weightInsight.roughAvgWeight} ${plural(ratingTrend.weightInsight.roughAvgWeight, "lb", "lbs")} vs ${ratingTrend.weightInsight.goodAvgWeight} ${plural(ratingTrend.weightInsight.goodAvgWeight, "lb", "lbs")} when it felt good`
                  : `Good sessions averaged ${ratingTrend.weightInsight.goodAvgWeight} ${plural(ratingTrend.weightInsight.goodAvgWeight, "lb", "lbs")} vs ${ratingTrend.weightInsight.roughAvgWeight} ${plural(ratingTrend.weightInsight.roughAvgWeight, "lb", "lbs")} when it felt rough`}
              </div>
            )}
          </div>
        )}

        {/* Workout history list */}
        {history.map((workout) => {
          const exercise = workout.exercises.find((e) => normalizeExerciseName(e.name) === normalizeExerciseName(exerciseName))!
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
                borderRadius: "var(--radius-2xl)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-ink-90" style={{ fontSize: "13px", fontWeight: 500 }}>
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
                          fontFamily: "var(--font-label)",
                        }}
                      >
                        {exercise.rating === "thumbs_up" ? "GOOD" : "ROUGH"}
                      </span>
                    )}
                  </div>
                  <div className="text-ink-35" style={{ fontSize: "10px" }}>
                    {workout.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-ink-70" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
                    VOLUME
                  </div>
                  <div className="text-ink-90" style={{ fontSize: "12px", fontWeight: 600 }}>
                    {Math.round(volume).toLocaleString()} {plural(Math.round(volume), "lb", "lbs")}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {exercise.sets
                  .filter((s) => s.completed)
                  .map((set, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-ink-35" style={{ fontSize: "11px" }}>
                        Set {idx + 1}
                      </span>
                      <span className="text-ink-85" style={{ fontSize: "12px", fontWeight: 500 }}>
                        {set.weight} {plural(set.weight, "lb", "lbs")} × {set.reps} {plural(set.reps, "rep", "reps")}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )
        })}

        {history.length === 0 && (
          <div className="text-center py-12">
            <p className="text-ink-40">No history for this exercise yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
