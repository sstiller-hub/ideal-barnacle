import type { TranscriptionSet } from "@/lib/whoop-transcription"

type SetRowProps = {
  set: TranscriptionSet
  ordinal: number
  checked: boolean
  onToggle: () => void
}

// Full-width, ≥56px tap target: this gets used one-handed, standing up, with
// the other app half of your attention.
export default function SetRow({ set, ordinal, checked, onToggle }: SetRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={`Set ${ordinal}, ${set.weight} pounds by ${set.reps} reps`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        width: "100%",
        minHeight: "60px",
        padding: "0 16px",
        background: checked ? "var(--ink-02)" : "var(--ink-04)",
        border: `1px solid ${checked ? "var(--ink-06)" : "var(--ink-12)"}`,
        borderRadius: "10px",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 140ms ease, border-color 140ms ease, opacity 140ms ease",
        opacity: checked ? 0.42 : 1,
      }}
    >
      <span
        className="text-ink-30"
        style={{
          fontFamily: "var(--font-label)",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.16em",
          minWidth: "20px",
        }}
      >
        {ordinal}
      </span>
      <span
        className={checked ? "text-ink-50" : "text-ink-95"}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "28px",
          fontWeight: 500,
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
          textDecoration: checked ? "line-through" : "none",
        }}
      >
        {set.weight} × {set.reps}
      </span>
      {set.flagged && (
        <span
          title="Flagged during logging — verify before entering"
          aria-label="Flagged during logging"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--warn)",
            marginLeft: "auto",
          }}
        />
      )}
    </button>
  )
}
