"use client"

import type { TimeRange, Aggregation, WorkoutTypeFilter } from "@/lib/volume-analytics"

type Props = {
  timeRange: TimeRange
  aggregation: Aggregation
  typeFilter: WorkoutTypeFilter
  onTimeRangeChange: (r: TimeRange) => void
  onAggregationChange: (a: Aggregation) => void
  onTypeFilterChange: (f: WorkoutTypeFilter) => void
  showTypeFilter?: boolean
}

const pillContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "2px",
  background: "rgba(255, 255, 255, 0.04)",
  borderRadius: "8px",
  padding: "3px",
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "4px 0",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    background: active ? "rgba(255, 255, 255, 0.10)" : "transparent",
    color: active ? "rgba(255, 255, 255, 0.70)" : "rgba(255, 255, 255, 0.30)",
    fontSize: "10px",
    fontWeight: 500,
    fontFamily: "'Archivo Narrow', sans-serif",
    letterSpacing: "0.06em",
    textAlign: "center" as const,
    transition: "background 0.15s, color 0.15s",
  }
}

const TIME_RANGES: TimeRange[] = ["4W", "8W", "3M", "6M", "1Y", "All"]
const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: "session", label: "Session" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]
const TYPE_FILTERS: WorkoutTypeFilter[] = ["All", "Upper", "Lower"]

export function VolumeControls({
  timeRange,
  aggregation,
  typeFilter,
  onTimeRangeChange,
  onAggregationChange,
  onTypeFilterChange,
  showTypeFilter = true,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={pillContainerStyle}>
        {TIME_RANGES.map((r) => (
          <button key={r} style={pillStyle(timeRange === r)} onClick={() => onTimeRangeChange(r)}>
            {r}
          </button>
        ))}
      </div>

      <div style={pillContainerStyle}>
        {AGGREGATIONS.map(({ value, label }) => (
          <button key={value} style={pillStyle(aggregation === value)} onClick={() => onAggregationChange(value)}>
            {label}
          </button>
        ))}
      </div>

      {showTypeFilter && (
        <div style={pillContainerStyle}>
          {TYPE_FILTERS.map((f) => (
            <button key={f} style={pillStyle(typeFilter === f)} onClick={() => onTypeFilterChange(f)}>
              {f === "Upper" ? "Upper / Full Body" : f}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
