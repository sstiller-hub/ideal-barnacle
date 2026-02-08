import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const USER_ID = process.argv[2]
const CSV_PATH = process.argv[3]

if (!USER_ID || !CSV_PATH) {
  console.error("Usage: node scripts/report-exercise-fuzzy.mjs <USER_ID> <CSV_PATH>")
  process.exit(1)
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found: ${CSV_PATH}`)
  process.exit(1)
}

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, "utf8")
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    env[key] = value
  }
  return env
}

const envFromFile = readEnvFile(path.resolve(process.cwd(), ".env.local"))
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || envFromFile.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envFromFile.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in environment.")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const parseCSVLine = (line) => {
  const result = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
      continue
    }
    current += char
  }
  result.push(current)
  return result
}

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []
  const header = parseCSVLine(lines[0]).map((h) => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCSVLine(lines[i])
    const row = {}
    header.forEach((key, idx) => {
      row[key] = (values[idx] ?? "").trim()
    })
    rows.push(row)
  }
  return rows
}

const normalizeName = (name) => {
  if (!name) return ""
  let text = name.toLowerCase()
  text = text.replace(/[’'"]/g, "")
  text = text.replace(/[-/()]/g, " ")
  text = text.replace(/&/g, " and ")
  text = text.replace(/\bdb\b/g, "dumbbell")
  text = text.replace(/\bbb\b/g, "barbell")
  text = text.replace(/\bkb\b/g, "kettlebell")
  text = text.replace(/\bb\/w\b/g, "bodyweight")
  text = text.replace(/\bbwt\b/g, "bodyweight")
  text = text.replace(/\bbody weight\b/g, "bodyweight")
  text = text.replace(/\s+/g, " ").trim()
  return text
}

const toBigrams = (text) => {
  const s = ` ${text} `
  const bigrams = new Map()
  for (let i = 0; i < s.length - 1; i += 1) {
    const bg = s.slice(i, i + 2)
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1)
  }
  return bigrams
}

const diceCoefficient = (a, b) => {
  if (!a || !b) return 0
  if (a === b) return 1
  const aBigrams = toBigrams(a)
  const bBigrams = toBigrams(b)
  let overlap = 0
  for (const [bg, countA] of aBigrams.entries()) {
    const countB = bBigrams.get(bg) || 0
    overlap += Math.min(countA, countB)
  }
  const total = [...aBigrams.values()].reduce((sum, v) => sum + v, 0) +
    [...bBigrams.values()].reduce((sum, v) => sum + v, 0)
  return total === 0 ? 0 : (2 * overlap) / total
}

const fetchWorkoutIds = async () => {
  const all = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", USER_ID)
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data.map((row) => row.id))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

const chunk = (arr, size) => {
  const result = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

const fetchExerciseNames = async (workoutIds) => {
  const names = []
  for (const batch of chunk(workoutIds, 500)) {
    const { data, error } = await supabase
      .from("workout_exercises")
      .select("name")
      .in("workout_id", batch)
    if (error) throw error
    ;(data || []).forEach((row) => {
      if (row?.name) names.push(row.name)
    })
  }
  return names
}

const run = async () => {
  const csvText = fs.readFileSync(CSV_PATH, "utf8")
  const rows = parseCSV(csvText)

  const csvRawSet = new Set()
  const csvNormSet = new Set()
  const csvNormToRaw = new Map()

  rows.forEach((row) => {
    const canonical = row.Exercise_Canonical?.trim()
    const normalized = row.Exercise_Normalized?.trim()
    const name = canonical || normalized || row.Exercise?.trim()
    if (!name) return
    csvRawSet.add(name)
    const norm = normalizeName(name)
    csvNormSet.add(norm)
    if (!csvNormToRaw.has(norm)) csvNormToRaw.set(norm, new Set())
    csvNormToRaw.get(norm).add(name)
  })

  const workoutIds = await fetchWorkoutIds()
  const dbNames = await fetchExerciseNames(workoutIds)
  const dbNormSet = new Set()
  const dbNormToRaw = new Map()

  dbNames.forEach((name) => {
    const norm = normalizeName(name)
    dbNormSet.add(norm)
    if (!dbNormToRaw.has(norm)) dbNormToRaw.set(norm, new Set())
    dbNormToRaw.get(norm).add(name)
  })

  const missingNorms = [...csvNormSet].filter((norm) => !dbNormSet.has(norm))
  const missingDetails = missingNorms.map((norm) => ({
    normalized: norm,
    names: [...(csvNormToRaw.get(norm) || [])],
  }))

  const dbNormList = [...dbNormSet]
  const fuzzyMatches = []
  const threshold = 0.88

  for (const csvNorm of missingNorms) {
    let best = []
    for (const dbNorm of dbNormList) {
      const score = diceCoefficient(csvNorm, dbNorm)
      if (score >= threshold) {
        best.push({ dbNorm, score })
      }
    }
    best.sort((a, b) => b.score - a.score)
    best = best.slice(0, 3)
    if (best.length > 0) {
      fuzzyMatches.push({
        csvNorm,
        csvNames: [...(csvNormToRaw.get(csvNorm) || [])],
        matches: best.map((m) => ({
          score: Number(m.score.toFixed(3)),
          dbNorm: m.dbNorm,
          dbNames: [...(dbNormToRaw.get(m.dbNorm) || [])],
        })),
      })
    }
  }

  const report = {
    userId: USER_ID,
    csvPath: CSV_PATH,
    generatedAt: new Date().toISOString(),
    csvUniqueNames: csvRawSet.size,
    csvUniqueNormalized: csvNormSet.size,
    dbUniqueNames: new Set(dbNames).size,
    dbUniqueNormalized: dbNormSet.size,
    missingNormalizedCount: missingNorms.length,
    fuzzyMatchCount: fuzzyMatches.length,
    fuzzyMatches,
    missingDetails,
  }

  const outDir = path.resolve(process.cwd(), "reports")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, "exercise-fuzzy-report.json")
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const mdLines = [
    `# Exercise Fuzzy Report`,
    ``,
    `User: ${USER_ID}`,
    `Generated: ${report.generatedAt}`,
    ``,
    `CSV Unique Names: ${report.csvUniqueNames}`,
    `CSV Unique Normalized: ${report.csvUniqueNormalized}`,
    `DB Unique Names: ${report.dbUniqueNames}`,
    `DB Unique Normalized: ${report.dbUniqueNormalized}`,
    `Missing Normalized (CSV not in DB): ${report.missingNormalizedCount}`,
    `Fuzzy Matches (missing with close DB match): ${report.fuzzyMatchCount}`,
    ``,
  ]

  if (missingDetails.length > 0) {
    mdLines.push(`## Missing From DB`)
    missingDetails.forEach((item) => {
      mdLines.push(`- ${item.names.join(" | ")} (normalized: \`${item.normalized}\`)`)
    })
    mdLines.push(``)
  }

  fuzzyMatches.forEach((item) => {
    mdLines.push(`## CSV: ${item.csvNames.join(" | ")}`)
    mdLines.push(`Normalized: \`${item.csvNorm}\``)
    mdLines.push(`Possible matches:`)
    item.matches.forEach((match) => {
      mdLines.push(`- ${match.dbNames.join(" | ")} (${match.score})`)
    })
    mdLines.push(``)
  })

  const mdPath = path.join(outDir, "exercise-fuzzy-report.md")
  fs.writeFileSync(mdPath, mdLines.join("\n"))

  console.log(`Report written to ${jsonPath}`)
  console.log(`Report written to ${mdPath}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
