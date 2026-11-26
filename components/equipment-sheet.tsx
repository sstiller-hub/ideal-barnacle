"use client"

import type React from "react"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  EQUIPMENT_KIND_LABELS,
  EQUIPMENT_NAME_MAX,
  type EquipmentIdentification,
  type EquipmentScope,
  type ExerciseEquipment,
} from "@/lib/equipment"
import { identifyEquipment, preparePhoto, type PreparedPhoto } from "@/lib/equipment-storage"

export type EquipmentSheetHandle = {
  /** Must be called from the tap handler itself so iOS opens the camera. */
  openCamera: () => void
  openManage: () => void
}

type Phase = "closed" | "manage" | "identifying" | "review"

type EquipmentSheetProps = {
  exerciseName: string | null
  current: { equipment: ExerciseEquipment; scope: EquipmentScope } | null
  /** Sticky equipment, shown as what comes back when today-only is cleared. */
  sticky: ExerciseEquipment | null
  onSave: (equipment: ExerciseEquipment, scope: EquipmentScope) => void
  onClearToday: () => void
  onRemoveSticky: () => void
}

const LABEL: React.CSSProperties = {
  fontFamily: "var(--font-label)",
  fontSize: "8px",
  fontWeight: 600,
  letterSpacing: "0.14em",
  color: "var(--ink-50)",
  textTransform: "uppercase",
}

const PRIMARY: React.CSSProperties = {
  flex: 2,
  padding: "12px",
  borderRadius: "var(--radius-ios)",
  background: "#fff",
  border: "none",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#000",
}

const SECONDARY: React.CSSProperties = {
  flex: 1,
  padding: "12px",
  borderRadius: "var(--radius-ios)",
  background: "var(--ink-08)",
  border: "none",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "rgba(255,255,255,0.85)",
}

const QUIET: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "10px 0",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--ink-50)",
  width: "100%",
}

