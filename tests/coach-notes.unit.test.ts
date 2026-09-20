import test from "node:test"
import assert from "node:assert/strict"
import {
  coachNoteTarget,
  describeResolveThreshold,
  formatClearedNoteLine,
  groupExerciseNotes,
  selectGlobalNotes,
  selectWorkoutNotes,
  type CoachNote,
} from "../lib/coach-notes"

const note = (overrides: Partial<CoachNote> & Pick<CoachNote, "id">): CoachNote => ({
  user_id: "u1",
  created_at: "2026-09-20T12:58:57.323Z",
  source_date: "2026-09-20",
  scope: "exercise",
  target: "belt squat rdl",
  kind: "target",
  body: "300x10 next, then 305",
  detail: null,
  resolve_rule: { type: "manual" },
  ...overrides,
})

test("targets are lowercased and trimmed, and nothing else", () => {
  assert.equal(coachNoteTarget("  Belt Squat RDL "), "belt squat rdl")
  assert.equal(coachNoteTarget("INCLINE PRESS MACHINE"), "incline press machine")
  assert.equal(coachNoteTarget(null), "")
  assert.equal(coachNoteTarget(undefined), "")
  // Deliberately NOT alias-folded (normalizeExerciseName does that for stats) —
  // the SQL side does lower(trim(...)) and the two must agree exactly.
  assert.equal(coachNoteTarget("Incline Smith Machine Bench"), "incline smith machine bench")
  // Internal whitespace is left alone for the same reason.
  assert.equal(coachNoteTarget("Cable  Crunch"), "cable  crunch")
})

test("exercise notes group by target, case-insensitively", () => {
  const grouped = groupExerciseNotes([
    note({ id: "a", target: "Belt Squat RDL" }),
    note({ id: "b", target: "  belt squat rdl  " }),
    note({ id: "c", target: "incline press machine" }),
    note({ id: "d", scope: "workout", target: "Legs 2 – Glutes + Hamstrings" }),
    note({ id: "e", scope: "global", target: null }),
  ])

  assert.deepEqual(
    grouped.get("belt squat rdl")?.map((n) => n.id),
    ["a", "b"]
  )
  assert.deepEqual(grouped.get("incline press machine")?.map((n) => n.id), ["c"])
  // Only scope="exercise" notes are grouped here.
  assert.equal(grouped.size, 2)
})

test("workout notes match the workout name, global notes carry no target", () => {
  const notes = [
    note({ id: "w", scope: "workout", target: "legs 2 – glutes + hamstrings" }),
    note({ id: "other", scope: "workout", target: "upper 1 – chest + lats" }),
    note({ id: "g", scope: "global", target: null, kind: "reminder" }),
    note({ id: "e" }),
  ]

  assert.deepEqual(
    selectWorkoutNotes(notes, " Legs 2 – Glutes + Hamstrings ").map((n) => n.id),
    ["w"]
  )
  assert.deepEqual(selectWorkoutNotes(notes, "").map((n) => n.id), [])
  assert.deepEqual(selectGlobalNotes(notes).map((n) => n.id), ["g"])
})

test("resolve thresholds read back in the note's own vocabulary", () => {
  assert.equal(
    describeResolveThreshold({ type: "set_at_least", weight: 305, reps: 8 }),
    "305x8"
  )
  assert.equal(describeResolveThreshold({ type: "weight_at_least", weight: 300 }), "300 lb")
  assert.equal(describeResolveThreshold({ type: "sessions_seen", n: 2 }), "2 sessions")
  assert.equal(describeResolveThreshold({ type: "sessions_seen", n: 1 }), "1 session")
  assert.equal(describeResolveThreshold({ type: "manual" }), null)
})

test("a malformed rule describes nothing rather than printing garbage", () => {
  assert.equal(describeResolveThreshold({ type: "set_at_least", weight: "heavy", reps: 8 }), null)
  assert.equal(describeResolveThreshold({ type: "sessions_seen" }), null)
  assert.equal(describeResolveThreshold({}), null)
})

test("a cleared line uses the casing the exercise was logged under", () => {
  const displayNames = new Map([["belt squat rdl", "Belt Squat RDL"]])
  const cleared = note({
    id: "x",
    resolve_rule: { type: "set_at_least", weight: 305, reps: 8 },
  })

  assert.equal(formatClearedNoteLine(cleared, displayNames), "Belt Squat RDL 305x8")
  // No display name on hand: fall back to the stored target rather than blank.
  assert.equal(formatClearedNoteLine(cleared), "belt squat rdl 305x8")
  // No describable threshold: the name alone is still a usable line.
  assert.equal(
    formatClearedNoteLine(note({ id: "y", resolve_rule: { type: "manual" } }), displayNames),
    "Belt Squat RDL"
  )
})
