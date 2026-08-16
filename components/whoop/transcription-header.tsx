import { X } from "lucide-react"

type TranscriptionHeaderProps = {
  workoutName: string
  exerciseOrdinal: number
  exerciseTotal: number
  checkedSets: number
  totalSets: number
  onClose: () => void
}

export default function TranscriptionHeader({
  workoutName,
  exerciseOrdinal,
  exerciseTotal,
  checkedSets,
  totalSets,
  onClose,
}: TranscriptionHeaderProps) {
  const progress = totalSets > 0 ? (checkedSets / totalSets) * 100 : 0

  return (
    <div
      className="sticky top-0 z-10"
      style={{ background: "rgba(10, 10, 12, 0.92)", backdropFilter: "blur(8px)" }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-2 flex items-start justify-between gap-4">
        <div>
          <p
            className="text-ink-35"
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Log to Whoop
          </p>
          <p className="text-ink-70" style={{ fontSize: "13px", letterSpacing: "0.02em" }}>
            {workoutName}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className="text-ink-40"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {exerciseOrdinal}/{exerciseTotal}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-40 hover:text-ink-70 transition-colors duration-base"
            style={{ background: "transparent", border: "none", padding: "4px", cursor: "pointer" }}
            aria-label="Close Whoop transcription"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div
        style={{ height: "2px", background: "var(--ink-06)" }}
        role="progressbar"
        aria-valuenow={checkedSets}
        aria-valuemin={0}
        aria-valuemax={totalSets}
        aria-label="Sets entered into Whoop"
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "var(--ink-70)",
            transition: "width 180ms ease",
          }}
        />
      </div>
    </div>
  )
}
