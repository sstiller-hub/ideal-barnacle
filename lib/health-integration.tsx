// Health data integration utilities
// Prepared for future native iOS HealthKit integration

export type HealthKitWorkoutType = "traditionalStrengthTraining" | "functionalStrengthTraining" | "cardio" | "hiit"

export interface HealthKitWorkout {
  workoutType: HealthKitWorkoutType
  startDate: Date
  endDate: Date
  duration: number // seconds
  totalEnergyBurned?: number // kcal
  distance?: number // meters
  metadata?: Record<string, any>
}

// Convert app workout to HealthKit format
export function convertToHealthKit(workout: any): HealthKitWorkout {
  const startDate = new Date(workout.date)
  const endDate = new Date(startDate.getTime() + (workout.duration || 0) * 1000)

  return {
    workoutType: "traditionalStrengthTraining",
    startDate,
    endDate,
    duration: workout.duration || 0,
    metadata: {
      exercises: workout.exercises.map((ex: any) => ex.name),
      totalVolume: calculateWorkoutVolume(workout),
    },
  }
}

function calculateWorkoutVolume(workout: any): number {
  let total = 0
  for (const exercise of workout.exercises) {
    if (exercise.sets) {
      for (const set of exercise.sets) {
        if (set.weight && set.reps) {
          total += set.weight * set.reps
        }
      }
    }
  }
  return total
}

// Export workout data in Apple Health XML format
export function exportToAppleHealthXML(workouts: any[]): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData>
<HealthData locale="en_US">
  <ExportDate value="${new Date().toISOString()}" />
  ${workouts.map(workoutToXML).join("\n  ")}
</HealthData>`
  return xml
}

function workoutToXML(workout: any): string {
  const healthKitWorkout = convertToHealthKit(workout)
  return `<Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining"
    duration="${healthKitWorkout.duration}"
    durationUnit="s"
    startDate="${healthKitWorkout.startDate.toISOString()}"
    endDate="${healthKitWorkout.endDate.toISOString()}"
    sourceName="Workout Tracker"
    creationDate="${new Date(workout.createdAt || workout.date).toISOString()}">
  </Workout>`
}

// Download workout export for manual import to Health app
export function downloadHealthExport(workouts: any[]) {
  const xml = exportToAppleHealthXML(workouts)
  const blob = new Blob([xml], { type: "application/xml" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `workout-export-${new Date().toISOString().split("T")[0]}.xml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
