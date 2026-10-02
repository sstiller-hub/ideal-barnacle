"use client"

import { useEffect, useState } from "react"
import { getRoutines, type WorkoutRoutine } from "@/lib/routine-storage"
import {
  getWeeklySchedule,
  resetScheduleToGrowthV2FixedDays,
  setWeeklySchedule,
  type DayOfWeek,
  type ScheduledWorkout,
} from "@/lib/schedule-storage"
import { GROWTH_V2_ROUTINES } from "@/lib/growth-v2-plan"

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
    setWeeklyScheduleState((prev) => prev ?? getWeeklySchedule())
  }, [])

  const fallbackRoutines = routines.length > 0 ? routines : GROWTH_V2_ROUTINES
  const routineNameById = new Map(
    [...routines, ...GROWTH_V2_ROUTINES].map((routine) => [routine.id, routine.name]),
  )

  const updateDaySelection = (day: DayOfWeek, value: string) => {
    setWeeklyScheduleState((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      if (value === "rest") {
        next[day] = null
      } else {
        const routineName = routineNameById.get(value)
        if (!routineName) return prev
        next[day] = { routineId: value, routineName }
      }
      return next
    })
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
    <section className="ios-panel__block">
      <h2 className="ios-panel__title">Weekly schedule</h2>
      <p className="ios-panel__desc">Pick a routine or a rest day for each day, Monday through Sunday.</p>
      <div className="ios-panel__list">
        {weeklySchedule &&
          dayOrder.map(({ key, label }) => {
            const entry = weeklySchedule[key]
            const baseOptions = fallbackRoutines.map((routine) => ({
              id: routine.id,
              name: routine.name,
            }))
            const options =
              entry && !baseOptions.some((option) => option.id === entry.routineId)
                ? [...baseOptions, { id: entry.routineId, name: entry.routineName }]
                : baseOptions

            return (
              <label key={key} className="ios-panel__stat" style={{ minHeight: "44px", padding: "0 12px" }}>
                <span style={{ flex: "0 0 auto", fontSize: "15px", color: "#fff" }}>{label}</span>
                <select
                  className="ios-input"
                  style={{ fontSize: "15px" }}
                  aria-label={`${label} schedule`}
                  value={entry ? entry.routineId : "rest"}
                  onChange={(e) => updateDaySelection(key, e.target.value)}
                >
                  <option value="rest">Rest day</option>
                  {options.map((routine) => (
                    <option key={routine.id} value={routine.id}>
                      {routine.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
      </div>
      {scheduleMessage && (
        <p className="ios-panel__desc" role="status">
          {scheduleMessage}
        </p>
      )}
      <button type="button" className="ios-btn" data-tone="primary" onClick={handleSaveWeeklySchedule}>
        Save schedule
      </button>
      <button type="button" className="ios-btn" onClick={handleResetWeeklySchedule}>
        Reset to Growth v2 schedule
      </button>
    </section>
  )
}
