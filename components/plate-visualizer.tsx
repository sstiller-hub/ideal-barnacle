"use client"

import { computePlates, formatPlateText } from "@/lib/plate-calculator"

type PlateVisualizerProps = {
  targetWeight: number
}

export default function PlateVisualizer({ targetWeight }: PlateVisualizerProps) {
  const breakdown = computePlates(targetWeight)

  if (!targetWeight || targetWeight <= 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground">Plates per side</p>
        <p className="text-[10px] text-muted-foreground">Enter weight to see plates</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">Plates per side</p>

      {/* Visual plate stack */}
      <div className="relative h-8 flex items-center overflow-x-auto">
        <div className="absolute left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-400 via-zinc-300 to-zinc-400 rounded-full opacity-80" />

        {/* Bar collar */}
        <div className="absolute left-1.5 h-2 w-0.5 bg-zinc-600 rounded-sm z-10" />

        {breakdown.platesPerSide.length > 0 && (
          <div className="relative flex items-center gap-0.5 ml-3 z-20">
            {breakdown.platesPerSide.map((item, idx) =>
              Array.from({ length: item.count }).map((_, plateIdx) => (
                <div
                  key={`${idx}-${plateIdx}`}
                  className={`flex items-center justify-center rounded border ${item.plate.color}`}
                  style={{
                    height: `${Math.min(32, 12 + item.plate.weight * 0.45)}px`,
                    width: "10px",
                    borderColor: "rgba(0,0,0,0.1)",
                  }}
                >
                  <span
                    className="text-[6px] font-bold text-white"
                    style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                  >
                    {item.plate.label}
                  </span>
                </div>
              )),
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-medium text-foreground">
          {breakdown.platesPerSide.length === 0 ? "No plates" : formatPlateText(breakdown)}
        </span>
      </div>

      {/* Closest load note if not exact match */}
      {!breakdown.isExact && (
        <p className="text-[9px] text-muted-foreground">
          Closest: <span className="font-medium">{breakdown.achievableWeight} lb</span>
        </p>
      )}
    </div>
  )
}
