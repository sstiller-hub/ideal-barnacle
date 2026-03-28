import test from "node:test"
import assert from "node:assert/strict"
import {
  loadSets,
  saveSets,
  loadSessions,
  saveSession,
  deleteSetsForSession,
  deleteSession,
  saveCurrentSessionId,
  loadCurrentSessionId,
  type WorkoutSet,
  type WorkoutSession,
} from "../lib/autosave-workout-storage"

// ─── localStorage mock ────────────────────────────────────────────────────────
// The module guards every function with `if (typeof window === "undefined")`
// so we need a window + localStorage available when the functions execute.
const store: Record<string, string> = {}
const mockStorage = {
  getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}
;(globalThis as any).window = globalThis
;(globalThis as any).localStorage = mockStorage

function resetStorage() {
  mockStorage.clear()
}

const SETS_KEY = "workoutSets"

// ─── Bug 1: loadSets() was missing a try/catch around JSON.parse ──────────────

test("loadSets returns empty array when localStorage is empty", () => {
  resetStorage()
  assert.deepEqual(loadSets(), [])
})

test("loadSets returns parsed sets for valid JSON", () => {
  resetStorage()
  const set: WorkoutSet = {
    id: "s1",
    sessionId: "sess1",
    exerciseName: "Bench",
    setNumber: 1,
    weight: 100,
    reps: 8,
    isCompleted: false,
  }
  mockStorage.setItem(SETS_KEY, JSON.stringify([set]))
  const sets = loadSets()
  assert.equal(sets.length, 1)
  assert.equal(sets[0].id, "s1")
})

test("loadSets returns empty array (does not throw) on corrupted JSON", () => {
  resetStorage()
  mockStorage.setItem(SETS_KEY, "not valid json {{{{")
  let result: WorkoutSet[] | undefined
  assert.doesNotThrow(() => {
    result = loadSets()
  })
  assert.deepEqual(result, [])
})

test("loadSets returns empty array on truncated JSON", () => {
  resetStorage()
  mockStorage.setItem(SETS_KEY, '[{"id":"s1","sess')
  let result: WorkoutSet[] | undefined
  assert.doesNotThrow(() => {
    result = loadSets()
  })
  assert.deepEqual(result, [])
})

// ─── Bug 2: cancelWorkout must clean up localStorage ─────────────────────────
// We test the individual storage operations that cancelWorkout now calls.

test("deleteSession removes session from workoutSessions storage", () => {
  resetStorage()
  const session: WorkoutSession = {
    id: "sess-cancel",
    startedAt: new Date().toISOString(),
    status: "in_progress",
    activeDurationSeconds: 0,
  }
  saveSession(session)
  assert.equal(loadSessions().length, 1)

  deleteSession("sess-cancel")
  assert.equal(loadSessions().length, 0)
})

test("deleteSetsForSession removes only sets belonging to that session", () => {
  resetStorage()
  const sets: WorkoutSet[] = [
    { id: "s1", sessionId: "sess-A", exerciseName: "Squat", setNumber: 1, weight: 100, reps: 5, isCompleted: true },
    { id: "s2", sessionId: "sess-B", exerciseName: "Bench", setNumber: 1, weight: 80, reps: 8, isCompleted: false },
  ]
  saveSets(sets)

  deleteSetsForSession("sess-A")

  const remaining = loadSets()
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].id, "s2")
})

test("saveCurrentSessionId(null) clears the currentSessionId key", () => {
  resetStorage()
  saveCurrentSessionId("sess-xyz")
  assert.equal(loadCurrentSessionId(), "sess-xyz")

  saveCurrentSessionId(null)
  assert.equal(loadCurrentSessionId(), null)
})

test("cancelWorkout storage cleanup leaves no orphaned session, sets, or currentSessionId", () => {
  resetStorage()
  const session: WorkoutSession = {
    id: "sess-orphan",
    startedAt: new Date().toISOString(),
    status: "in_progress",
    activeDurationSeconds: 0,
  }
  saveSession(session)
  saveCurrentSessionId(session.id)
  saveSets([
    { id: "s1", sessionId: session.id, exerciseName: "Deadlift", setNumber: 1, weight: 120, reps: 5, isCompleted: false },
  ])

  // Simulate what the fixed cancelWorkout now does
  deleteSetsForSession(session.id)
  deleteSession(session.id)
  saveCurrentSessionId(null)

  assert.equal(loadSessions().length, 0, "sessions should be empty")
  assert.equal(loadSets().length, 0, "sets should be empty")
  assert.equal(loadCurrentSessionId(), null, "currentSessionId should be null")
})
