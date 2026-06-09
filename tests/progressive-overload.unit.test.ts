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
  assert.equal(result.metric, "e1rm")
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

test("a tiny e1RM wiggle below tolerance does not count as progress", () => {
  // 8x120 = 152 e1RM; 8x120.5 ≈ 152.6 — under the 0.5% tolerance margin
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
  assert.equal(content.context.source, "progressive_overload_v1")
  assert.equal(content.context.stalled_sessions, 4)
})
