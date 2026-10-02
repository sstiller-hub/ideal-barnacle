"use client"

import { useRouter } from "next/navigation"
import { plural } from "@/lib/utils"
import { useState, useEffect } from "react"
import { getWorkoutHistory, calculateExerciseStats } from "@/lib/workout-storage"
import ExerciseProgressChart from "@/components/exercise-progress-chart"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosCard, IosSectionHeader } from "@/components/ios/grouped"
import { StatUnit } from "@/components/ledger/stat-unit"

const DAY_MS = 86_400_000
const formatK = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`)

type Overview = { totalWorkouts: number; totalVolume: number; last4Weeks: number }

export default function ProgressPage() {
  const router = useRouter()
  const [exercises, setExercises] = useState<string[]>([])
  const [stats, setStats] = useState<Record<string, any>>({})
  // Read from storage after mount only — the server has no history, and
  // reading it during render made the server and client disagree.
  const [overview, setOverview] = useState<Overview | null>(null)

  useEffect(() => {
    const history = getWorkoutHistory()

    const uniqueExercises = new Set<string>()
    history.forEach((workout) => {
      workout.exercises.forEach((ex) => {
        uniqueExercises.add(ex.name)
      })
    })

    const exerciseList = Array.from(uniqueExercises)
    setExercises(exerciseList)

    const exerciseStats: Record<string, any> = {}
    exerciseList.forEach((exerciseName) => {
      exerciseStats[exerciseName] = calculateExerciseStats(exerciseName)
    })
    setStats(exerciseStats)

    const cutoff = Date.now() - 28 * DAY_MS
    setOverview({
      totalWorkouts: history.length,
      totalVolume: history.reduce((acc, w) => acc + w.stats.totalVolume, 0),
      last4Weeks: history.filter((w) => new Date(w.date).getTime() >= cutoff).length,
    })
  }, [])

  return (
    <main style={{ minHeight: "100%", background: "#000", paddingBottom: "40px" }}>
      <IosNavPage backLabel="Home" onBack={() => router.push("/")} title="Progress">
        <IosCard>
          <div className="flex justify-between" style={{ gap: "12px" }}>
            <StatUnit value={overview ? `${overview.totalWorkouts}` : "—"} label="WORKOUTS" />
            <StatUnit value={overview ? formatK(overview.totalVolume) : "—"} unit="LB" label="ALL-TIME VOLUME" />
            <StatUnit
              value={overview ? `${Math.round((overview.last4Weeks / 4) * 10) / 10}` : "—"}
              unit="/ WK"
              label="LAST 4 WEEKS"
            />
          </div>
        </IosCard>

        <IosSectionHeader>
          {exercises.length} {plural(exercises.length, "exercise", "exercises")}
        </IosSectionHeader>

        {overview && exercises.length === 0 ? (
          <div className="ios-gft">Complete a workout to see your progress here.</div>
        ) : (
          <div className="flex flex-col" style={{ gap: "12px" }}>
            {exercises.map((exerciseName) => (
              <ExerciseProgressChart
                key={exerciseName}
                exerciseName={exerciseName}
                data={stats[exerciseName] || []}
                onOpen={() => router.push(`/exercise/${encodeURIComponent(exerciseName)}`)}
              />
            ))}
          </div>
        )}
      </IosNavPage>
    </main>
  )
}
