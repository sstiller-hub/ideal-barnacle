"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"

export type ProgramMessageTone = "warn" | "neutral"

export interface AktProgramMessageLineProps {
  /** The message to render. `null`/empty keeps the slot reserved but blank. */
  message: ReactNode | null
  /** Visual register. `warn` is the amber, glowing, earned/actionable line; `neutral` is the dim status line. */
  tone?: ProgramMessageTone
  /**
   * Stable identity of the *current* message. The entry animation replays only
   * when this changes (a genuinely new message), not on every parent re-render.
   * Defaults to the tone so distinct states still animate their debut.
   */
  messageKey?: string
  /** When provided, renders a dismiss affordance (used by the neutral status line). */
  onDismiss?: () => void
  className?: string
}

// The line always occupies this height, whether or not a message is present, so
// a message appearing (or the entry animation) never reflows the page around it.
const RESERVED_MIN_HEIGHT = 38

/**
 * AktProgramMessageLine — a single generic program-message slot.
 *
 * It is deliberately *not* deload-specific: callers pass a message + tone, so
 * active-deload, deload-complete, and any future program state all route
 * through one line with no rebuild. See `app/page.tsx` for the deload wiring.
 */
export default function AktProgramMessageLine({
  message,
  tone = "neutral",
  messageKey,
  onDismiss,
  className = "px-5 mb-3",
}: AktProgramMessageLineProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  // Mount gate: the message often derives from localStorage (e.g. useDeloadWeek),
  // which is empty during SSR. Rendering the reserved slot on the server AND the
  // first client paint keeps hydration in sync; the message reveals post-mount —
  // which is also the message's genuine first appearance for this page load.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const hasMessage = message !== null && message !== undefined && message !== ""
  const key = messageKey ?? tone
  const showMessage = mounted && hasMessage

  // Gate the entry animation to a genuine absent→present (or new-message)
  // transition. `entered` starts false for a fresh message, then flips on the
  // next frame so the CSS transition runs once — it does not replay while the
  // same message stays mounted across unrelated re-renders.
  const [entered, setEntered] = useState(false)
  const shownKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!showMessage) {
      shownKeyRef.current = null
      return
    }
    if (shownKeyRef.current === key) return // already shown this message — steady state
    shownKeyRef.current = key
    setEntered(false)
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [showMessage, key])

  // Reserved-but-empty slot: holds vertical space so nothing shifts.
  if (!showMessage) {
    return <div className={className} aria-hidden style={{ minHeight: RESERVED_MIN_HEIGHT }} />
  }

  const isWarn = tone === "warn"

  // "Earned light": full glow ramps in with the fade. Reduced motion holds a
  // calmer, steady glow (no ramp) and drops the 3px drift.
  const glow = isWarn
    ? prefersReducedMotion
      ? "var(--glow-warn-soft)"
      : "var(--glow-warn)"
    : "none"

  const transition = prefersReducedMotion
    ? "opacity 120ms linear"
    : "opacity var(--duration-entry) var(--ease-theatre), transform var(--duration-entry) var(--ease-theatre), box-shadow var(--duration-entry) var(--ease-theatre)"

  return (
    <div className={className}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: onDismiss ? "space-between" : "flex-start",
          gap: "12px",
          minHeight: RESERVED_MIN_HEIGHT,
          boxSizing: "border-box",
          padding: "10px 12px",
          borderRadius: "var(--radius-xs)",
          background: isWarn ? "var(--warn-tint)" : "rgba(255, 255, 255, 0.03)",
          border: `1px solid ${isWarn ? "var(--warn-ink)" : "var(--ink-08)"}`,
          // Glow only when lit and calm; steady in reduced-motion.
          boxShadow: entered ? glow : "none",
          opacity: entered ? 1 : 0,
          transform: prefersReducedMotion ? "none" : entered ? "translateY(0)" : "translateY(3px)",
          transition,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: isWarn ? "10px" : "11px",
            fontWeight: 500,
            letterSpacing: isWarn ? "0.14em" : "0.04em",
            textTransform: isWarn ? "uppercase" : "none",
            lineHeight: 1.4,
            color: isWarn ? "var(--warn-ink)" : "var(--ink-50)",
          }}
        >
          {message}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            type="button"
            style={{
              background: "transparent",
              border: "none",
              padding: "0 2px",
              cursor: "pointer",
              color: "var(--ink-25)",
              fontSize: "16px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
