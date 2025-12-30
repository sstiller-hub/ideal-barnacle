"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { getRoutines, type WorkoutRoutine } from "@/lib/routine-storage"
import {
  getWeeklySchedule,
  resetScheduleToGrowthV2FixedDays,
  setWeeklySchedule,
  type DayOfWeek,
  type ScheduledWorkout,
} from "@/lib/schedule-storage"

const dayOrder: Array<{ key: DayOfWeek; label: string }> = [
  { key: "Mon", label: "Monday" },
  { key: "Tue", label: "Tuesday" },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday" },
  { key: "Fri", label: "Friday" },
  { key: "Sat", label: "Saturday" },
  { key: "Sun", label: "Sunday" },
]

export function WorkoutScheduleEditor() {
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([])
  const [weeklySchedule, setWeeklyScheduleState] = useState<Record<
    DayOfWeek,
    ScheduledWorkout | null
  > | null>(null)
  const [scheduleMessage, setScheduleMessage] = useState<string>("")

  useEffect(() => {
    setRoutines(getRoutines())
    setWeeklyScheduleState(getWeeklySchedule())
  }, [])

  const updateDaySelection = (day: DayOfWeek, value: string) => {
    if (!weeklySchedule) return
    const next = { ...weeklySchedule }
    if (value === "rest") {
      next[day] = null
    } else {
      const routine = routines.find((item) => item.id === value)
      if (!routine) return
      next[day] = { routineId: routine.id, routineName: routine.name }
    }
    setWeeklyScheduleState(next)
  }

  const handleSaveWeeklySchedule = () => {
    if (!weeklySchedule) return
    setWeeklySchedule(weeklySchedule)
    setScheduleMessage("Schedule saved.")
    window.dispatchEvent(new Event("schedule:updated"))
    window.setTimeout(() => setScheduleMessage(""), 2000)
  }

  const handleResetWeeklySchedule = () => {
    resetScheduleToGrowthV2FixedDays(365)
    setWeeklyScheduleState(getWeeklySchedule())
    setScheduleMessage("Schedule reset to Growth v2.")
    window.dispatchEvent(new Event("schedule:updated"))
    window.setTimeout(() => setScheduleMessage(""), 2000)
  }

  return (
    <div>
      <h2 className="font-bold text-base mb-2">Workout Schedule</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Set your weekly schedule for Monday through Sunday. Rest days are supported.
      </p>
      <div className="space-y-3">
        {weeklySchedule &&
          dayOrder.map(({ key, label }) => {
            const entry = weeklySchedule[key]
            return (
              <div key={key} className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium w-24">{label}</div>
                <select
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={entry ? entry.routineId : "rest"}
                  onChange={(e) => updateDaySelection(key, e.target.value)}
                >
                  <option value="rest">Rest day</option>
                  {routines.map((routine) => (
                    <option key={routine.id} value={routine.id}>
                      {routine.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
      </div>
      {scheduleMessage && <p className="mt-3 text-xs text-muted-foreground">{scheduleMessage}</p>}
      <div className="mt-4 space-y-2">
        <Button onClick={handleSaveWeeklySchedule} className="w-full">
          Save schedule
        </Button>
        <Button onClick={handleResetWeeklySchedule} className="w-full" variant="outline">
          Reset to Growth v2 schedule
        </Button>
      </div>
    </div>
  )
}
