/**
 * Kova App — Workout Alerts Integration
 *
 * Drop this into your app's startup / home screen hook.
 * Queries unseen Tier 1 & 2 alerts and surfaces a banner.
 */
"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export interface WorkoutAlert {
  id: string
  exercise_name: string
  flag: "BUMP_DUE" | "REGRESSION" | "STALE" | "BUMP_TOO_AGGRESSIVE"
  tier: 1 | 2
  message: string
  action: string
  created_at: string
  workout_id: string
}

/**
 * Fetch all unseen Tier 1 + 2 alerts for the current user.
 * Call on app open / home screen mount.
 */
export async function fetchUnseenAlerts(): Promise<WorkoutAlert[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from("workout_alerts")
    .select("id, exercise_name, flag, tier, message, action, created_at, workout_id")
    .is("seen_at", null)
    .lte("tier", 2)
    .order("tier", { ascending: true }) // Tier 1 first
    .order("created_at", { ascending: false }) // Newest first within tier

  if (error) {
    console.error("Failed to fetch workout alerts:", error)
    return []
  }
  return data || []
}

/**
 * Mark one or more alerts as seen (dismiss from banner).
 */
export async function markAlertsSeen(alertIds: string[]): Promise<void> {
  const { error } = await supabase
    .from("workout_alerts")
    .update({ seen_at: new Date().toISOString() })
    .in("id", alertIds)

  if (error) console.error("Failed to mark alerts seen:", error)
}

/**
 * React hook — use in your home screen or workout summary screen.
 *
 * Example usage:
 *   const { alerts, dismiss } = useWorkoutAlerts()
 *   if (alerts.length > 0) <WorkoutAlertsBanner alerts={alerts} onDismiss={dismiss} />
 */
export function useWorkoutAlerts() {
  const [alerts, setAlerts] = useState<WorkoutAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUnseenAlerts().then((data) => {
      setAlerts(data)
      setLoading(false)
    })
  }, [])

  const dismiss = async (alertId?: string) => {
    if (!supabase) return
    const ids = alertId ? [alertId] : alerts.map((a) => a.id)
    await markAlertsSeen(ids)
    setAlerts((prev) => (alertId ? prev.filter((a) => a.id !== alertId) : []))
  }

  return { alerts, loading, dismiss }
}

/**
 * Tier label helpers for UI rendering
 */
export const TIER_LABELS = {
  1: { label: "Act Now", color: "#EF4444", emoji: "🔴" },
  2: { label: "Watch Closely", color: "#F59E0B", emoji: "🟡" },
} as const

export const FLAG_LABELS = {
  BUMP_DUE: "Weight Bump Due",
  REGRESSION: "Regression",
  STALE: "No Progression",
  BUMP_TOO_AGGRESSIVE: "Bump Too Heavy",
} as const
