"use client"

import { plural } from "@/lib/utils"
import { IosCard } from "@/components/ios/grouped"
import { BandHeader } from "@/components/ledger/band-header"
import { DeltaChip } from "@/components/ledger/delta-chip"
import { Sparkline } from "@/components/ledger/sparkline"
import { StatUnit } from "@/components/ledger/stat-unit"

type ChartDataPoint = {
  date: string
  maxWeight: number
  totalVolume: number
}

type ExerciseProgressChartProps = {
  exerciseName: string
  data: ChartDataPoint[]
  onOpen?: () => void
}

const formatK = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`)

// Up is earned (emerald); flat or down stays in the ink ladder — the record
// doesn't judge a lighter day.
function Change({ delta, unit }: { delta: number; unit: string }) {
  if (delta === 0) return <DeltaChip tone="neutral" size="sm" value="MATCHED" context="VS LAST" />
  return (
    <DeltaChip
      tone={delta > 0 ? "good" : "neutral"}
      arrow={delta > 0 ? "up" : "down"}
      size="sm"
      value={`${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()} ${unit}`}
      context="VS LAST"
    />
  )
}

export default function ExerciseProgressChart({ exerciseName, data, onOpen }: ExerciseProgressChartProps) {
  const title = (
    <div style={{ fontSize: "17px", fontWeight: 600, color: "#fff" }}>{exerciseName}</div>
  )

  if (!data || data.length === 0) {
    return (
      <IosCard>
        {title}
        <div style={{ fontSize: "13px", color: "var(--ink-50)", marginTop: "6px" }}>
          No data yet — complete a workout to see progress.
        </div>
      </IosCard>
    )
  }

  const latest = data[data.length - 1]
  const previous = data.length > 1 ? data[data.length - 2] : latest

  return (
    <IosCard>
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="w-full text-left"
        style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: onOpen ? "pointer" : "default" }}
      >
        {title}
        <div style={{ fontSize: "13px", color: "var(--ink-50)", marginTop: "2px", marginBottom: "16px" }}>
          {data.length} {plural(data.length, "workout", "workouts")} tracked
        </div>
      </button>

      <BandHeader label="TOP WEIGHT">
        {data.length > 1 ? <Change delta={latest.maxWeight - previous.maxWeight} unit="LB" /> : null}
      </BandHeader>
      <div className="flex items-end justify-between" style={{ gap: "16px", marginBottom: "20px" }}>
        <StatUnit value={`${latest.maxWeight}`} unit="LB" label="LATEST" />
        <div style={{ flex: "1 1 auto", maxWidth: "60%" }}>
          <Sparkline data={data.map((d) => d.maxWeight)} height={44} />
        </div>
      </div>

      <BandHeader label="VOLUME">
        {data.length > 1 ? <Change delta={latest.totalVolume - previous.totalVolume} unit="LB" /> : null}
      </BandHeader>
      <div className="flex items-end justify-between" style={{ gap: "16px" }}>
        <StatUnit value={formatK(latest.totalVolume)} unit="LB" label="LATEST SESSION" />
        <div style={{ flex: "1 1 auto", maxWidth: "60%" }}>
          <Sparkline data={data.map((d) => d.totalVolume)} height={44} />
        </div>
      </div>
    </IosCard>
  )
}
