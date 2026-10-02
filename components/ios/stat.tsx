/** Display numeral over a 13pt label — the stat cell of a session band. */
export function IosStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "34px",
          lineHeight: 1,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "13px", color: "var(--ink-50)", marginTop: "6px" }}>{label}</div>
    </div>
  )
}
