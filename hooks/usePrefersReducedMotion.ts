"use client"

import { useEffect, useState } from "react"

/**
 * Tracks the user's `prefers-reduced-motion` setting.
 *
 * Returns `false` on the server and first client render (motion allowed by
 * default), then resolves to the real value after mount and stays live if the
 * OS setting changes. Use it to gate JS-driven animation; pair it with a
 * `@media (prefers-reduced-motion: reduce)` rule for anything CSS-driven.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return reduced
}
