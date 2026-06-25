import test from "node:test"
import assert from "node:assert/strict"
import { topSetWithContext, type TopSetInput } from "../lib/top-set"

const set = (weight: number | null, reps: number | null, completed = true): TopSetInput => ({
  weight,
  reps,
  completed,
})

test("picks the set with the highest weight × reps, not the heaviest weight", () => {
  // 275×8 = 2200, but 245×10 = 2450 is the bigger top set.
  const top = topSetWithContext([set(225, 10), set(275, 8), set(245, 10)])
  assert.equal(top?.weight, 245)
  assert.equal(top?.reps, 10)
  assert.equal(top?.ordinal, 3)
  assert.equal(top?.total, 3)
  assert.equal(top?.standsOut, true)
})

test("reports the 1-based ordinal of the top set in performed order", () => {
  const top = topSetWithContext([set(200, 8), set(220, 8), set(210, 8)])
  assert.equal(top?.ordinal, 2)
  assert.equal(top?.standsOut, true)
})

test("straight sets do not stand out — every set ties on weight × reps", () => {
  const top = topSetWithContext([set(270, 8), set(270, 8), set(270, 8), set(270, 8)])
  assert.equal(top?.standsOut, false)
  assert.equal(top?.total, 4)
  // The reported set is still the first qualifying one, but callers suppress
  // the label because standsOut is false.
  assert.equal(top?.ordinal, 1)
})

test("a tie at the top weight × reps does not stand out", () => {
  // 245×10 = 2450 appears twice; the top set is ambiguous.
  const top = topSetWithContext([set(275, 8), set(245, 10), set(245, 10)])
  assert.equal(top?.weight, 245)
  assert.equal(top?.standsOut, false)
})

test("ordinal and total count only qualifying sets, skipping incomplete and empty ones", () => {
  const top = topSetWithContext([
    set(200, 8),
    set(225, 8, false), // not completed — skipped
    set(0, 0), // empty placeholder — skipped
    set(240, 8), // 2nd qualifying set, and the top
    set(220, 8), // 3rd qualifying set
  ])
  assert.equal(top?.weight, 240)
  assert.equal(top?.ordinal, 2)
  assert.equal(top?.total, 3)
  assert.equal(top?.standsOut, true)
})

test("a later, strictly bigger set resets a prior tie", () => {
  // 2160 ties (sets 1 & 2), then 280×8 = 2240 is a clean, unique top.
  const top = topSetWithContext([set(270, 8), set(270, 8), set(280, 8)])
  assert.equal(top?.weight, 280)
  assert.equal(top?.ordinal, 3)
  assert.equal(top?.standsOut, true)
})

test("returns null when no set qualifies", () => {
  assert.equal(topSetWithContext([]), null)
  assert.equal(topSetWithContext(null), null)
  assert.equal(topSetWithContext([set(0, 0), set(225, 8, false)]), null)
})
