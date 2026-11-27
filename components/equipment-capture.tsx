"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Camera, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  describeEquipment,
  getCachedEquipment,
  identifyEquipment,
  loadActiveEquipment,
  saveEquipment,
  type EquipmentRecord,
  type EquipmentScope,
  type EquipmentSuggestion,
} from "@/lib/equipment"

type Step =
  | { kind: "idle" }
  | { kind: "identifying" }
  | { kind: "confirm"; suggestion: EquipmentSuggestion }
  | { kind: "saving"; suggestion: EquipmentSuggestion }

const LABEL_STYLE = {
  fontFamily: "var(--font-label)",
  fontSize: "8px",
  fontWeight: 500,
  letterSpacing: "0.1em",
} as const

/**
 * The equipment chip on an exercise page. Tap → sheet → photo → Claude's
 * suggestion → the user confirms (or edits) it and picks "Keep using" or
 * "Today only". Nothing is saved without that confirmation.
 */
export function EquipmentChip({ exerciseName }: { exerciseName: string }) {
  const [active, setActive] = useState<EquipmentRecord | null>(() => getCachedEquipment(exerciseName))
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setActive(getCachedEquipment(exerciseName))
    void loadActiveEquipment(exerciseName).then((record) => {
      if (!cancelled) setActive(record)
    })
    return () => {
      cancelled = true
    }
  }, [exerciseName])

  const label = active ? describeEquipment(active) : "Equipment"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-target ios-chip transition-colors duration-150 flex items-center gap-1"
        aria-label={active ? `Equipment: ${label}${active.scope === "today" ? ", today only" : ""}` : "Add equipment photo"}
        style={{ padding: "5px 10px", fontSize: "13px", maxWidth: "150px" }}
        data-testid="equipment-chip"
      >
        <Camera size={13} aria-hidden style={{ flexShrink: 0 }} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {active?.scope === "today" && (
          <span className="text-ink-50" style={{ ...LABEL_STYLE, flexShrink: 0 }}>
            TODAY
          </span>
        )}
      </button>
      <EquipmentSheet
        open={open}
        onOpenChange={setOpen}
        exerciseName={exerciseName}
        active={active}
        onSaved={(record) => {
          setActive(record)
          setOpen(false)
        }}
      />
    </>
  )
}

