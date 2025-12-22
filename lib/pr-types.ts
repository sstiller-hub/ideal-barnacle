export type PRMetric = "weight" | "reps" | "volume"

export type PersonalRecord = {
  id: string
  userId: string
  exerciseId: string
  exerciseName: string
  metric: PRMetric
  valueNumber: number
  unit: string
  contextJson: {
    reps?: number
    weight?: number
    setIndex?: number
    workoutId?: string
    workoutDate?: string
  }
  achievedAt: string
  createdAt: string
  updatedAt: string
}

export type EvaluatedPR = {
  exerciseId: string
  exerciseName: string
  metric: PRMetric
  status: "new_pr" | "first_pr" | "tied_pr"
  previousRecord?: PersonalRecord | null
  newRecord: {
    valueNumber: number
    unit: string
    achievedAt: string
    context: {
      reps: number
      weight: number
      setIndex: number
      workoutId: string
    }
  }
}
