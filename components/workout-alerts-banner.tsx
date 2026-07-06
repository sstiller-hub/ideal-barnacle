"use client"

import { type WorkoutAlert, TIER_LABELS } from "@/hooks/useWorkoutAlerts"

interface WorkoutAlertsBannerProps {
  alerts: WorkoutAlert[]
  onDismiss: (id?: string) => void
  className?: string
}

export default function WorkoutAlertsBanner({ alerts, onDismiss, className = "px-5 mb-3" }: WorkoutAlertsBannerProps) {
  if (alerts.length === 0) return null

  return (
    <div className={`${className} space-y-2`}>
      {alerts.map((alert) => {
        const tier = TIER_LABELS[alert.tier]
        const isUrgent = alert.tier === 1
        return (
          <div
            key={alert.id}
            style={{
              background: isUrgent ? "rgba(239, 68, 68, 0.07)" : "var(--warn-tint)",
              border: `1px solid ${isUrgent ? "rgba(239, 68, 68, 0.22)" : "var(--warn-ink)"}`,
              borderRadius: "var(--radius-xs)",
              padding: "10px 12px",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span style={{ fontSize: "10px", lineHeight: 1 }}>{tier.emoji}</span>
                  <span
                    className="font-label"
                    style={{
                      fontSize: "8px",
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      color: isUrgent ? tier.color : "var(--warn-ink)",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    {tier.label}
                  </span>
                  <span
                    className="font-label"
                    style={{
                      fontSize: "8px",
                      fontWeight: 400,
                      letterSpacing: "0.05em",
                      color: "var(--ink-25)",
                    }}
                  >
                    · {alert.exercise_name}
                  </span>
                </div>
                <div
                  className="text-ink-70 mb-1"
                  style={{ fontSize: "12px", fontWeight: 400, lineHeight: "1.4" }}
                >
                  {alert.message}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 400,
                    color: "var(--ink-35)",
                    fontStyle: "italic" as const,
                    lineHeight: "1.3",
                  }}
                >
                  {alert.action}
                </div>
              </div>
              <button
                onClick={() => onDismiss(alert.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0 2px",
                  cursor: "pointer",
                  color: "var(--ink-20)",
                  fontSize: "16px",
                  lineHeight: 1,
                  flexShrink: 0,
                  marginTop: "-1px",
                }}
                aria-label="Dismiss alert"
                type="button"
              >
                ×
              </button>
            </div>
          </div>
        )
      })}
      {alerts.length > 1 && (
        <button
          onClick={() => onDismiss()}
          className="font-label"
          style={{
            background: "transparent",
            border: "none",
            padding: "2px 0",
            cursor: "pointer",
            color: "var(--ink-20)",
            fontSize: "9px",
            letterSpacing: "0.10em",
            textTransform: "uppercase" as const,
          }}
          type="button"
        >
          Dismiss all
        </button>
      )}
    </div>
  )
}
