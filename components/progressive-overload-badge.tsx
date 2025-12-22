"use client"

import { useMemo } from "react"
import type { PerformanceMetrics } from "@/lib/workout-storage"

type ProgressiveOverloadBadgeProps = {
  lastPerformance: PerformanceMetrics | null
  currentPerformance: PerformanceMetrics
}

export default function ProgressiveOverloadBadge({
  lastPerformance,
  currentPerformance,
}: ProgressiveOverloadBadgeProps) {
  const indicator = useMemo(() => {
    const hasValidCurrentData = currentPerformance.setCount > 0 && currentPerformance.totalReps > 0

    // Empty state: no valid current data
    if (!hasValidCurrentData) {
      return {
        type: "empty" as const,
        label: "Vs last: enter 1 set to compare",
        icon: "○",
      }
    }

    // First time: no prior history
    if (!lastPerformance) {
      return {
        type: "first-time" as const,
        label: "First time logged",
        icon: "●",
      }
    }

    const volumeDelta = currentPerformance.totalVolume - lastPerformance.totalVolume
    const volumeDeltaPct = lastPerformance.totalVolume > 0 ? volumeDelta / lastPerformance.totalVolume : 0
    const repsDelta = currentPerformance.totalReps - lastPerformance.totalReps
    const weightDelta = currentPerformance.maxWeight - lastPerformance.maxWeight

    // Priority a) Volume increase
    if (volumeDelta > 0 && (Math.abs(volumeDeltaPct) >= 0.02 || volumeDelta >= 5)) {
      const pct = Math.round(volumeDeltaPct * 100)
      const details = []
      if (repsDelta > 0) details.push(`+${repsDelta} reps`)
      if (weightDelta > 0) details.push(`+${weightDelta} lbs`)
      else if (weightDelta === 0) details.push("same weight")

      return {
        type: "volume-up" as const,
        label: `Vs last: +${pct}% volume${details.length > 0 ? " · " + details.join(" · ") : ""}`,
        icon: "↑",
      }
    }

    // Priority b) Weight increase
    if (weightDelta >= 2.5) {
      return {
        type: "weight-up" as const,
        label: `Vs last: +${weightDelta} lbs`,
        icon: "↑",
      }
    }

    // Priority c) Reps increase
    if (repsDelta >= 1) {
      return {
        type: "reps-up" as const,
        label: `Vs last: +${repsDelta} reps`,
        icon: "↑",
      }
    }

    // Priority d) All same
    if (Math.abs(volumeDelta) < 5 && Math.abs(repsDelta) < 1 && Math.abs(weightDelta) < 2.5) {
      return {
        type: "same" as const,
        label: "Vs last: same as last time",
        icon: "=",
      }
    }

    // Priority e) Decline (use muted orange)
    const pct = Math.abs(Math.round(volumeDeltaPct * 100))
    return {
      type: "decline" as const,
      label: `Vs last: -${pct}% volume`,
      icon: "↓",
    }
  }, [lastPerformance, currentPerformance])

  const getTextColor = () => {
    if (indicator.type === "empty" || indicator.type === "first-time") return "text-muted-foreground"
    if (indicator.type === "volume-up" || indicator.type === "weight-up" || indicator.type === "reps-up")
      return "text-success"
    if (indicator.type === "decline") return "text-orange-600/80"
    return "text-muted-foreground"
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs ${getTextColor()}`}>
      <span className="text-[10px]">{indicator.icon}</span>
      <span className="font-medium">{indicator.label}</span>
    </div>
  )
}
