"use client"

import { useRef } from "react"
import type { DaySummary, HeatLevel } from "@/lib/home-calendar"
import { getDateKey, leadingBlankCount, startOfDay } from "@/lib/home-calendar"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

/**
 * Cell fills for the heat bands. Pure white is deliberately absent — it belongs
 * to the selected day alone, so a heavy day can never be mistaken for the one
 * you are looking at.
 */
const LEVEL_BG: Record<HeatLevel, string> = {
  0: "var(--ink-04)",
  1: "var(--ink-08)",
  2: "var(--ink-20)",
  3: "var(--ink-40)",
  4: "var(--ink-70)",
}

const LEVEL_TEXT: Record<HeatLevel, string> = {
  0: "var(--ink-50)",
  1: "var(--ink-50)",
  2: "#fff",
  // White, not black: black on the ink-40 fill is only 3.7:1.
  3: "#fff",
  4: "#000",
}

type Props = {
  month: Date
  selectedDate: Date
  summaries: Record<string, DaySummary>
  onSelectDate: (date: Date) => void
  onChangeMonth: (delta: number) => void
  /** Right-hand summary line, e.g. "12 sessions · 187.2K wk". */
  summaryLabel: string
  /** Optional trailing control in the header row (the workout-alerts flag). */
  headerAccessory?: React.ReactNode
}

export function MonthHeatCalendar({
  month,
  selectedDate,
  summaries,
  onSelectDate,
  onChangeMonth,
  summaryLabel,
  headerAccessory,
}: Props) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const blanks = leadingBlankCount(month)

  const todayKey = getDateKey(new Date())
  const selectedKey = getDateKey(selectedDate)

  // Horizontal swipe changes month; vertical movement is left to the page so
  // the grid never fights the scroll.
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    swipeStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
    onChangeMonth(dx > 0 ? -1 : 1)
  }

  return (
    // 20pt below the safe area, not 8: iOS 26 softens content sitting right
    // under the status bar in standalone web apps, which blurred this row.
    <div className="px-5" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: "14px" }}>
        <span
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--ink-70)",
          }}
        >
          {month.toLocaleDateString("en-US", { month: "long" }).toUpperCase()}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-50)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {summaryLabel}
        </span>
        {headerAccessory}
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "5px" }}
      >
        {WEEKDAYS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "9px",
              fontWeight: 600,
              color: "var(--ink-50)",
              textAlign: "center",
              marginBottom: "2px",
            }}
          >
            {label}
          </div>
        ))}

        {Array.from({ length: blanks }).map((_, index) => (
          <div key={`blank-${index}`} aria-hidden="true" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1
          const date = new Date(year, monthIndex, day)
          const key = getDateKey(date)
          const summary = summaries[key]
          const level = summary?.level ?? 0
          const status = summary?.status ?? "empty"

          const isSelected = key === selectedKey
          const isToday = key === todayKey
          const isPlanned = status === "plan"
          const isFuture = status === "fut"

          // Selection wins over every other state: a white cell with a thin
          // black inner ring, so it never reads as a max-volume day.
          const background = isSelected
            ? "#fff"
            : isPlanned || isFuture
              ? "transparent"
              : LEVEL_BG[level]

          const rings: string[] = []
          if (isSelected) {
            rings.push("inset 0 0 0 2px #000", "inset 0 0 0 3.5px #fff")
          } else {
            if (isPlanned) rings.push("inset 0 0 0 0.5px var(--ink-20)")
            if (isFuture) rings.push("inset 0 0 0 0.5px var(--ink-08)")
            if (isToday) rings.push("inset 0 0 0 1.5px #fff")
          }

          const color = isSelected
            ? "#000"
            : isPlanned
              ? "var(--ink-70)"
              : isFuture
                ? "var(--ink-50)"
                : LEVEL_TEXT[level]

          const label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-label={label}
              aria-current={isSelected ? "date" : undefined}
              data-testid={`calendar-day-${key}`}
              data-heat={level}
              data-status={status}
              style={{
                position: "relative",
                aspectRatio: "1",
                width: "100%",
                border: "none",
                borderRadius: "var(--radius-flat)",
                background,
                boxShadow: rings.length > 0 ? rings.join(", ") : undefined,
                padding: "3px",
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "flex-start",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: isSelected || isToday ? 600 : 400,
                  color,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {day}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { startOfDay }
