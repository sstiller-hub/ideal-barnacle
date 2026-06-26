"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react"
import { GripVertical } from "lucide-react"

type ReorderExercise = {
  id: string
  name: string
  sets?: { completed?: boolean }[]
}

interface ReorderExercisesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exercises: ReorderExercise[]
  currentExerciseId?: string
  canSaveToRoutine: boolean
  onApply: (orderedExerciseIds: string[], saveToRoutine: boolean) => void
}

function isExerciseDone(exercise: ReorderExercise): boolean {
  const sets = exercise.sets
  if (!Array.isArray(sets) || sets.length === 0) return false
  return sets.every((set) => set?.completed)
}

function ReorderRow({
  exercise,
  index,
  isCurrent,
}: {
  exercise: ReorderExercise
  index: number
  isCurrent: boolean
}) {
  const controls = useDragControls()
  const done = isExerciseDone(exercise)
  const setCount = Array.isArray(exercise.sets) ? exercise.sets.length : 0

  return (
    <Reorder.Item
      value={exercise}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3"
      style={{
        listStyle: "none",
        background: isCurrent ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isCurrent ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: "10px",
        padding: "10px 12px",
        marginBottom: "8px",
      }}
      whileDrag={{
        scale: 1.02,
        background: "rgba(255,255,255,0.12)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="text-white/25"
        style={{ fontSize: "10px", fontWeight: 600, width: "16px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
      >
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="text-white/90"
          style={{ fontSize: "14px", fontWeight: 400, letterSpacing: "-0.01em", fontFamily: "'Bebas Neue', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {exercise.name}
        </div>
        <div
          className="text-white/30"
          style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.1em", marginTop: "2px", fontFamily: "'Archivo Narrow', sans-serif" }}
        >
          {setCount} SET{setCount !== 1 ? "S" : ""}
          {isCurrent ? " • CURRENT" : done ? " • DONE" : ""}
        </div>
      </div>
      {/* Drag handle — pointer down here starts the reorder */}
      <button
        type="button"
        aria-label={`Drag to reorder ${exercise.name}`}
        onPointerDown={(event) => controls.start(event)}
        style={{ flexShrink: 0, background: "transparent", border: "none", padding: "4px", touchAction: "none", cursor: "grab" }}
      >
        <GripVertical size={18} strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.35)" }} />
      </button>
    </Reorder.Item>
  )
}

export function ReorderExercisesSheet({
  open,
  onOpenChange,
  exercises,
  currentExerciseId,
  canSaveToRoutine,
  onApply,
}: ReorderExercisesSheetProps) {
  const [order, setOrder] = useState<ReorderExercise[]>(exercises)
  const [saveToRoutine, setSaveToRoutine] = useState(false)

  // Re-seed the local draft order each time the sheet opens so it always
  // reflects the live exercise list (and discards any un-applied dragging).
  useEffect(() => {
    if (open) {
      setOrder(exercises)
      setSaveToRoutine(false)
    }
  }, [open, exercises])

  const handleApply = () => {
    onApply(
      order.map((exercise) => exercise.id),
      canSaveToRoutine && saveToRoutine,
    )
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="reorder-overlay"
          className="fixed inset-0 z-[80] flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            key="reorder-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "#141417",
              borderTopLeftRadius: "20px",
              borderTopRightRadius: "20px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {/* Grabber */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: "10px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.15)" }} />
            </div>

            {/* Title */}
            <div style={{ padding: "12px 20px 8px" }}>
              <h2
                className="text-white/95"
                style={{ fontSize: "22px", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "'Bebas Neue', sans-serif" }}
              >
                Reorder Exercises
              </h2>
              <div
                className="text-white/30"
                style={{ fontSize: "7px", fontWeight: 500, letterSpacing: "0.1em", marginTop: "4px", fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                DRAG THE HANDLE TO CHANGE THE ORDER
              </div>
            </div>

            {/* Draggable list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 4px" }}>
              <Reorder.Group axis="y" values={order} onReorder={setOrder} style={{ margin: 0, padding: 0 }}>
                {order.map((exercise, index) => (
                  <ReorderRow
                    key={exercise.id}
                    exercise={exercise}
                    index={index}
                    isCurrent={exercise.id === currentExerciseId}
                  />
                ))}
              </Reorder.Group>
            </div>

            {/* Save-to-routine toggle */}
            {canSaveToRoutine ? (
              <button
                type="button"
                onClick={() => setSaveToRoutine((value) => !value)}
                className="flex items-center justify-between"
                style={{ margin: "4px 20px 12px", padding: "10px 0", background: "transparent", border: "none", width: "calc(100% - 40px)" }}
              >
                <div style={{ textAlign: "left" }}>
                  <div className="text-white/80" style={{ fontSize: "12px", fontWeight: 500 }}>
                    Save order to my routine
                  </div>
                  <div className="text-white/30" style={{ fontSize: "10px", fontWeight: 400, marginTop: "2px" }}>
                    Use this order for future workouts
                  </div>
                </div>
                <div
                  aria-hidden
                  style={{
                    width: "40px",
                    height: "22px",
                    borderRadius: "11px",
                    background: saveToRoutine ? "#fff" : "rgba(255,255,255,0.12)",
                    position: "relative",
                    flexShrink: 0,
                    transition: "background 0.2s",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "2px",
                      left: saveToRoutine ? "20px" : "2px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: saveToRoutine ? "#000" : "rgba(255,255,255,0.6)",
                      transition: "left 0.2s, background 0.2s",
                    }}
                  />
                </div>
              </button>
            ) : null}

            {/* Actions */}
            <div style={{ display: "flex", gap: "10px", padding: "0 20px" }}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  background: "rgba(255,255,255,0.06)",
                  border: "none",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleApply}
                style={{
                  flex: 2,
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#fff",
                  border: "none",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#000",
                }}
              >
                APPLY ORDER
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
