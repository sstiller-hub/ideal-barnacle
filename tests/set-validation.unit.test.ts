import test from "node:test"
import assert from "node:assert/strict"
import {
  REP_MIN,
  REP_MAX,
  parseNumber,
  isValidNumber,
  isMissingReps,
  isMissingWeight,
  getMissingFlags,
  getValidationFlags,
  isSetIncomplete,
  isIncomplete,
  isStatInvalid,
  isSetEligibleForStats,
  parseTargetReps,
  parseTargetWeight,
  getSetFlags,
  getDefaultSetValues,
} from "../lib/set-validation"

// ---------------------------------------------------------------------------
// parseNumber
// ---------------------------------------------------------------------------

test("parseNumber returns null for null and undefined", () => {
  assert.equal(parseNumber(null), null)
  assert.equal(parseNumber(undefined), null)
})

test("parseNumber returns null for NaN and blank strings", () => {
  assert.equal(parseNumber(NaN), null)
  assert.equal(parseNumber(""), null)
  assert.equal(parseNumber("   "), null)
})

test("parseNumber coerces valid numeric strings", () => {
  assert.equal(parseNumber("42"), 42)
  assert.equal(parseNumber("  7.5  "), 7.5)
  assert.equal(parseNumber("0"), 0)
})

test("parseNumber passes through numbers and rejects non-numeric strings", () => {
  assert.equal(parseNumber(100), 100)
  assert.equal(parseNumber("abc"), null)
})

// ---------------------------------------------------------------------------
// isValidNumber
// ---------------------------------------------------------------------------

test("isValidNumber returns true only for finite numbers", () => {
  assert.equal(isValidNumber(5), true)
  assert.equal(isValidNumber(0), true)
  assert.equal(isValidNumber(NaN), false)
  assert.equal(isValidNumber("5" as unknown as number), false)
})

// ---------------------------------------------------------------------------
// isMissingReps
// ---------------------------------------------------------------------------

test("isMissingReps flags null, undefined, and NaN", () => {
  assert.equal(isMissingReps(null), true)
  assert.equal(isMissingReps(undefined), true)
  assert.equal(isMissingReps(NaN), true)
})

test("isMissingReps flags values below REP_MIN", () => {
  assert.equal(isMissingReps(0), true)
  assert.equal(isMissingReps(REP_MIN - 1), true)
})

test("isMissingReps accepts REP_MIN and above", () => {
  assert.equal(isMissingReps(REP_MIN), false)
  assert.equal(isMissingReps(10), false)
})

// ---------------------------------------------------------------------------
// isMissingWeight
// ---------------------------------------------------------------------------

test("isMissingWeight flags null, undefined, and NaN", () => {
  assert.equal(isMissingWeight(null), true)
  assert.equal(isMissingWeight(undefined), true)
  assert.equal(isMissingWeight(NaN), true)
})

test("isMissingWeight accepts zero and any finite number", () => {
  assert.equal(isMissingWeight(0), false)
  assert.equal(isMissingWeight(135), false)
  // Negative is unusual (bodyweight assistance) but not structurally "missing"
  assert.equal(isMissingWeight(-10), false)
})

// ---------------------------------------------------------------------------
// getMissingFlags
// ---------------------------------------------------------------------------

test("getMissingFlags returns both flags when both are missing", () => {
  assert.deepEqual(getMissingFlags(null, null), ["missing_reps", "missing_weight"])
})

test("getMissingFlags returns only the relevant flag", () => {
  assert.deepEqual(getMissingFlags(8, null), ["missing_weight"])
  assert.deepEqual(getMissingFlags(null, 135), ["missing_reps"])
  assert.deepEqual(getMissingFlags(8, 135), [])
})

// ---------------------------------------------------------------------------
// getValidationFlags
// ---------------------------------------------------------------------------

test("getValidationFlags includes reps_hard_invalid when reps exceed bounds", () => {
  const overMax = getValidationFlags({ reps: REP_MAX + 1, weight: 100 })
  assert.ok(overMax.includes("reps_hard_invalid"))

  const atMax = getValidationFlags({ reps: REP_MAX, weight: 100 })
  assert.ok(!atMax.includes("reps_hard_invalid"))
})

