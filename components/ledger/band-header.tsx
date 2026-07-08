import type { ReactNode } from "react"

type BandHeaderProps = {
  label: string
  children?: ReactNode
}

// Identical anatomy for every section: label + hairline + right slot
// (usually a DeltaChip).
export function BandHeader({ label, children }: BandHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
      <span
        style={{
          fontFamily: "var(--font-label)",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--ink-35)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--ink-08)" }} />
      {children}
    </div>
  )
}
