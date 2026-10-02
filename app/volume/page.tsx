"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { plural } from "@/lib/utils"
import { ChevronRight } from "lucide-react"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosGroup, IosSectionHeader } from "@/components/ios/grouped"
import { isSetEligibleForStats } from "@/lib/set-validation"
import { filterByTimeRange, filterByWorkoutType, getVolumeSeriesGlobal } from "@/lib/volume-analytics"
import type { TimeRange, Aggregation, WorkoutTypeFilter, AnnotatedPoint } from "@/lib/volume-analytics"
import { VolumeControls } from "@/components/volume-controls"
import { formatWorkoutDate, parseWorkoutDate } from "@/lib/workout-date"

import { buildSmoothPath } from "@/lib/smooth-path"

// Line path with gaps at zero-volume points
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

// Area fill path with gaps at zero-volume points (separate closed island per segment)
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

// Smooth path for mini sparklines (no gaps needed)
function buildSparklinePath(series: { volume: number }[], w: number, h: number): string {
  if (series.length === 0) return ""
  const max = Math.max(...series.map((p) => p.volume), 0)
  const min = Math.min(...series.map((p) => p.volume), 0)
  const range = max - min || 1
  const pts: [number, number][] = series.map((p, idx) => [
    (idx / Math.max(series.length - 1, 1)) * w,
    h - ((p.volume - min) / range) * (h * 0.75) - h * 0.125,
  ])
  return buildSmoothPath(pts)
}

function formatMaxVol(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k lbs`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k lbs`
  return `${Math.round(v)} ${plural(Math.round(v), "lb", "lbs")}`
}

type VolumePoint = { date: string; volume: number }

