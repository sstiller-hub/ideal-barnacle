"use client"

import type React from "react"
import { useRef, useState } from "react"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import type { CoachNote, CoachNoteKind } from "@/lib/coach-notes"

/** Past this much leftward travel, releasing dismisses instead of springing back. */
const DISMISS_THRESHOLD = 64
/** How far the card can be dragged before it stops following the finger. */
const MAX_TRAVEL = 104

/**
 * Kind reads as ink, not as decoration — only `flag` earns the amber accent the
 * rest of the app reserves for "look at this". The other three sit on the ink
 * ladder so a stack of notes stays a set-list annotation rather than a row of
 * badges.
 */
const KIND_TONE: Record<CoachNoteKind, { rule: string; pill: string; tint: string; border: string }> = {
  flag: {
    rule: "var(--warn-ink)",
    pill: "var(--warn-ink)",
    tint: "var(--warn-tint)",
    // The sanctioned tint border from the ledger spec — the one chromatic rgba.
    border: "rgba(251, 191, 36, 0.22)",
  },
  target: { rule: "var(--ink-35)", pill: "var(--ink-50)", tint: "var(--ink-04)", border: "var(--ink-08)" },
  change: { rule: "var(--ink-25)", pill: "var(--ink-40)", tint: "var(--ink-04)", border: "var(--ink-08)" },
  reminder: { rule: "var(--ink-15)", pill: "var(--ink-35)", tint: "var(--ink-02)", border: "var(--ink-06)" },
}

function toneFor(kind: CoachNoteKind) {
  return KIND_TONE[kind] ?? KIND_TONE.reminder
}

/**
 * One coach note, as a margin annotation on the set list.
 *
 * Flat band, hairline left rule in the kind's ink, kind pill + body on one
 * line. Tapping expands `detail` when there is one; swiping left dismisses it
 * for good. Deliberately not a banner and not a modal: it sits in the reading
 * path of the exercise it belongs to and never covers anything.
 */
