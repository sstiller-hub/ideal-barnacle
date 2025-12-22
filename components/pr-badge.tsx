import type { EvaluatedPR } from "@/lib/pr-types"
import { Card } from "@/components/ui/card"

type PRBadgeProps = {
  pr: EvaluatedPR
  compact?: boolean
}

export default function PRBadge({ pr, compact = false }: PRBadgeProps) {
  const getStatusColor = (status: EvaluatedPR["status"]) => {
    switch (status) {
      case "new_pr":
        return "bg-success text-success-foreground"
      case "first_pr":
        return "bg-primary text-primary-foreground"
      case "tied_pr":
        return "bg-accent text-accent-foreground"
    }
  }

  const getStatusText = (status: EvaluatedPR["status"]) => {
    switch (status) {
      case "new_pr":
        return "NEW PR"
      case "first_pr":
        return "FIRST PR"
      case "tied_pr":
        return "TIED PR"
    }
  }

  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case "weight":
        return "Heaviest Set"
      case "reps":
        return "Most Reps"
      case "volume":
        return "Best Volume"
      default:
        return metric
    }
  }

  const formatValue = (pr: EvaluatedPR) => {
    const { metric, newRecord } = pr
    if (metric === "volume") {
      return `${newRecord.valueNumber.toLocaleString()} ${newRecord.unit}`
    }
    return `${newRecord.valueNumber} ${newRecord.unit}`
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 bg-success/10 border border-success/20 rounded-md">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${getStatusColor(pr.status)}`}>
          {getStatusText(pr.status)}
        </span>
        <span className="text-xs font-medium text-foreground">
          {pr.exerciseName} - {formatValue(pr)}
        </span>
      </div>
    )
  }

  return (
    <Card className="p-3 bg-gradient-to-br from-success/5 to-success/10 border-success/20">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <h4 className="text-sm font-bold text-foreground">{pr.exerciseName}</h4>
          <p className="text-xs text-muted-foreground">{getMetricLabel(pr.metric)}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded ${getStatusColor(pr.status)}`}>
          {getStatusText(pr.status)}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{formatValue(pr)}</span>
        {pr.previousRecord && pr.status === "new_pr" && (
          <span className="text-xs text-muted-foreground">
            (prev: {pr.previousRecord.valueNumber} {pr.previousRecord.unit})
          </span>
        )}
      </div>
    </Card>
  )
}
