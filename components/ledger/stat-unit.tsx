type StatUnitProps = {
  value: string
  unit?: string
  label: string
  size?: "md" | "sm"
}

// Every headline number on a screen speaks in this one voice: Bebas numeral,
// small inline unit, condensed cap underneath.
export function StatUnit({ value, unit, label, size = "md" }: StatUnitProps) {
  const isSm = size === "sm"

  return (
    <div>
      <div style={{ lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: isSm ? "21px" : "34px",
            lineHeight: 1,
            color: "var(--ink-95)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: isSm ? "10px" : "12px",
              color: "var(--ink-30)",
              letterSpacing: "0.06em",
              marginLeft: "3px",
            }}
          >
            {unit}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-label)",
          fontSize: isSm ? "7px" : "8px",
          fontWeight: 600,
          letterSpacing: "0.16em",
          color: "var(--ink-30)",
          textTransform: "uppercase",
          marginTop: isSm ? "4px" : "5px",
        }}
      >
        {label}
      </div>
    </div>
  )
}