function Thumb({ src }: { src: string | null }) {
  return (
    <div
      style={{
        width: "64px",
        height: "64px",
        flexShrink: 0,
        borderRadius: "12px",
        overflow: "hidden",
        background: "var(--ink-06)",
        border: "1px solid var(--ink-08)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Equipment photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
    </div>
  )
}

export const EquipmentSheet = forwardRef<EquipmentSheetHandle, EquipmentSheetProps>(function EquipmentSheet(
  { exerciseName, current, sticky, onSave, onClearToday, onRemoveSticky },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const runIdRef = useRef(0)
  const [phase, setPhase] = useState<Phase>("closed")
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [identification, setIdentification] = useState<EquipmentIdentification | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    runIdRef.current += 1
    setPhase("closed")
  }

  const openCamera = () => {
    if (!inputRef.current) return
    inputRef.current.value = ""
    inputRef.current.click()
  }

  useImperativeHandle(ref, () => ({
    openCamera,
    openManage: () => setPhase("manage"),
  }))

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !exerciseName) return
    const runId = ++runIdRef.current
    setPhoto(null)
    setIdentification(null)
    setNameDraft("")
    setError(null)
    setPhase("identifying")

    let prepared: PreparedPhoto
    try {
      prepared = await preparePhoto(file)
    } catch {
      if (runId !== runIdRef.current) return
      setError("Couldn't read that photo. Type the name instead.")
      setPhase("review")
      return
    }
    if (runId !== runIdRef.current) return
    setPhoto(prepared)

    const result = await identifyEquipment(prepared, exerciseName)
    if (runId !== runIdRef.current) return
    if (result.ok) {
      setIdentification(result.data)
      setNameDraft(result.data.name)
    } else {
      setError(result.error)
    }
    setPhase("review")
  }

  const save = (scope: EquipmentScope) => {
    const name = nameDraft.replace(/\s+/g, " ").trim().slice(0, EQUIPMENT_NAME_MAX)
    if (!name) return
    // A name the user retyped is theirs, not Claude's: keep Claude's brand and
    // kind only when the name still matches what Claude said.
    const edited = !identification || name !== identification.name
    onSave(
      {
        name,
        brand: edited ? null : identification!.brand,
        kind: edited ? "other" : identification!.kind,
        photo: photo?.thumbnail ?? null,
        setAt: new Date().toISOString(),
      },
      scope
    )
    close()
  }

  const open = phase !== "closed"
  const meta = identification
    ? [
        EQUIPMENT_KIND_LABELS[identification.kind],
        identification.brand,
        identification.confidence === "high" ? null : `${identification.confidence} confidence`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: "none" }}
        data-testid="equipment-photo-input"
      />
      <AnimatePresence>
        {open ? (
          <motion.div
            key="equipment-overlay"
            className="fixed inset-0 z-[80] flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={close}
          >
            <motion.div
              key="equipment-sheet"
              role="dialog"
              aria-label="Equipment"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              onClick={(event) => event.stopPropagation()}
              style={{
                background: "#141417",
                borderTopLeftRadius: "20px",
                borderTopRightRadius: "20px",
                borderTop: "1px solid var(--ink-08)",
                maxHeight: "85vh",
                overflowY: "auto",
                paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", paddingTop: "10px" }}>
                <div style={{ width: "36px", height: "4px", borderRadius: "var(--radius-flat)", background: "var(--ink-15)" }} />
              </div>

              <div style={{ padding: "12px 20px 4px" }}>
                <h2
                  className="text-ink-95"
                  style={{ fontSize: "22px", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "var(--font-display)" }}
                >
                  Equipment
                </h2>
                <div style={{ ...LABEL, marginTop: "4px" }}>{exerciseName}</div>
              </div>

              {phase === "identifying" ? (
                <div style={{ padding: "20px", display: "flex", alignItems: "center", gap: "14px" }}>
                  <Thumb src={photo?.thumbnail ?? null} />
                  <div className="text-ink-70" style={{ fontSize: "13px" }} aria-live="polite">
                    Identifying…
                  </div>
                </div>
              ) : null}

              {phase === "review" ? (
                <div style={{ padding: "16px 20px 0" }}>
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                    <Thumb src={photo?.thumbnail ?? null} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={LABEL}>Name</div>
                      <input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        maxLength={EQUIPMENT_NAME_MAX}
                        placeholder="e.g. Hammer Strength Iso-Lateral Row"
                        aria-label="Equipment name"
                        style={{
                          width: "100%",
                          marginTop: "6px",
                          padding: "9px 10px",
                          borderRadius: "10px",
                          border: "1px solid var(--ink-12)",
                          background: "var(--ink-04)",
                          color: "#fff",
                          fontSize: "16px",
                        }}
                      />
                      {meta ? (
                        <div className="text-ink-50" style={{ fontSize: "11px", marginTop: "6px" }}>
                          {meta}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {identification && !identification.matchesExercise ? (
                    <div style={{ fontSize: "12px", color: "#f5b971", marginTop: "12px" }}>
                      This doesn&apos;t look like equipment for {exerciseName}. Check the name before saving.
                    </div>
                  ) : null}
                  {identification?.note ? (
                    <div className="text-ink-70" style={{ fontSize: "12px", marginTop: "10px" }}>
                      {identification.note}
                    </div>
                  ) : null}
                  {error ? (
                    <div role="alert" style={{ fontSize: "12px", color: "#f5b971", marginTop: "12px" }}>
                      {error}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
                    <button type="button" style={SECONDARY} disabled={!nameDraft.trim()} onClick={() => save("today")}>
                      TODAY ONLY
                    </button>
                    <button
                      type="button"
                      style={{ ...PRIMARY, opacity: nameDraft.trim() ? 1 : 0.4 }}
                      disabled={!nameDraft.trim()}
                      onClick={() => save("sticky")}
                    >
                      USE FROM NOW ON
                    </button>
                  </div>
                  <button type="button" style={QUIET} onClick={openCamera}>
                    Retake photo
                  </button>
                </div>
              ) : null}

              {phase === "manage" ? (
                <div style={{ padding: "16px 20px 0" }}>
                  {current ? (
                    <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                      <Thumb src={current.equipment.photo} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="text-ink-95" style={{ fontSize: "16px" }}>
                          {current.equipment.name}
                        </div>
                        <div style={{ ...LABEL, marginTop: "4px" }}>
                          {current.scope === "today" ? "Today only" : "From now on"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-ink-70" style={{ fontSize: "13px" }}>
                      No equipment set for this exercise.
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
                    {current?.scope === "today" ? (
                      <button
                        type="button"
                        style={SECONDARY}
                        onClick={() => {
                          onClearToday()
                          close()
                        }}
                      >
                        {sticky ? "BACK TO SAVED" : "CLEAR"}
                      </button>
                    ) : current?.scope === "sticky" ? (
                      <button
                        type="button"
                        style={SECONDARY}
                        onClick={() => {
                          onRemoveSticky()
                          close()
                        }}
                      >
                        REMOVE
                      </button>
                    ) : null}
                    <button type="button" style={PRIMARY} onClick={openCamera}>
                      NEW PHOTO
                    </button>
                  </div>
                  {current?.scope === "today" && sticky ? (
                    <div className="text-ink-50" style={{ fontSize: "11px", marginTop: "10px" }}>
                      Saved equipment: {sticky.name}. It comes back next session.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
})
