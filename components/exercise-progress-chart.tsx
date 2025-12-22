"use client"

import { Card } from "@/components/ui/card"

type ChartDataPoint = {
  date: string
  maxWeight: number
  totalVolume: number
}

type ExerciseProgressChartProps = {
  exerciseName: string
  data: ChartDataPoint[]
}

export default function ExerciseProgressChart({ exerciseName, data }: ExerciseProgressChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">{exerciseName}</h3>
        <div className="text-xs text-muted-foreground py-8 text-center">
          No data yet - complete a workout to see progress
        </div>
      </Card>
    )
  }

  const maxWeightValue = Math.max(...data.map((d) => d.maxWeight))
  const minWeightValue = Math.min(...data.map((d) => d.maxWeight))
  const weightRange = maxWeightValue - minWeightValue || 10

  const maxVolumeValue = Math.max(...data.map((d) => d.totalVolume))
  const minVolumeValue = Math.min(...data.map((d) => d.totalVolume))
  const volumeRange = maxVolumeValue - minVolumeValue || 100

  const latestWeight = data[data.length - 1].maxWeight
  const previousWeight = data.length > 1 ? data[data.length - 2].maxWeight : latestWeight
  const weightChange = latestWeight - previousWeight
  const weightTrend = weightChange > 0 ? "up" : weightChange < 0 ? "down" : "same"

  const latestVolume = data[data.length - 1].totalVolume
  const previousVolume = data.length > 1 ? data[data.length - 2].totalVolume : latestVolume
  const volumeChange = latestVolume - previousVolume
  const volumeTrend = volumeChange > 0 ? "up" : volumeChange < 0 ? "down" : "same"

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm">{exerciseName}</h3>
          <p className="text-xs text-muted-foreground">{data.length} workouts tracked</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-foreground">{latestWeight} lbs</div>
          <div className="text-xs text-muted-foreground">Latest max</div>
        </div>
      </div>

      {/* Weight Chart */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Max Weight</span>
          {weightTrend !== "same" && (
            <span className={`text-xs font-medium ${weightTrend === "up" ? "text-success" : "text-destructive"}`}>
              {weightTrend === "up" ? "+" : ""}
              {weightChange} lbs
            </span>
          )}
        </div>
        <div className="h-20 flex items-end gap-1">
          {data.map((point, idx) => {
            const heightPercent = ((point.maxWeight - minWeightValue) / weightRange) * 100
            const isLatest = idx === data.length - 1
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t transition-all ${isLatest ? "bg-primary" : "bg-primary/40"}`}
                  style={{
                    height: `${Math.max(heightPercent, 10)}%`,
                  }}
                  title={`${point.maxWeight} lbs on ${formatDate(point.date)}`}
                />
                {(idx === 0 || idx === data.length - 1 || data.length <= 5) && (
                  <span className="text-[9px] text-muted-foreground rotate-0">
                    {formatDate(point.date).split(" ")[1]}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Volume Chart */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Total Volume</span>
          {volumeTrend !== "same" && (
            <span className={`text-xs font-medium ${volumeTrend === "up" ? "text-success" : "text-destructive"}`}>
              {volumeTrend === "up" ? "+" : ""}
              {volumeChange.toLocaleString()} lbs
            </span>
          )}
        </div>
        <div className="h-16 flex items-end gap-1">
          {data.map((point, idx) => {
            const heightPercent = ((point.totalVolume - minVolumeValue) / volumeRange) * 100
            const isLatest = idx === data.length - 1
            return (
              <div
                key={idx}
                className={`flex-1 rounded-t transition-all ${isLatest ? "bg-accent" : "bg-accent/40"}`}
                style={{
                  height: `${Math.max(heightPercent, 10)}%`,
                }}
                title={`${point.totalVolume.toLocaleString()} lbs on ${formatDate(point.date)}`}
              />
            )
          })}
        </div>
        <div className="text-xs text-muted-foreground text-right mt-1">{latestVolume.toLocaleString()} lbs total</div>
      </div>
    </Card>
  )
}