test("getValidationFlags includes rep_outlier when isOutlier is set", () => {
  const flags = getValidationFlags({ reps: 8, weight: 100, isOutlier: true })
  assert.ok(flags.includes("rep_outlier"))
})

test("getValidationFlags includes both missing_reps and reps_hard_invalid for reps=0", () => {
  // 0 is a valid number so the out-of-bounds check fires, producing both flags
  const flags = getValidationFlags({ reps: 0, weight: 100 })
  assert.ok(flags.includes("missing_reps"))
  assert.ok(flags.includes("reps_hard_invalid"))
})

// ---------------------------------------------------------------------------
// isSetIncomplete
// ---------------------------------------------------------------------------

test("isSetIncomplete returns false when both values are present", () => {
  assert.equal(isSetIncomplete({ reps: 8, weight: 100 }), false)
})

test("isSetIncomplete returns true when reps or weight is missing", () => {
  assert.equal(isSetIncomplete({ reps: null, weight: 100 }), true)
  assert.equal(isSetIncomplete({ reps: 8, weight: null }), true)
})

// ---------------------------------------------------------------------------
// isIncomplete / isStatInvalid
// ---------------------------------------------------------------------------

test("isIncomplete detects missing_reps and missing_weight flags", () => {
  assert.equal(isIncomplete([]), false)
  assert.equal(isIncomplete(["missing_reps"]), true)
  assert.equal(isIncomplete(["missing_weight"]), true)
})

test("isStatInvalid detects any disqualifying flag", () => {
  assert.equal(isStatInvalid([]), false)
  assert.equal(isStatInvalid(["reps_hard_invalid"]), true)
  assert.equal(isStatInvalid(["rep_outlier"]), true)
  assert.equal(isStatInvalid(["missing_weight"]), true)
})

// ---------------------------------------------------------------------------
// isSetEligibleForStats
// ---------------------------------------------------------------------------

test("isSetEligibleForStats requires completed=true", () => {
  assert.equal(isSetEligibleForStats({ reps: 8, weight: 100, completed: false }), false)
  assert.equal(isSetEligibleForStats({ reps: 8, weight: 100, completed: true }), true)
})

test("isSetEligibleForStats rejects null reps or weight", () => {
  assert.equal(isSetEligibleForStats({ reps: null, weight: 100, completed: true }), false)
  assert.equal(isSetEligibleForStats({ reps: 8, weight: null, completed: true }), false)
})

test("isSetEligibleForStats rejects sets with disqualifying validationFlags", () => {
  assert.equal(
    isSetEligibleForStats({ reps: 8, weight: 100, completed: true, validationFlags: ["rep_outlier"] }),
    false,
  )
  assert.equal(
    isSetEligibleForStats({ reps: 8, weight: 100, completed: true, validationFlags: ["reps_hard_invalid"] }),
    false,
  )
})

test("isSetEligibleForStats accepts a set with an empty validationFlags array", () => {
  assert.equal(isSetEligibleForStats({ reps: 8, weight: 100, completed: true, validationFlags: [] }), true)
})

// ---------------------------------------------------------------------------
// parseTargetReps
// ---------------------------------------------------------------------------

test("parseTargetReps returns null for undefined/empty", () => {
  assert.equal(parseTargetReps(undefined), null)
  assert.equal(parseTargetReps(""), null)
})

test("parseTargetReps parses a range string", () => {
  const result = parseTargetReps("8-12")
  assert.ok(result)
  assert.equal(result.min, 8)
  assert.equal(result.max, 12)
  assert.equal(result.suggested, 10) // round((8+12)/2)
})

test("parseTargetReps parses a single value", () => {
  const result = parseTargetReps("10")
  assert.ok(result)
  assert.equal(result.min, 10)
  assert.equal(result.max, 10)
  assert.equal(result.suggested, 10)
})

