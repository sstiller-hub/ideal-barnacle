"use client"

import { useId } from "react"
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts"

type SparklineProps = {
  data: number[]
  height?: number
  live?: boolean
  // Absolute padding added below/above the data's min/max for the hidden Y
  // domain. Callers keep their historical padding (e.g. 5000 for weekly
  // volume, 15 for PR weight).
  domainPadding?: number
}

// The one chart spec: white-alpha area line, hairline baseline, quiet dots,
// bright endpoint. `live` overlays a pulse ring on the endpoint — a screen's
// single permanently-animated element. The white-alpha strokes in here are
// the design language's explicitly permitted rgba literals.
export function Sparkline({ data, height = 56, live = false, domainPadding }: SparklineProps) {
  const gradientId = useId()
  const series = data.length === 1 ? [data[0], data[0]] : data
  const points = series.map((value, index) => ({ index, value }))
  const showIntermediateDots = points.length <= 12

  return (
    <div style={{ position: "relative", height: `${height}px`, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.08)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.00)" />
            </linearGradient>
          </defs>
          <YAxis
            hide
            domain={
              domainPadding !== undefined
                ? [(dataMin: number) => dataMin - domainPadding, (dataMax: number) => dataMax + domainPadding]
                : ["auto", "auto"]
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="rgba(255, 255, 255, 0.30)"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, index } = props
              const safeCx = typeof cx === "number" ? cx : 0
              const safeCy = typeof cy === "number" ? cy : 0
              const isLast = index === points.length - 1
              if (!isLast && !showIntermediateDots) {
                return <g key={`spark-dot-${gradientId}-${index}`} />
              }
              if (!isLast) {
                return (
                  <circle
                    key={`spark-dot-${gradientId}-${index}`}
                    cx={safeCx}
                    cy={safeCy}
                    r={1.3}
                    fill="rgba(255, 255, 255, 0.22)"
                  />
                )
              }
              return (
                <g key={`spark-dot-${gradientId}-${index}`}>
                  {live && (
                    <circle
                      className="ledger-spark-pulse"
                      cx={safeCx}
                      cy={safeCy}
                      r={7}
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.35)"
                      strokeWidth={1}
                      style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    />
                  )}
                  <circle cx={safeCx} cy={safeCy} r={2.2} fill="rgba(255, 255, 255, 0.85)" />
                </g>
              )
            }}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "1px",
          background: "var(--ink-06)",
        }}
      />
      {live && (
        <style>{`
          @keyframes ledgerSparkPulse {
            from { transform: scale(0.4); opacity: 0.9; }
            to { transform: scale(1.5); opacity: 0; }
          }
          .ledger-spark-pulse {
            animation: ledgerSparkPulse 2.4s var(--ease-theatre) infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .ledger-spark-pulse {
              animation: none;
              opacity: 0;
            }
          }
        `}</style>
      )}
    </div>
  )
}