export function CoachNoteCard({
  note,
  onDismiss,
}: {
  note: CoachNote
  onDismiss: (noteId: string) => void | Promise<boolean | void>
}) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [expanded, setExpanded] = useState(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [dismissFocused, setDismissFocused] = useState(false)
  const startX = useRef(0)
  // The live travel, alongside the state that renders it: the release handler
  // has to read where the finger actually ended up, not the offset from the
  // render it happens to be closed over.
  const offsetRef = useRef(0)
  // Same reason as offsetRef: whether a drag is in flight has to be readable
  // by the very next pointer event, which can arrive before React has
  // re-rendered with the state that says so.
  const draggingRef = useRef(false)
  // A drag that ends on the card must not also read as a tap-to-expand.
  const draggedRef = useRef(false)

  const tone = toneFor(note.kind)
  const hasDetail = Boolean(note.detail && note.detail.trim())

  const commitDismiss = () => {
    if (leaving) return
    draggingRef.current = false
    setLeaving(true)
    offsetRef.current = -MAX_TRAVEL
    setOffset(-MAX_TRAVEL)
    // Let the card clear the lane before the row collapses under it.
    window.setTimeout(() => {
      void Promise.resolve(onDismiss(note.id)).then((ok) => {
        // The write failed and the parent put the note back. Put the card back
        // too — otherwise it sits parked open over its own Dismiss action.
        if (ok === false) {
          draggingRef.current = false
          offsetRef.current = 0
          setOffset(0)
          setLeaving(false)
        }
      })
    }, prefersReducedMotion ? 0 : 160)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    // Mouse users get the click target and the explicit Dismiss button.
    if (event.pointerType === "mouse" || leaving) return
    startX.current = event.clientX
    draggedRef.current = false
    // Capture so the drag survives the finger leaving the card — without it a
    // swipe that strays vertically never gets its pointerup and the card stays
    // parked half-open.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is a nicety; the gesture still works without it.
    }
    draggingRef.current = true
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = event.clientX - startX.current
    if (Math.abs(dx) > 4) draggedRef.current = true
    const next = Math.max(-MAX_TRAVEL, Math.min(0, dx))
    offsetRef.current = next
    setOffset(next)
  }

  const onPointerUp = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (offsetRef.current <= -DISMISS_THRESHOLD) {
      commitDismiss()
      return
    }
    offsetRef.current = 0
    setOffset(0)
  }

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius-flat)" }}>
      {/* Revealed behind the card as it travels; also the keyboard/screen-reader
          path to dismissal, since the gesture itself is invisible.

          Hidden until the card actually moves (or the button takes focus): the
          card face carries the ink ladder's near-transparent tint, so a label
          sitting behind it at rest reads straight through the body text. */}
      <button
        type="button"
        onClick={commitDismiss}
        onFocus={() => setDismissFocused(true)}
        onBlur={() => setDismissFocused(false)}
        aria-label={`Dismiss note: ${note.body}`}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: `${MAX_TRAVEL}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ink-04)",
          border: "none",
          borderRadius: "var(--radius-flat)",
          fontFamily: "var(--font-label)",
          fontSize: "8px",
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-50)",
          cursor: "pointer",
          opacity: offset < 0 || dismissFocused ? 1 : 0,
          // Keyboard activation still reaches it — pointer-events only gates
          // hit-testing, not the click a focused button dispatches on Enter.
          pointerEvents: offset < 0 || dismissFocused ? "auto" : "none",
          transition: prefersReducedMotion ? "none" : "opacity var(--duration-fast) linear",
        }}
      >
        Dismiss
      </button>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "relative",
          transform: `translateX(${offset}px)`,
          transition:
            dragging || prefersReducedMotion
              ? "none"
              : "transform var(--duration-base) var(--ease-theatre)",
          // Vertical scrolling still belongs to the page; the horizontal axis
          // is the card's, which is what keeps the pager from paging mid-swipe.
          touchAction: "pan-y",
          background: "var(--ink-02)",
          borderLeft: `2px solid ${tone.rule}`,
          borderRadius: "var(--radius-flat)",
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (draggedRef.current) return
            if (hasDetail) setExpanded((value) => !value)
          }}
          aria-expanded={hasDetail ? expanded : undefined}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            padding: "7px 10px",
            cursor: hasDetail ? "pointer" : "default",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
            <span
              style={{
                flexShrink: 0,
                fontFamily: "var(--font-label)",
                fontSize: "8px",
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: tone.pill,
                background: tone.tint,
                border: `1px solid ${tone.border}`,
                borderRadius: "var(--radius-flat)",
                padding: "2px 5px",
                lineHeight: 1.1,
              }}
            >
              {note.kind}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: "11px",
                fontWeight: 400,
                lineHeight: 1.35,
                color: "var(--ink-85)",
              }}
            >
              {note.body}
            </span>
            {hasDetail && (
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  fontFamily: "var(--font-label)",
                  fontSize: "9px",
                  color: "var(--ink-50)",
                  lineHeight: 1,
                  transform: expanded ? "rotate(180deg)" : "none",
                  transition: prefersReducedMotion
                    ? "none"
                    : "transform var(--duration-fast) var(--ease-theatre)",
                }}
              >
                ▾
              </span>
            )}
          </div>

          {hasDetail && expanded && (
            <div
              style={{
                marginTop: "6px",
                paddingTop: "6px",
                borderTop: "1px solid var(--ink-06)",
                fontSize: "10.5px",
                fontWeight: 400,
                lineHeight: 1.45,
                color: "var(--ink-50)",
              }}
            >
              {note.detail}
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * A stack of notes with the band label the rest of the app uses. Renders
 * nothing at all when there is nothing to say — no empty slot, no reserved
 * height, so an exercise with no notes looks exactly as it did before.
 */
export function CoachNoteList({
  notes,
  onDismiss,
  label,
  className,
  style,
}: {
  notes: CoachNote[]
  onDismiss: (noteId: string) => void | Promise<boolean | void>
  label?: string
  className?: string
  style?: React.CSSProperties
}) {
  if (notes.length === 0) return null

  return (
    <div className={className} style={style} data-testid="coach-notes">
      {label && (
        <div
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "9px",
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--ink-50)",
            marginBottom: "6px",
          }}
        >
          {label}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {notes.map((note) => (
          <CoachNoteCard key={note.id} note={note} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}
