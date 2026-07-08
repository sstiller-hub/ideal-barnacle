"use client"

import { useEffect, useState, type ReactNode } from "react"

type SessionClockProps = {
  startedAt: string
  render?: (formatted: string) => ReactNode
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

// Isolated ticking clock: owns its own interval so the per-second re-render
// stops here instead of cascading through the parent tree.
export function SessionClock({ startedAt, render }: SessionClockProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const formatted = formatElapsed(now - new Date(startedAt).getTime())

  if (render) return <>{render(formatted)}</>

  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "21px",
        lineHeight: 1,
        color: "var(--ink-95)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {formatted}
    </span>
  )
}
