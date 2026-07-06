"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"

export type IndicatorTone = "good" | "warn"

export interface AktIndicatorChipProps {
  /**
   * Stable identity of the indicator — e.g. `${liftId}:${indicatorType}` or
   * `${setId}:pr`. This gates the entry animation to genuine first appearance:
   * a chip with an id that has already been lit renders in steady state, so it
   * does NOT re-animate on scroll recycling (virtualized rows), filter changes,
   * tab switches, or screen re-entry.
   */
  indicatorId: string
  tone: IndicatorTone
  /** Glyph/icon rendered in Archivo Narrow (`--font-label`). */
  glyph?: ReactNode
  label?: string
  /**
   * Whether an indicator is present. `false` reserves the slot's space empty so
   * a row's layout never shifts when a chip lights up or goes dark.
   */
  present?: boolean
  className?: string
}

// Module-level so it survives component unmount/remount and list virtualization
// recycling — the animation is "earned light" and must not replay per mount.
const litIndicators = new Set<string>()

// Fixed footprint so `present={false}` reserves the same space as a lit chip.
const CHIP_MIN_WIDTH = 20
const CHIP_HEIGHT = 18

export default function AktIndicatorChip({
  indicatorId,
  tone,
  glyph,
  label,
  present = true,
  className,
}: AktIndicatorChipProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  // Decide once per appearance whether this is a debut (animate) or a chip that
  // was already lit before this mount (render steady). Reading the module set
  // during render keeps recycled rows in steady state with no flash.
  const isDebut = present && !litIndicators.has(indicatorId)
  const [entered, setEntered] = useState(!isDebut)
  const debutHandledRef = useRef(false)

  useEffect(() => {
    if (!present) return
    if (litIndicators.has(indicatorId)) {
      // Already earned — ensure steady state, no animation.
      setEntered(true)
      return
    }
    if (debutHandledRef.current) return
    debutHandledRef.current = true
    litIndicators.add(indicatorId)
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [present, indicatorId])

  // Reserved-but-empty slot: no chrome, just space.
  if (!present) {
    return (
      <span
        aria-hidden
        className={className}
        style={{ display: "inline-block", minWidth: CHIP_MIN_WIDTH, height: CHIP_HEIGHT }}
      />
    )
  }

  const isGood = tone === "good"

  // Earned glow, capped at the calibrated ceiling. Reduced motion holds a calm,
  // steady glow (no ramp, softer for warn) and the chip stays fully legible.
  const glow = prefersReducedMotion
    ? isGood
      ? "var(--glow-good)"
      : "var(--glow-warn-soft)"
    : isGood
      ? "var(--glow-good)"
      : "var(--glow-warn)"

  const transition = prefersReducedMotion
    ? "opacity 120ms linear"
    : "opacity var(--duration-entry) var(--ease-theatre), transform var(--duration-entry) var(--ease-theatre), box-shadow var(--duration-entry) var(--ease-theatre)"

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        minWidth: CHIP_MIN_WIDTH,
        height: CHIP_HEIGHT,
        padding: "0 6px",
        boxSizing: "border-box",
        borderRadius: "var(--radius-flat)",
        fontFamily: "var(--font-label)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        // good = emerald ink on emerald tint; warn = amber ink on amber tint.
        color: isGood ? "var(--good-ink)" : "var(--warn-ink)",
        background: isGood ? "var(--good-tint)" : "var(--warn-tint)",
        boxShadow: entered ? glow : "none",
        opacity: entered ? 1 : 0,
        transform: prefersReducedMotion ? "none" : entered ? "translateY(0)" : "translateY(3px)",
        transition,
      }}
    >
      {glyph != null && <span aria-hidden>{glyph}</span>}
      {label}
    </span>
  )
}
