"use client"

type PlateCalculatorProps = {
  weightPerSide: number
  barWeight?: number
}

type Plate = {
  weight: number
  color: string
  label: string
}

const STANDARD_PLATES: Plate[] = [
  { weight: 45, color: "bg-red-500", label: "45" },
  { weight: 35, color: "bg-yellow-500", label: "35" },
  { weight: 25, color: "bg-green-500", label: "25" },
  { weight: 10, color: "bg-blue-500", label: "10" },
  { weight: 5, color: "bg-gray-400", label: "5" },
  { weight: 2.5, color: "bg-gray-300", label: "2.5" },
]

function calculatePlatesForWeight(weight: number): { plate: Plate; count: number }[] {
  let remaining = weight
  const platesNeeded: { plate: Plate; count: number }[] = []

  for (const plate of STANDARD_PLATES) {
    const count = Math.floor(remaining / plate.weight)
    if (count > 0) {
      platesNeeded.push({ plate, count })
      remaining -= count * plate.weight
    }
  }

  return platesNeeded
}

export default function PlateCalculator({ weightPerSide, barWeight = 45 }: PlateCalculatorProps) {
  console.log("[v0] PlateCalculator rendered - weightPerSide:", weightPerSide, "type:", typeof weightPerSide)

  if (!weightPerSide || isNaN(weightPerSide) || weightPerSide <= 0) {
    console.log("[v0] PlateCalculator returning null - invalid weight")
    return null
  }

  const plates = calculatePlatesForWeight(weightPerSide)
  console.log("[v0] Plates calculated:", plates)

  if (plates.length === 0) {
    console.log("[v0] PlateCalculator returning null - no plates needed")
    return null
  }

  return (
    <div className="p-3 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">Plates Per Side</p>
        <p className="text-[10px] text-muted-foreground">Bar: {barWeight} lbs</p>
      </div>

      <div className="relative h-12 flex items-center overflow-x-auto">
        {/* Bar sleeve */}
        <div className="absolute left-0 right-0 h-2.5 bg-gradient-to-r from-zinc-400 via-zinc-300 to-zinc-400 rounded-full shadow-sm" />

        {/* Bar collar */}
        <div className="absolute left-3 h-3.5 w-1.5 bg-zinc-700 rounded-sm z-10" />

        {/* Plates stacked on the bar */}
        <div className="relative flex items-center gap-0.5 ml-5 z-20">
          {plates.map((item, idx) =>
            Array.from({ length: item.count }).map((_, plateIdx) => (
              <div
                key={`${idx}-${plateIdx}`}
                className={`relative flex items-center justify-center rounded-sm shadow-md border border-black/20 ${item.plate.color}`}
                style={{
                  height: `${Math.min(44, 16 + item.plate.weight * 0.6)}px`,
                  width: "14px",
                }}
              >
                <span
                  className="text-[7px] font-bold text-white writing-mode-vertical"
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                >
                  {item.plate.label}
                </span>
              </div>
            )),
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {plates.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1.5 px-1.5 py-0.5 bg-card rounded border border-border">
            <div className={`w-5 h-5 rounded ${item.plate.color} flex items-center justify-center`}>
              <span className="text-[9px] font-bold text-white">{item.plate.label}</span>
            </div>
            <span className="text-[10px] font-medium text-foreground">× {item.count}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Each side:</span>
        <span className="font-bold text-foreground">{weightPerSide} lbs</span>
      </div>
    </div>
  )
}
