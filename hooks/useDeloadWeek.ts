/**
 * Kova App — Deload Week
 *
 * localStorage-first (matches the rest of the app's offline-first architecture).
 * Supabase is synced opportunistically when the user is authenticated, but the
 * feature works fully without a logged-in account.
 */
"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const DELOAD_KEY = "deload_week"
const DELOAD_ENDED_KEY = "deload_week_last_ended"

interface StoredDeload {
  id?: string       // Supabase row id, if synced
  startedAt: string // ISO string
  endsAt: string    // ISO string
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function getLocalDeload(): StoredDeload | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(DELOAD_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as StoredDeload
    const now = new Date()
    if (new Date(d.endsAt) > now && new Date(d.startedAt) <= now) return d
    // Expired — save the end date for the post-deload banner, then clean up
    localStorage.setItem(DELOAD_ENDED_KEY, d.endsAt)
    localStorage.removeItem(DELOAD_KEY)
    return null
  } catch {
    return null
  }
}

function setLocalDeload(d: StoredDeload | null): void {
  if (typeof window === "undefined") return
  if (d) localStorage.setItem(DELOAD_KEY, JSON.stringify(d))
  else localStorage.removeItem(DELOAD_KEY)
}

// ─── Supabase sync (best-effort, runs after localStorage is already updated) ─

async function syncStartToSupabase(startedAt: string, endsAt: string): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from("deload_weeks")
      .insert({ user_id: user.id, started_at: startedAt, ends_at: endsAt })
      .select("id")
      .single()
    if (error) return null
    return data?.id ?? null
  } catch {
    return null
  }
}

async function syncCancelToSupabase(id: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from("deload_weeks")
      .update({ ends_at: new Date().toISOString() })
      .eq("id", id)
  } catch {
    // ignore — localStorage already updated
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook — use anywhere deload state is needed.
 *
 * isDeload is computed synchronously from localStorage on first render,
 * so there is no loading flash and no Supabase dependency for the feature to work.
 *
 * Example:
 *   const { isDeload, deloadEndsAt, startDeload, cancelDeload } = useDeloadWeek()
 */
export function useDeloadWeek() {
  const [deload, setDeload] = useState<StoredDeload | null>(() => getLocalDeload())
  const lastCompletedEndsAt: Date | null = (() => {
    if (typeof window === "undefined") return null
    const raw = localStorage.getItem(DELOAD_ENDED_KEY)
    return raw ? new Date(raw) : null
  })()

  // Re-check on tab focus (another device/tab may have updated localStorage)
  const refresh = useCallback(() => {
    setDeload(getLocalDeload())
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [refresh])

  /**
   * Start a 7-day deload. Updates localStorage immediately, then syncs to
   * Supabase in the background (if authenticated).
   */
  const startDeload = useCallback(async () => {
    const startedAt = new Date().toISOString()
    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const stored: StoredDeload = { startedAt, endsAt }

    // Persist locally first — UI updates immediately
    setLocalDeload(stored)
    setDeload(stored)

    // Sync to Supabase in background
    const id = await syncStartToSupabase(startedAt, endsAt)
    if (id) {
      const withId = { ...stored, id }
      setLocalDeload(withId)
      setDeload(withId)
    }
  }, [])

  /**
   * Cancel the active deload. Updates localStorage immediately, then syncs to
   * Supabase in the background.
   */
  const cancelDeload = useCallback(async () => {
    const current = deload
    setLocalDeload(null)
    setDeload(null)

    if (current?.id) {
      await syncCancelToSupabase(current.id)
    }
  }, [deload])

  return {
    isDeload: deload !== null,
    deloadEndsAt: deload ? new Date(deload.endsAt) : null,
    lastCompletedDeloadEndsAt: lastCompletedEndsAt,
    startDeload,
    cancelDeload,
    refresh,
  }
}
