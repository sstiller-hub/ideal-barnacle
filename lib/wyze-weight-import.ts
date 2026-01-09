import ExcelJS from "exceljs"

export type WyzeWeightRow = {
  measuredAt: string
  weightLb: number
  weightKg: number
}

export type WyzeParseResult = {
  rows: WyzeWeightRow[]
  totalRows: number
  validRows: number
  skippedRows: number
  range: { start: string; end: string } | null
  errors: string[]
}

const SOURCE = "wyze_import"

const normalizeHeader = (value: unknown) => String(value ?? "").trim()

const normalizeHeaderKey = (value: unknown) => {
  const raw = normalizeHeader(value)
  const compact = raw
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
  return {
    raw,
    compact,
    compactNoSpaces: compact.replace(/\s+/g, ""),
  }
}

export const parseWeightKg = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/kg/i, "").trim()
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export const parseWeightLb = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/lbs?/i, "").trim()
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export const parseWyzeDate = (value: unknown): Date | null => {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const match = raw.match(
    /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  )
  if (!match) return null
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, meridiem] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const minute = Number(minuteStr)
  let hour = Number(hourStr)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (meridiem.toUpperCase() === "PM" && hour < 12) hour += 12
  if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

export const parseWyzeRows = (rows: unknown[][]): WyzeParseResult => {
  if (!rows.length) {
    return {
      rows: [],
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
      range: null,
      errors: ["No rows found in file."],
    }
  }

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderKey)
    const hasDate = normalized.some(
      (header) =>
        header.compactNoSpaces === "dateandtime" ||
        header.compactNoSpaces === "datetime",
    )
    const hasWeightKg = normalized.some(
      (header) =>
        header.compactNoSpaces === "weight(kg)" ||
        header.compactNoSpaces === "weightkg",
    )
    const hasWeightLb = normalized.some(
      (header) =>
        header.compactNoSpaces === "weight(lb)" ||
        header.compactNoSpaces === "weightlbs" ||
        header.compactNoSpaces === "weightlb",
    )
    return hasDate && hasWeightKg && hasWeightLb
  })

  if (headerRowIndex < 0) {
    return {
      rows: [],
      totalRows: Math.max(rows.length - 1, 0),
      validRows: 0,
      skippedRows: Math.max(rows.length - 1, 0),
      range: null,
      errors: ["Missing required columns: Date and Time, Weight(lb), or Weight(kg)."],
    }
  }

  const headerRow = rows[headerRowIndex]
  const headers = headerRow.map(normalizeHeaderKey)
  const dateIndex = headers.findIndex(
    (header) =>
      header.compactNoSpaces === "dateandtime" ||
      header.compactNoSpaces === "datetime",
  )
  const weightIndex = headers.findIndex(
    (header) =>
      header.compactNoSpaces === "weight(kg)" ||
      header.compactNoSpaces === "weightkg",
  )
  const weightLbIndex = headers.findIndex(
    (header) =>
      header.compactNoSpaces === "weight(lb)" ||
      header.compactNoSpaces === "weightlbs" ||
      header.compactNoSpaces === "weightlb",
  )

  const normalized: WyzeWeightRow[] = []
  let skipped = 0
  let minDate: Date | null = null
  let maxDate: Date | null = null

  rows.slice(headerRowIndex + 1).forEach((row) => {
    const dateValue = row[dateIndex]
    const weightValue = row[weightIndex]
    const weightLbValue = row[weightLbIndex]
    const measuredAtDate = parseWyzeDate(dateValue)
    const weightKg = parseWeightKg(weightValue)
    const weightLb = parseWeightLb(weightLbValue)
    if (!measuredAtDate || weightKg === null || weightLb === null) {
      skipped += 1
      return
    }
    if (!minDate || measuredAtDate < minDate) minDate = measuredAtDate
    if (!maxDate || measuredAtDate > maxDate) maxDate = measuredAtDate
    normalized.push({ measuredAt: measuredAtDate.toISOString(), weightKg, weightLb })
  })

  return {
    rows: normalized,
    totalRows: Math.max(rows.length - headerRowIndex - 1, 0),
    validRows: normalized.length,
    skippedRows: skipped,
    range:
      minDate && maxDate
        ? { start: minDate.toISOString(), end: maxDate.toISOString() }
        : null,
    errors: [],
  }
}

export const buildSourceRowId = async (
  userId: string,
  measuredAt: string,
  weightKg: number,
  source: string = SOURCE,
) => {
  const input = `${userId}|${measuredAt}|${weightKg}|${source}`
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(input)
    const hash = await globalThis.crypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }
  const { createHash } = await import("crypto")
  return createHash("sha256").update(input).digest("hex")
}

export const buildWyzeEntries = async (userId: string, rows: WyzeWeightRow[]) => {
  const entries = await Promise.all(
    rows.map(async (row) => ({
      user_id: userId,
      measured_at: row.measuredAt,
      weight_kg: row.weightKg,
      weight_lb: row.weightLb,
      source: SOURCE,
      source_row_id: await buildSourceRowId(userId, row.measuredAt, row.weightKg, SOURCE),
    })),
  )
  return entries
}

const parseCsvRows = (text: string): unknown[][] => {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && inQuotes && next === '"') {
      field += '"'
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && (char === "," || char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1
      }
      current.push(field)
      field = ""
      if (char === "\n" || char === "\r") {
        rows.push(current)
        current = []
      }
      continue
    }
    field += char
  }
  current.push(field)
  rows.push(current)
  return rows
}

export const parseWyzeFile = async (file: File): Promise<WyzeParseResult> => {
  const ext = file.name.toLowerCase().split(".").pop()
  const workbook = new ExcelJS.Workbook()

  try {
    if (ext === "csv") {
      const text = await file.text()
      return parseWyzeRows(parseCsvRows(text))
    } else {
      const data = await file.arrayBuffer()
      await workbook.xlsx.load(data)
    }
  } catch {
    return {
      rows: [],
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
      range: null,
      errors: ["Unable to parse file."],
    }
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    return {
      rows: [],
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
      range: null,
      errors: ["No sheets found in file."],
    }
  }

  const rows: unknown[][] = []
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[]
    rows.push(values.slice(1))
  })

  return parseWyzeRows(rows)
}