test("parseTargetReps parses NxN notation extracting both numbers", () => {
  const result = parseTargetReps("3x10")
  assert.ok(result)
  assert.equal(result.min, 3)
  assert.equal(result.max, 10)
})

test("parseTargetReps returns null for non-numeric strings", () => {
  assert.equal(parseTargetReps("AMRAP"), null)
})

// ---------------------------------------------------------------------------
// parseTargetWeight
// ---------------------------------------------------------------------------

test("parseTargetWeight returns null for undefined and empty string", () => {
  assert.equal(parseTargetWeight(undefined), null)
  assert.equal(parseTargetWeight(""), null)
})

test("parseTargetWeight extracts leading number from string", () => {
  assert.equal(parseTargetWeight("135"), 135)
  assert.equal(parseTargetWeight("100.5lbs"), 100.5)
})

test("parseTargetWeight returns null for non-numeric strings", () => {
  assert.equal(parseTargetWeight("bodyweight"), null)
})

// ---------------------------------------------------------------------------
// getSetFlags — outlier detection
// ---------------------------------------------------------------------------

test("getSetFlags returns no flags for a clean set", () => {
  const result = getSetFlags({ reps: 8, weight: 100 })
  assert.deepEqual(result.flags, [])
  assert.equal(result.isIncomplete, false)
  assert.equal(result.isHardInvalid, false)
  assert.equal(result.suggestedReps, undefined)
})

test("getSetFlags detects outlier via history median (reps >= 2x median)", () => {
  // History of [10,10,10,10] → median = 10; reps=20 triggers outlier
  const result = getSetFlags({ reps: 20, weight: 100, historyReps: [10, 10, 10, 10] })
  assert.ok(result.flags.includes("rep_outlier"))
  assert.equal(result.suggestedReps, 10)
})

test("getSetFlags does not flag reps just below the 2x threshold", () => {
  // median=10; reps=19 < 20 → no outlier
  const result = getSetFlags({ reps: 19, weight: 100, historyReps: [10, 10, 10, 10] })
  assert.ok(!result.flags.includes("rep_outlier"))
})

test("getSetFlags detects outlier via target range (reps > max + 10)", () => {
  // targetReps "8-12" → max=12; reps=23 > 22 → outlier; suggested = round((8+12)/2) = 10
  const result = getSetFlags({ reps: 23, weight: 100, targetReps: "8-12" })
  assert.ok(result.flags.includes("rep_outlier"))
  assert.equal(result.suggestedReps, 10)
})

test("getSetFlags marks reps_hard_invalid when reps exceed REP_MAX", () => {
  const result = getSetFlags({ reps: REP_MAX + 1, weight: 100 })
  assert.ok(result.flags.includes("reps_hard_invalid"))
  assert.equal(result.isHardInvalid, true)
  // Hard invalid prevents outlier check
  assert.ok(!result.flags.includes("rep_outlier"))
})

test("getSetFlags returns missing_reps when reps is null", () => {
  const result = getSetFlags({ reps: null, weight: 100 })
  assert.ok(result.flags.includes("missing_reps"))
  assert.equal(result.isIncomplete, true)
})

// ---------------------------------------------------------------------------
// getDefaultSetValues
// ---------------------------------------------------------------------------

test("getDefaultSetValues returns the last eligible completed set values", () => {
  const sets = [
    { reps: 8, weight: 135, completed: true },
    { reps: 10, weight: 145, completed: true },
    { reps: 6, weight: 150, completed: false },
  ]
  const result = getDefaultSetValues({ sets })
  assert.equal(result.reps, 10)
  assert.equal(result.weight, 145)
})

test("getDefaultSetValues falls back to target when no completed sets", () => {
  const result = getDefaultSetValues({ sets: [], targetReps: "8-12", targetWeight: "135" })
  assert.equal(result.reps, 10) // round((8+12)/2)
  assert.equal(result.weight, 135)
})

test("getDefaultSetValues returns nulls when no data available", () => {
  const result = getDefaultSetValues({ sets: [] })
  assert.equal(result.reps, null)
  assert.equal(result.weight, null)
})