function EquipmentSheet({
  open,
  onOpenChange,
  exerciseName,
  active,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exerciseName: string
  active: EquipmentRecord | null
  onSaved: (record: EquipmentRecord) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const [name, setName] = useState("")
  const [scope, setScope] = useState<EquipmentScope>("standing")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStep({ kind: "idle" })
      setError(null)
      setScope("standing")
    }
  }, [open])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setStep({ kind: "identifying" })
    try {
      const suggestion = await identifyEquipment(file, exerciseName)
      setName(suggestion.equipment_name)
      setStep({ kind: "confirm", suggestion })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not identify the equipment.")
      setStep({ kind: "idle" })
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleSave = async () => {
    if (step.kind !== "confirm" || !name.trim()) return
    const { suggestion } = step
    setStep({ kind: "saving", suggestion })
    try {
      const edited = name.trim() !== suggestion.equipment_name.trim()
      const record = await saveEquipment({
        exerciseName,
        equipmentName: name,
        brand: suggestion.brand,
        equipmentType: suggestion.equipment_type,
        notes: suggestion.notes,
        scope,
        identifiedBy: edited ? "manual" : "claude",
      })
      toast.success(scope === "today" ? "Equipment set for today" : "Equipment saved")
      onSaved(record)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save equipment.")
      setStep({ kind: "confirm", suggestion })
    }
  }

  const busy = step.kind === "identifying" || step.kind === "saving"

  // Portaled to <body>: the exercise page is a scroll container inside the
  // carousel, which would clip a fixed overlay on iOS.
  if (typeof document === "undefined") return null
  return createPortal(
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
          onClick={() => !busy && onOpenChange(false)}
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
              padding: "10px 20px calc(16px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "var(--radius-flat)", background: "var(--ink-15)" }} />
            </div>

            <h2
              className="text-ink-95"
              style={{ fontSize: "22px", fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1, fontFamily: "var(--font-display)", marginTop: "12px" }}
            >
              Equipment
            </h2>
            <div className="text-ink-50" style={{ ...LABEL_STYLE, marginTop: "4px", textTransform: "uppercase" }}>
              {exerciseName}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => void handleFile(event.target.files?.[0])}
              data-testid="equipment-file-input"
            />

            {(step.kind === "idle" || step.kind === "identifying") && (
              <>
                <div
                  style={{
                    marginTop: "16px",
                    background: "var(--ink-04)",
                    border: "1px solid var(--ink-06)",
                    borderRadius: "var(--radius-ios)",
                    padding: "12px",
                  }}
                >
                  <div className="text-ink-50" style={LABEL_STYLE}>
                    {active ? (active.scope === "today" ? "USING TODAY ONLY" : "USING") : "NO EQUIPMENT SAVED"}
                  </div>
                  <div className="text-ink-90" style={{ fontSize: "15px", marginTop: "4px" }}>
                    {active ? describeEquipment(active) : "Take a photo of the equipment you're using."}
                  </div>
                  {active?.notes && (
                    <div className="text-ink-50" style={{ fontSize: "11px", marginTop: "4px" }}>
                      {active.notes}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="tap-target flex items-center justify-center gap-2 w-full"
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    borderRadius: "var(--radius-ios)",
                    background: "#fff",
                    color: "#000",
                    fontSize: "14px",
                    fontWeight: 600,
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {step.kind === "identifying" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden /> Identifying…
                    </>
                  ) : (
                    <>
                      <Camera size={16} aria-hidden /> {active ? "New photo" : "Take photo"}
                    </>
                  )}
                </button>
              </>
            )}

            {(step.kind === "confirm" || step.kind === "saving") && (
              <div style={{ marginTop: "16px" }}>
                <label className="text-ink-50" style={LABEL_STYLE} htmlFor="equipment-name">
                  {step.suggestion.identified ? "LOOKS LIKE — EDIT IF WRONG" : "NOT SURE THIS IS EQUIPMENT — NAME IT"}
                </label>
                <input
                  id="equipment-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full text-ink-95"
                  style={{
                    marginTop: "6px",
                    padding: "10px 12px",
                    fontSize: "16px",
                    background: "var(--ink-04)",
                    border: "1px solid var(--ink-12)",
                    borderRadius: "var(--radius-ios)",
                  }}
                />
                {(step.suggestion.brand || step.suggestion.equipment_type) && (
                  <div className="text-ink-50" style={{ fontSize: "11px", marginTop: "6px" }}>
                    {[step.suggestion.brand, step.suggestion.equipment_type].filter(Boolean).join(" · ")}
                  </div>
                )}
                {step.suggestion.notes && (
                  <div className="text-ink-50" style={{ fontSize: "11px", marginTop: "2px" }}>
                    {step.suggestion.notes}
                  </div>
                )}

                <div
                  role="radiogroup"
                  aria-label="How long to use this equipment"
                  className="grid grid-cols-2 gap-2"
                  style={{ marginTop: "14px" }}
                >
                  {(
                    [
                      { value: "standing", title: "Keep using", sub: "Until a new photo" },
                      { value: "today", title: "Today only", sub: "Back to usual tomorrow" },
                    ] as const
                  ).map((option) => {
                    const selected = scope === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setScope(option.value)}
                        className="tap-target"
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-ios)",
                          background: selected ? "var(--ink-12)" : "var(--ink-04)",
                          border: `1px solid ${selected ? "var(--ink-50)" : "var(--ink-08)"}`,
                        }}
                      >
                        <div className="text-ink-90" style={{ fontSize: "13px", fontWeight: 500 }}>
                          {option.title}
                        </div>
                        <div className="text-ink-50" style={{ fontSize: "10px", marginTop: "2px" }}>
                          {option.sub}
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2" style={{ marginTop: "14px" }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="tap-target text-ink-85"
                    style={{ padding: "12px", borderRadius: "var(--radius-ios)", background: "var(--ink-08)", fontSize: "14px" }}
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    disabled={busy || !name.trim()}
                    onClick={() => void handleSave()}
                    className="tap-target flex items-center justify-center gap-2"
                    style={{
                      padding: "12px",
                      borderRadius: "var(--radius-ios)",
                      background: "#fff",
                      color: "#000",
                      fontSize: "14px",
                      fontWeight: 600,
                      opacity: busy || !name.trim() ? 0.6 : 1,
                    }}
                  >
                    {step.kind === "saving" && <Loader2 size={16} className="animate-spin" aria-hidden />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" style={{ marginTop: "10px", fontSize: "12px", color: "#ff6b6b" }}>
                {error}
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
