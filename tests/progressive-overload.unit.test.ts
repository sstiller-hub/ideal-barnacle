import test from "node:test"
import assert from "node:assert/strict"
import {
  buildStallAlertContent,
  detectProgressStall,
  type ExerciseSessionInput,
} from "../lib/progressive-overload"

const DAY_MS = 24 * 60 * 60 * 1000
const BASE = Date.parse("2026-05-01T12:00:00.000Z")

function session(
  daysFromBase: number,
  sets: Array<[reps: number, weight: number]>,
  workoutId?: string
): ExerciseSessionInput {
  return {
    workoutId: workoutId ?? `w-${daysFromBase}`,
    performedAt: new Date(BASE + daysFromBase * DAY_MS).toISOString(),
    sets: sets.map(([reps, weight]) => ({ reps, weight, completed: true })),
  }
}

test("progressing exercise is not flagged", () => {
  const sessions = [
    session(0, [[8, 100]]),
    session(3, [[8, 105]]),
    session(6, [[8, 110]]),
    session(9, [[8, 115]]),
    session(12, [[8, 120]]),
  ]
  assert.equal(detectProgressStall(sessions), null)
})

test("adding weight while dropping reps is progress, not a decline", () => {
  // The user's style: climb in load, shed reps. e1RM would wobble down here,
  // but every session adds weight, so nothing should be flagged.
  const sessions = [
    session(0, [[12, 100]]),
    session(3, [[10, 110]]),
    session(6, [[8, 120]]),
    session(9, [[6, 130]]),
    session(12, [[5, 140]]),
  ]
  assert.equal(detectProgressStall(sessions), null)
})

test("double progression: building reps at a fixed weight is progress", () => {
  // Same weight, +1 rep each session until the top of the range.
  const sessions = [
    session(0, [[6, 120]]),
    session(3, [[7, 120]]),
    session(6, [[8, 120]]),
    session(9, [[9, 120]]),
    session(12, [[10, 120]]),
  ]
  assert.equal(detectProgressStall(sessions), null)
})

