"use client"

import type React from "react"
import { useRef, useState } from "react"

const ACTION_WIDTH = 84

/**
 * iOS swipe-to-delete. Dragging left reveals a Delete action behind the row;
 * releasing past halfway latches it open, otherwise the row springs back.
 *
 * The delete affordance used to be an always-visible ✕ on every card, which
 * put a destructive control in the reading path of the whole list. Hiding it
 * behind a deliberate gesture keeps the list calm and the action hard to hit
 * by accident — but it also makes it invisible, so the row still exposes a
 * keyboard/screen-reader path via the always-present (visually offscreen)
 * delete button.
 */
export function IosSwipeToDelete({
  children,
  onDelete,
  deleteLabel = "Delete",
}: {
  children: React.ReactNode
  onDelete: () => void
  deleteLabel?: string
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startOffset = useRef(0)

  const onPointerDown = (event: React.PointerEvent) => {
    // Mouse users get the click-through row, not a drag.
    if (event.pointerType === "mouse") return
    startX.current = event.clientX
    startOffset.current = offset
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging) return
    const next = Math.min(0, Math.max(-ACTION_WIDTH, startOffset.current + (event.clientX - startX.current)))
    setOffset(next)
  }

  const onPointerUp = () => {
    if (!dragging) return
    setDragging(false)
    setOffset(offset < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0)
  }

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => {
          setOffset(0)
          onDelete()
        }}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: `${ACTION_WIDTH}px`,
          border: "none",
          background: "#3a1113",
          color: "#ff453a",
          fontSize: "15px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {deleteLabel}
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "relative",
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform var(--duration-base) var(--ease-theatre)",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  )
}
