import { expect, test } from "@playwright/test"
import {
  buildSourceRowId,
  parseWeightKg,
  parseWeightLb,
  parseWyzeDate,
  parseWyzeRows,
} from "@/lib/wyze-weight-import"

test("parseWeightKg strips kg suffix", () => {
  expect(parseWeightKg("78.7kg")).toBe(78.7)
  expect(parseWeightKg(" 80.2 kg ")).toBe(80.2)
  expect(parseWeightKg("")).toBeNull()
})

test("parseWeightLb strips lb suffix", () => {
  expect(parseWeightLb("173.5lb")).toBe(173.5)
  expect(parseWeightLb(" 174.4 lbs ")).toBe(174.4)
  expect(parseWeightLb("")).toBeNull()
})

test("parseWyzeDate parses Wyze timestamp format", () => {
  const date = parseWyzeDate("2025.01.02 9:05 PM")
  expect(date).not.toBeNull()
  if (!date) return
  expect(date.getFullYear()).toBe(2025)
  expect(date.getMonth()).toBe(0)
  expect(date.getDate()).toBe(2)
  expect(date.getHours()).toBe(21)
  expect(date.getMinutes()).toBe(5)
})

test("parseWyzeRows respects header row and skips invalid rows", () => {
  const rows = [
    ["Date and Time", "Weight(lb)", "Weight(kg)"],
    ["2025.01.02 9:05 PM", "173.5lb", "78.7kg"],
    ["", "174.4lb", "80.1kg"],
  ]
  const result = parseWyzeRows(rows)
  expect(result.totalRows).toBe(2)
  expect(result.validRows).toBe(1)
  expect(result.skippedRows).toBe(1)
  expect(result.rows[0]?.weightKg).toBe(78.7)
  expect(result.rows[0]?.weightLb).toBe(173.5)
})

test("buildSourceRowId is deterministic", async () => {
  const first = await buildSourceRowId("user-1", "2025-01-02T05:05:00.000Z", 78.7, "wyze_import")
  const second = await buildSourceRowId("user-1", "2025-01-02T05:05:00.000Z", 78.7, "wyze_import")
  expect(first).toBe(second)
})