test("stuck at one weight without adding reps is flagged as STALE", () => {
  // Added load once, then stopped adding reps at the new weight — the only
  // case the user considers a real stall.
  const sessions = [
    session(0, [[8, 110]]),
    session(3, [[8, 120]]),
    session(6, [[8, 120]]),
    session(9, [[8, 120]]),
    session(12, [[8, 120]]),
    session(15, [[8, 120]]),
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  assert.equal(result.flag, "STALE")
  assert.equal(result.stalledSessions, 4)
})

test("four flat sessions after a baseline produce a STALE tier 2 result", () => {
  const sessions = [
    session(0, [[8, 120]]),
    session(3, [[8, 120]]),
    session(6, [[8, 120]]),
    session(9, [[8, 120]]),
    session(12, [[8, 120]]),
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  assert.equal(result.flag, "STALE")
  assert.equal(result.tier, 2)
  assert.equal(result.metric, "load")
  assert.equal(result.stalledSessions, 4)
})

test("stall with a clear drop in the latest session escalates to REGRESSION tier 1", () => {
  const sessions = [
    session(0, [[8, 120]]),
    session(3, [[8, 118]]),
    session(6, [[8, 115]]),
    session(9, [[8, 112]]),
    session(12, [[8, 105]]),
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  assert.equal(result.flag, "REGRESSION")
  assert.equal(result.tier, 1)
})

test("fewer than threshold+1 sessions is not enough history to judge", () => {
  const sessions = [
    session(0, [[8, 120]]),
    session(3, [[8, 120]]),
    session(6, [[8, 120]]),
    session(9, [[8, 120]]),
  ]
  assert.equal(detectProgressStall(sessions), null)
})

test("a tiny weight wiggle below tolerance does not count as progress", () => {
  // 120.5 lb is within the 0.5% tolerance of 120, so it reads as the same
  // working weight and the matching reps add no progress.
  const sessions = [
    session(0, [[8, 120]]),
    session(3, [[8, 120.5]]),
    session(6, [[8, 120]]),
    session(9, [[8, 120.5]]),
    session(12, [[8, 120]]),
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  assert.equal(result.flag, "STALE")
})

test("bodyweight exercises fall back to best-reps progression", () => {
  const flat = [
    session(0, [[12, 0]]),
    session(3, [[12, 0]]),
    session(6, [[12, 0]]),
    session(9, [[12, 0]]),
    session(12, [[12, 0]]),
  ]
  const result = detectProgressStall(flat)
  assert.ok(result)
  assert.equal(result.metric, "reps")
  assert.equal(result.flag, "STALE")

  const progressing = [
    session(0, [[10, 0]]),
    session(3, [[11, 0]]),
    session(6, [[12, 0]]),
    session(9, [[13, 0]]),
    session(12, [[14, 0]]),
  ]
  assert.equal(detectProgressStall(progressing), null)
})

test("switching to strict bodyweight work is not a regression from an old weighted best", () => {
  // Weighted for a while, then a deliberate switch to bodyweight-only reps.
  // The old weighted best must not be used as the comparison baseline once
  // the user has settled into the new modality: no REGRESSION, and the best
  // is judged in reps within the bodyweight streak, not against the 10 lb best.
  const sessions = [
    session(0, [[12, 10]]),
    session(3, [[12, 10]]),
    session(6, [[12, 0]]),
    session(9, [[12, 0]]),
    session(12, [[12, 0]]),
    session(15, [[12, 0]]),
    session(18, [[12, 0]]),
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  assert.notEqual(result.flag, "REGRESSION")
  assert.equal(result.metric, "reps")
  assert.equal(result.bestWeight, 0)
})

test("a real regression within the same weighted modality still fires", () => {
  const sessions = [
    session(0, [[8, 100]]),
    session(3, [[8, 100]]),
    session(6, [[8, 60]]),
    session(9, [[8, 60]]),
    session(12, [[8, 60]]),
    session(15, [[8, 60]]),
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  assert.equal(result.flag, "REGRESSION")
  assert.equal(result.metric, "load")
})

test("sessions inside deload ranges are excluded from the analysis", () => {
  const sessions = [
    session(0, [[8, 100]]),
    session(3, [[8, 105]]),
    session(6, [[8, 110]]),
    session(9, [[8, 115]]),
    // Deload week: light work that would otherwise read as four stalled sessions
    session(12, [[8, 80]]),
    session(14, [[8, 80]]),
    session(16, [[8, 80]]),
    session(18, [[8, 80]]),
  ]
  const deloadRanges = [
    {
      start: new Date(BASE + 11 * DAY_MS).toISOString(),
      end: new Date(BASE + 19 * DAY_MS).toISOString(),
    },
  ]
  assert.equal(detectProgressStall(sessions, { deloadRanges }), null)
  // Without the deload exclusion the same series is flagged
  assert.ok(detectProgressStall(sessions))
})

test("incomplete and zero-rep sets are ignored", () => {
  const sessions = [
    session(0, [[8, 120]]),
    session(3, [[8, 120]]),
    session(6, [[8, 120]]),
    session(9, [[8, 120]]),
    {
      workoutId: "w-last",
      performedAt: new Date(BASE + 12 * DAY_MS).toISOString(),
      sets: [
        { reps: 8, weight: 120, completed: true },
        { reps: 12, weight: 200, completed: false },
        { reps: 0, weight: 300, completed: true },
        { reps: null, weight: 300, completed: true },
      ],
    },
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  assert.equal(result.flag, "STALE")
})

test("sessions older than the baseline window do not poison the running best", () => {
  // An old PR far outside the window, then a fresh climbing block
  const sessions = [
    session(-300, [[10, 200]]),
    session(0, [[8, 100]]),
    session(3, [[8, 105]]),
    session(6, [[8, 110]]),
    session(9, [[8, 115]]),
    session(12, [[8, 120]]),
  ]
  assert.equal(detectProgressStall(sessions), null)
})

test("duplicate workout ids are merged into one session", () => {
  const sessions = [
    session(0, [[8, 120]]),
    session(3, [[8, 120]], "w-dup"),
    session(3, [[8, 120]], "w-dup"),
    session(6, [[8, 120]]),
    session(9, [[8, 120]]),
  ]
  // Merged: only 4 distinct sessions → below the 5-session minimum
  assert.equal(detectProgressStall(sessions), null)
})

test("buildStallAlertContent produces a message, action, and context payload", () => {
  const sessions = [
    session(0, [[8, 120]]),
    session(3, [[8, 120]]),
    session(6, [[8, 120]]),
    session(9, [[8, 120]]),
    session(12, [[8, 120]]),
  ]
  const result = detectProgressStall(sessions)
  assert.ok(result)
  const content = buildStallAlertContent("upper1-lat-pd", "Lat Pulldown", result)
  assert.equal(content.flag, "STALE")
  assert.equal(content.tier, 2)
  assert.match(content.message, /Lat Pulldown/)
  assert.match(content.message, /4 sessions/)
  assert.ok(content.action.length > 0)
  assert.equal(content.context.exercise_id, "upper1-lat-pd")
  assert.equal(content.context.source, "progressive_overload_v2")
  assert.equal(content.context.stalled_sessions, 4)
})
