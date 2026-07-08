type DeltaChipProps = {
  tone: "good" | "neutral"
  arrow?: "up" | "down"
  value: string
  pct?: string
  context?: string
  size?: "sm" | "md"
}

// The single comparison component (band headers, PR cards, session set rows).
// Tone rule: "good" only when the lifter beat something — a PR, a beaten
// session, a lift trending up. Everything else, including declines, is
// "neutral". There is no "bad" tone; the app records, it does not judge.
export function DeltaChip({ tone, arrow, value, pct, context, size = "md" }: DeltaChipProps) {
  const isGood = tone === "good"
  const isSm = size === "sm"

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        borderRadius: "var(--radius-flat)",
        whiteSpace: "nowrap",
        padding: isSm ? "2px 7px" : "3px 8px",
        fontFamily: "var(--font-label)",
        fontSize: isSm ? "8.5px" : "10px",
        fontWeight: 600,
        letterSpacing: "0.05em",
        fontVariantNumeric: "tabular-nums",
        color: isGood ? "var(--good-ink)" : "var(--ink-40)",
        background: isGood ? "var(--good-tint)" : "var(--ink-04)",
        border: isGood ? "1px solid rgba(52, 211, 153, 0.22)" : "1px solid var(--ink-08)",
      }}
    >
      {arrow && <span aria-hidden="true">{arrow === "up" ? "↑" : "↓"}</span>}
      <span>{value}</span>
      {pct && <span style={{ opacity: 0.65 }}>{pct}</span>}
      {context && <span style={{ opacity: 0.55, letterSpacing: "0.08em" }}>{context}</span>}
    </span>
  )
}