function formatPeriodLabel(date: string, aggregation: Aggregation): string {
  const d = parseWorkoutDate(date)
  if (!d) return "Undated"
  if (aggregation === "month") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }
  if (aggregation === "week") {
    return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function VolumeHistoryPage() {
  const router = useRouter()
  // Storage is client-only: read it after mount so server and client render
  // the same empty first frame instead of mismatching on the counts.
  const [history, setHistory] = useState<CompletedWorkout[]>([])
  useEffect(() => {
    setHistory(getWorkoutHistory())
  }, [])

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
  const chartH = 110
  const maxVol = Math.max(...globalSeries.map((p) => p.volume), 1)
  const minVol = 0
  const volRange = maxVol - minVol || 1

  function toX(i: number) {
    return (i / Math.max(globalSeries.length - 1, 1)) * chartW
  }
  function toY(v: number) {
    return chartH - ((v - minVol) / volRange) * (chartH - 14) - 7
  }

  const linePath = buildSegmentedLinePath(globalSeries, toX, toY)
  const areaPath = buildSegmentedAreaPath(globalSeries, toX, toY, chartH)
  const rollingPath = buildSmoothPath(
    globalSeries
      .map((p, i) => (p.rollingAvg !== null ? [toX(i), toY(p.rollingAvg)] as [number, number] : null))
      .filter((p): p is [number, number] => p !== null)
  )

  return (
    <div className="min-h-screen pb-20" style={{ background: "var(--background)" }}>
      <IosNavPage
        backLabel="Home"
        onBack={() => router.back()}
        title="Volume by Exercise"
        longTitle
        subtitle={`${exercises.length} ${plural(exercises.length, "exercise", "exercises")} tracked`}
      >
      <div className="max-w-2xl mx-auto px-4 space-y-3">
        {/* Controls: one segmented control for the range, pull-down chips for
            the two dimensions that used to be their own stacked rows. */}
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
              background: "var(--ink-02)",
              border: "1px solid var(--ink-08)",
              borderRadius: "var(--radius-2xl)",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "8px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                fontFamily: "var(--font-label)",
                color: "var(--ink-25)",
                marginBottom: "8px",
              }}
            >
              TOTAL VOLUME OVER TIME
            </div>

            <div style={{ position: "relative" }}>
              {globalSeries.length > 0 && (
                <div style={{
                  position: "absolute", top: 0, left: 0, zIndex: 1,
                  fontSize: "8px", color: "var(--ink-20)",
                  fontFamily: "var(--font-label)",
                  lineHeight: 1, pointerEvents: "none",
                }}>
                  {formatMaxVol(maxVol)}
                </div>
              )}
              <svg
                width="100%"
                viewBox={`0 0 ${chartW} ${chartH}`}
                preserveAspectRatio="none"
                style={{ display: "block", height: "110px" }}
              >
                <defs>
                  <linearGradient id="globalVolFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
                  </linearGradient>
                </defs>

                {globalSeries.length > 1 && (
                  <>
                    <path d={areaPath} fill="url(#globalVolFill)" />
                    <path
                      d={linePath}
                      fill="none"
                      stroke="rgba(255,255,255,0.65)"
                      strokeWidth="1.5"
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
                <span style={{ fontSize: "9px", color: "var(--ink-30)", fontFamily: "var(--font-label)" }}>
                  Volume
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ width: "16px", height: "1px", background: "var(--ink-25)", borderTop: "1px dashed var(--ink-25)" }} />
                <span style={{ fontSize: "9px", color: "var(--ink-30)", fontFamily: "var(--font-label)" }}>
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
              background: "var(--ink-04)",
              border: "1px solid var(--ink-12)",
              borderRadius: "var(--radius-ios)",
              padding: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--ink-40)", marginBottom: "2px" }}>
                  {formatPeriodLabel(selectedPoint.date, aggregation)}
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--ink-90)", letterSpacing: "-0.02em" }}>
                  {Math.round(selectedPoint.volume).toLocaleString()} {plural(Math.round(selectedPoint.volume), "lb", "lbs")}
                </div>
                {selectedPoint.rollingAvg !== null && (
                  <div style={{ fontSize: "10px", color: "var(--ink-35)", marginTop: "2px" }}>
                    vs {Math.round(selectedPoint.rollingAvg).toLocaleString()} {plural(Math.round(selectedPoint.rollingAvg), "lb", "lbs")} rolling avg
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedPoint(null)}
                style={{ background: "none", border: "none", color: "var(--ink-35)", cursor: "pointer", fontSize: "16px", padding: "0 0 0 8px" }}
              >
                ✕
              </button>
            </div>

            {selectedPoint.annotation && (
              <div
                style={{
                  display: "inline-block",
                  padding: "3px 8px",
                  borderRadius: "var(--radius-xs)",
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
                  fontFamily: "var(--font-label)",
                  letterSpacing: "0.05em",
                }}
              >
                {selectedPoint.annotation.kind === "peak" ? "▲ " : selectedPoint.annotation.kind === "dip" ? "▼ " : ""}
                {selectedPoint.annotation.label.toUpperCase()}
              </div>
            )}

            {selectedPoint.annotation?.kind === "missed_week" && (
              <div style={{ fontSize: "11px", color: "var(--ink-35)" }}>
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
                    color: "var(--ink-25)",
                    fontFamily: "var(--font-label)",
                    marginBottom: "6px",
                  }}
                >
                  {aggregation === "session" ? "WORKOUT" : "WORKOUTS IN PERIOD"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {(selectedPoint.workoutIds ?? []).map((wid) => {
                    const workout = history.find((w) => w.id === wid)
                    if (!workout) return null
                    const d = formatWorkoutDate(workout.date, { month: "short", day: "numeric" })
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
              <div style={{ marginTop: "8px", fontSize: "10px", color: "var(--ink-25)" }}>
                {selectedPoint.sessionCount} session{selectedPoint.sessionCount !== 1 ? "s" : ""} in period
              </div>
            )}
          </div>
        )}

      </div>

      {/* Exercise list — a grouped list rather than a stack of bordered cards,
          so the names line up and the sparklines read as one column. */}
      {exercises.length > 0 && (
        <>
          <IosSectionHeader>Exercises</IosSectionHeader>
          <IosGroup>
            {exercises.map((exercise) => {
              const series = exercise.timeline.slice(-7)
              const sparkPath = buildSparklinePath(series, 90, 20)
              // Green is reserved for a beaten value, so a positive trend is the
              // only case that earns it; everything else stays ink.
              const beaten = typeof exercise.trendPct === "number" && exercise.trendPct > 0

              return (
                <button
                  key={exercise.name}
                  type="button"
                  className="ios-row"
                  style={{ minHeight: "64px" }}
                  onClick={() => router.push(`/exercise/${encodeURIComponent(exercise.name)}`)}
                >
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "16px" }}>{exercise.name}</span>
                    <span style={{ display: "block", fontSize: "13px", color: "var(--ink-40)", marginTop: "2px" }}>
                      {Math.round(exercise.lastVolume).toLocaleString()}{" "}
                      {plural(Math.round(exercise.lastVolume), "lb", "lbs")}
                    </span>
                  </span>
                  {typeof exercise.trendPct === "number" && (
                    <span
                      style={{
                        fontSize: "13px",
                        color: beaten ? "var(--good)" : "var(--ink-40)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {exercise.trendPct >= 0 ? "+" : ""}
                      {exercise.trendPct}%
                    </span>
                  )}
                  <svg width="90" height="20" viewBox="0 0 90 20" style={{ flexShrink: 0 }}>
                    <path
                      d={sparkPath}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.6)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <ChevronRight size={18} strokeWidth={2} className="ios-row__chevron" />
                </button>
              )
            })}
          </IosGroup>
        </>
      )}

      {exercises.length === 0 && (
        <div className="text-center py-12">
          <p className="text-ink-40">No volume data yet</p>
        </div>
      )}
      </IosNavPage>
    </div>
  )
}
