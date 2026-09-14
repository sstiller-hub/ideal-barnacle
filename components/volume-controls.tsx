"use client"

import { useState } from "react"
import type { TimeRange, Aggregation, WorkoutTypeFilter } from "@/lib/volume-analytics"
import { IosPullDownChip, IosSegmentedControl } from "@/components/ios/controls"

type Props = {
  timeRange: TimeRange
  aggregation: Aggregation
  typeFilter: WorkoutTypeFilter
  onTimeRangeChange: (r: TimeRange) => void
  onAggregationChange: (a: Aggregation) => void
  onTypeFilterChange: (f: WorkoutTypeFilter) => void
  showTypeFilter?: boolean
}

const TIME_RANGES: TimeRange[] = ["4W", "8W", "3M", "6M", "1Y", "All"]
const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: "session", label: "Session" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]
const TYPE_FILTERS: { value: WorkoutTypeFilter; label: string }[] = [
  { value: "All", label: "All" },
  { value: "Upper", label: "Upper / Full Body" },
  { value: "Lower", label: "Lower" },
]

/**
 * Analytics filters, iOS-style.
 *
 * These used to be three stacked full-width segment rows — an Android pattern
 * that spent a third of the screen before any data appeared. Now the range (the
 * one you actually sweep through) keeps a segmented control, and the two
 * categorical dimensions collapse into pull-down chips that show their current
 * value inline.
 */
export function VolumeControls({
  timeRange,
  aggregation,
  typeFilter,
  onTimeRangeChange,
  onAggregationChange,
  onTypeFilterChange,
  showTypeFilter = true,
}: Props) {
  const [openMenu, setOpenMenu] = useState<null | "bucket" | "group">(null)

  const bucketLabel = AGGREGATIONS.find((a) => a.value === aggregation)?.label ?? "Session"
  const groupLabel = TYPE_FILTERS.find((f) => f.value === typeFilter)?.label ?? "All"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <IosSegmentedControl
        ariaLabel="Time range"
        options={TIME_RANGES}
        value={timeRange}
        onChange={onTimeRangeChange}
      />

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <IosPullDownChip
          label={bucketLabel}
          header="Bucket"
          open={openMenu === "bucket"}
          onOpenChange={(open) => setOpenMenu(open ? "bucket" : null)}
          options={AGGREGATIONS}
          value={aggregation}
          onSelect={onAggregationChange}
        />

        {showTypeFilter && (
          <IosPullDownChip
            label={groupLabel}
            header="Exercise group"
            open={openMenu === "group"}
            onOpenChange={(open) => setOpenMenu(open ? "group" : null)}
            options={TYPE_FILTERS}
            value={typeFilter}
            onSelect={onTypeFilterChange}
          />
        )}
      </div>
    </div>
  )
}
