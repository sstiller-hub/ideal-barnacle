"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"

type LastTimeCardProps = {
  lastSetPerformance: { weight: number; reps: number } | null
  currentSet: { weight: number; reps: number }
  setIndex: number
}

export default function LastTimeCard({ lastSetPerformance, currentSet, setIndex }: LastTimeCardProps) {
  const feedback = useMemo(() => {
    if (!lastSetPerformance) {
      return {
        status: "no-history" as const,
        icon: null,
        label: `Last time (Set ${setIndex + 1})`,
        text: "No history yet",
        subtitle: null,
        deltas: [],
      }
    }

    const currentWeight = currentSet.weight
    const currentReps = currentSet.reps
    const lastWeight = lastSetPerformance.weight
    const lastReps = lastSetPerformance.reps

    const hasMeaningfulInput = currentWeight > 0 || currentReps > 0

    if (!hasMeaningfulInput) {
      return {
        status: "neutral" as const,
        icon: null,
        label: `Last time (Set ${setIndex + 1})`,
        text: `${lastWeight} lb × ${lastReps} reps`,
        subtitle: null,
        deltas: [],
      }
    }

    const weightIncreased = currentWeight > lastWeight
    const repsIncreased = currentReps > lastReps
    const weightDecreased = currentWeight < lastWeight
    const repsDecreased = currentReps < lastReps
    const weightMatched = currentWeight === lastWeight
    const repsMatched = currentReps === lastReps

    // Edge case 1: Weight increased, reps decreased
    if (weightIncreased && repsDecreased) {
      const deltas = [
        `+${currentWeight - lastWeight} lb vs last time`,
        `-${lastReps - currentReps} reps`,
      ]
      return {
        status: "progressed" as const,
        icon: "↑",
        label: `Last time (Set ${setIndex + 1})`,
        text: `${lastWeight} lb × ${lastReps} reps`,
        subtitle: "Heavier weight — strength focus",
        deltas,
      }
    }

    // Edge case 2 & General progression: Weight same or increased, reps increased
    if ((weightMatched && repsIncreased) || (weightIncreased && repsIncreased)) {
      const deltas: string[] = []
      if (weightIncreased) {
        deltas.push(`+${currentWeight - lastWeight} lb vs last time`)
      }
      if (repsIncreased) {
        deltas.push(`+${currentReps - lastReps} reps vs last time`)
      }

      return {
        status: "progressed" as const,
        icon: "↑",
        label: `Last time (Set ${setIndex + 1})`,
        text: `${lastWeight} lb × ${lastReps} reps`,
        subtitle: "Progressed",
        deltas,
      }
    }

    // Edge case 3: Weight decreased, reps increased
    if (weightDecreased && repsIncreased) {
      const currentVolume = currentWeight * currentReps
      const lastVolume = lastWeight * lastReps

      if (currentVolume >= lastVolume) {
        const deltas = [`+${currentReps - lastReps} reps vs last time`]
        return {
          status: "progressed" as const,
          icon: "↑",
          label: `Last time (Set ${setIndex + 1})`,
          text: `${lastWeight} lb × ${lastReps} reps`,
          subtitle: "More reps — volume maintained",
          deltas,
        }
      } else {
        return {
          status: "neutral" as const,
          icon: "→",
          label: `Last time (Set ${setIndex + 1})`,
          text: `${lastWeight} lb × ${lastReps} reps`,
          subtitle: "Different path today",
          deltas: [],
        }
      }
    }

    // Weight increased, reps matched
    if (weightIncreased && repsMatched) {
      const deltas = [`+${currentWeight - lastWeight} lb vs last time`]
      return {
        status: "progressed" as const,
        icon: "↑",
        label: `Last time (Set ${setIndex + 1})`,
        text: `${lastWeight} lb × ${lastReps} reps`,
        subtitle: "Progressed",
        deltas,
      }
    }

    // Edge case 4: Both matched
    if (weightMatched && repsMatched) {
      return {
        status: "matched" as const,
        icon: "→",
        label: `Last time (Set ${setIndex + 1})`,
        text: `${lastWeight} lb × ${lastReps} reps`,
        subtitle: "Matched last time",
        deltas: [],
      }
    }

    // Edge case 5: Both decreased
    if (weightDecreased && repsDecreased) {
      return {
        status: "below" as const,
        icon: "⚠️",
        label: `Last time (Set ${setIndex + 1})`,
        text: `${lastWeight} lb × ${lastReps} reps`,
        subtitle: "Recovery day",
        deltas: [],
      }
    }

    // Weight decreased, reps matched OR weight matched, reps decreased
    if ((weightDecreased && repsMatched) || (weightMatched && repsDecreased)) {
      return {
        status: "below" as const,
        icon: "⚠️",
        label: `Last time (Set ${setIndex + 1})`,
        text: `${lastWeight} lb × ${lastReps} reps`,
        subtitle: "Recovery day",
        deltas: [],
      }
    }

    // Fallback neutral
    return {
      status: "neutral" as const,
      icon: "→",
      label: `Last time (Set ${setIndex + 1})`,
      text: `${lastWeight} lb × ${lastReps} reps`,
      subtitle: null,
      deltas: [],
    }
  }, [lastSetPerformance, currentSet, setIndex])

  const statusColors = {
    progressed: "bg-success/10 border-success/20 text-success",
    matched: "bg-muted/30 border-muted/40 text-muted-foreground",
    below: "bg-muted/30 border-muted/40 text-muted-foreground",
    neutral: "bg-muted/30 border-muted/40 text-muted-foreground",
    "no-history": "bg-muted/30 border-muted/40 text-muted-foreground",
  }

  return (
    <Card
      className={`p-2.5 backdrop-blur-sm transition-all ${statusColors[feedback.status]} border shadow-sm`}
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex items-start gap-2">
        {feedback.icon && <span className="text-base leading-none mt-0.5">{feedback.icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-normal mb-0.5">
            {feedback.label}
          </p>
          <p className="text-xs font-medium leading-tight opacity-90">{feedback.text}</p>
          {feedback.subtitle && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-normal">{feedback.subtitle}</p>
          )}
          {feedback.deltas.map((delta, idx) => (
            <p key={idx} className="text-[10px] text-success font-medium mt-0.5">
              {delta}
            </p>
          ))}
        </div>
      </div>
    </Card>
  )
}
