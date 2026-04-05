/**
 * Kova App — Deload Week Integration
 *
 * Tracks whether the current user has an active deload week.
 * A deload reduces set count (~50%) and weights (~72.5%) for recovery.
 * The is_active column in deload_weeks is a generated column that expires
 * automatically once ends_at passes — no cron job needed.
 */
"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"

export interface DeloadWeek {
  id: string
  started_at: string
  ends_at: string
  is_active: boolean
}

/**
 * Fetch the current user's active deload week, if any.
 */
export async function fetchActiveDeload(): Promise<DeloadWeek | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("deload_weeks")
    .select("id, started_at, ends_at, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.error("Failed to fetch deload week:", error)
    return null
  }

  return data ?? null
}

/**
 * Fetch the most recently ended deload week (for the post-deload banner).
 * Returns null if no completed deload exists.
 */
export async function fetchLastCompletedDeload(): Promise<DeloadWeek | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("deload_weeks")
    .select("id, started_at, ends_at, is_active")
    .eq("user_id", user.id)
    .eq("is_active", false)
    .lt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Failed to fetch last completed deload:", error)
    return null
  }

  return data ?? null
}

/**
 * React hook — use on any screen that needs to know deload state.
 *
 * Example:
 *   const { isDeload, deloadEndsAt, startDeload, cancelDeload } = useDeloadWeek()
 */
export function useDeloadWeek() {
  const [deload, setDeload] = useState<DeloadWeek | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = await fetchActiveDeload()
    setDeload(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    // Re-check whenever the user returns to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [refresh])

  /**
   * Start a 7-day deload week starting now.
   */
  const startDeload = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from("deload_weeks").insert({
      user_id: user.id,
      ends_at: endsAt,
    })

    if (error) {
      console.error("Failed to start deload week:", error)
      return
    }

    await refresh()
  }

  /**
   * Cancel the active deload by setting ends_at to now.
   */
  const cancelDeload = async () => {
    if (!deload) return

    const { error } = await supabase
      .from("deload_weeks")
      .update({ ends_at: new Date().toISOString() })
      .eq("id", deload.id)

    if (error) {
      console.error("Failed to cancel deload week:", error)
      return
    }

    setDeload(null)
  }

  return {
    isDeload: deload?.is_active ?? false,
    deloadEndsAt: deload ? new Date(deload.ends_at) : null,
    loading,
    startDeload,
    cancelDeload,
    refresh,
  }
}
