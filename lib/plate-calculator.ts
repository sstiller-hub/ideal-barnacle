// Pure function to calculate plates needed per side

export type PlateConfig = {
  weight: number
  color: string
  label: string
}

export const STANDARD_PLATES_LBS: PlateConfig[] = [
  { weight: 45, color: "bg-red-500", label: "45" },
  { weight: 35, color: "bg-yellow-500", label: "35" },
  { weight: 25, color: "bg-green-500", label: "25" },
  { weight: 10, color: "bg-blue-500", label: "10" },
  { weight: 5, color: "bg-gray-400", label: "5" },
  { weight: 2.5, color: "bg-gray-300", label: "2.5" },
]

export type PlateBreakdown = {
  platesPerSide: { plate: PlateConfig; count: number }[]
  weightPerSide: number
  achievableWeight: number
  isExact: boolean
}

/**
 * Compute plates needed per side for a target plate load.
 * IMPORTANT: targetWeight represents TOTAL PLATES LOADED (not including bar).
 *
 * @param targetWeight - Total weight of plates to load (will be divided by 2 for per-side calculation)
 * @param availablePlates - Array of available plate configs (default standard Olympic plates)
 * @returns PlateBreakdown with plates per side and metadata
 *
 * @example
 * // For 90 lbs total plates (45 lbs per side):
 * computePlates(90) // Returns one 45 lb plate per side
 */
export function computePlates(
  targetWeight: number,
  availablePlates: PlateConfig[] = STANDARD_PLATES_LBS,
): PlateBreakdown {
  // Handle invalid or zero/negative inputs - return empty state
  if (!targetWeight || isNaN(targetWeight) || targetWeight <= 0) {
    return {
      platesPerSide: [],
      weightPerSide: 0,
      achievableWeight: 0,
      isExact: true,
    }
  }

  // Calculate target weight per side
  const targetPerSide = targetWeight / 2

  // Greedy algorithm: use largest plates first
  let remaining = targetPerSide
  const platesNeeded: { plate: PlateConfig; count: number }[] = []

  for (const plate of availablePlates) {
    const count = Math.floor(remaining / plate.weight)
    if (count > 0) {
      platesNeeded.push({ plate, count })
      remaining -= count * plate.weight
      remaining = Math.round(remaining * 100) / 100 // Avoid floating point errors
    }
  }

  // Calculate achieved weight per side
  const achievedPerSide =
    Math.round(platesNeeded.reduce((sum, item) => sum + item.plate.weight * item.count, 0) * 100) / 100

  // Total achievable weight (both sides combined)
  const achievableWeight = achievedPerSide * 2

  // Check if we achieved exact target (within 0.01 lb tolerance)
  const isExact = Math.abs(targetWeight - achievableWeight) < 0.01

  return {
    platesPerSide: platesNeeded,
    weightPerSide: achievedPerSide,
    achievableWeight,
    isExact,
  }
}

/**
 * Format plate breakdown as readable text
 * @param breakdown - PlateBreakdown result from computePlates
 * @returns Human-readable string like "45 + 25 + 10"
 */
export function formatPlateText(breakdown: PlateBreakdown): string {
  if (breakdown.platesPerSide.length === 0) {
    return "No plates"
  }

  return breakdown.platesPerSide.flatMap((item) => Array(item.count).fill(item.plate.label)).join(" + ")
}

/**
 * Compute plates needed per side for plate-loaded machines.
 * Updated for plate-loaded machines - targetWeight is the TOTAL load, split evenly between sides
 *
 * @param targetWeight - Total weight to load on the machine (will be divided by 2 for per-side calculation)
 * @param availablePlates - Array of available plate configs (default standard Olympic plates)
 * @returns PlateBreakdown with plates per side and metadata
 *
 * @example
 * // For 90 lbs total load on a plate-loaded machine:
 * computePlates(90) // Returns 45 lbs per side (e.g., one 45 lb plate on each side)
 */
export function computePlatesForMachine(
  targetWeight: number,
  availablePlates: PlateConfig[] = STANDARD_PLATES_LBS,
): PlateBreakdown {
  // Handle invalid or zero/negative inputs - return empty state
  if (!targetWeight || isNaN(targetWeight) || targetWeight <= 0) {
    return {
      platesPerSide: [],
      weightPerSide: 0,
      achievableWeight: 0,
      isExact: true,
    }
  }

  // Calculate target weight per side
  const targetPerSide = targetWeight / 2

  // Greedy algorithm: use largest plates first
  let remaining = targetPerSide
  const platesNeeded: { plate: PlateConfig; count: number }[] = []

  for (const plate of availablePlates) {
    const count = Math.floor(remaining / plate.weight)
    if (count > 0) {
      platesNeeded.push({ plate, count })
      remaining -= count * plate.weight
      remaining = Math.round(remaining * 100) / 100 // Avoid floating point errors
    }
  }

  // Calculate achieved weight per side
  const achievedPerSide =
    Math.round(platesNeeded.reduce((sum, item) => sum + item.plate.weight * item.count, 0) * 100) / 100

  // Total achievable weight (both sides combined)
  const achievableWeight = achievedPerSide * 2

  // Check if we achieved exact target (within 0.01 lb tolerance)
  const isExact = Math.abs(targetWeight - achievableWeight) < 0.01

  return {
    platesPerSide: platesNeeded,
    weightPerSide: achievedPerSide,
    achievableWeight,
    isExact,
  }
}
