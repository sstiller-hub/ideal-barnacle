"use client"

import { X } from "lucide-react"
import { type WorkoutAlert } from "@/hooks/useWorkoutAlerts"
import WorkoutAlertsBanner from "@/components/workout-alerts-banner"

interface WorkoutAlertsSheetProps {
  alerts: WorkoutAlert[]
  onDismiss: (id?: string) => void
  onClose: () => void
}

/**
 * Alerts live behind a dashboard telltale (see the indicator dot next to
 * settings) instead of an inline banner — surfacing them here, in a sheet the
 * user opens on purpose, keeps them from ever pushing the core layout around.
 */
export default function WorkoutAlertsSheet({ alerts, onDismiss, onClose }: WorkoutAlertsSheetProps) {
  if (alerts.length === 0) return null

  return (
    <>
      <div className="fixed inset-0 z-[70]" style={{ background: "rgba(0, 0, 0, 0.6)" }} onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[71] px-5 pt-5"
        style={{
          background: "#0D0D0F",
          borderTop: "1px solid var(--ink-08)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "70vh",
          overflowY: "auto",
          animation: "slideUpSheet 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <span
            className="font-label"
            style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em", color: "var(--ink-40)", textTransform: "uppercase" as const }}
          >
            Flagged
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            type="button"
            style={{ background: "transparent", border: "none", color: "var(--ink-40)", padding: "4px", cursor: "pointer" }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <WorkoutAlertsBanner alerts={alerts} onDismiss={onDismiss} className="" />
      </div>
    </>
  )
}
