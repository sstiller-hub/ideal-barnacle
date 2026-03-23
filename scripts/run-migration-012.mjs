/**
 * Applies migration 012: user_exercise_settings table
 *
 * Usage:
 *   node scripts/run-migration-012.mjs
 *
 * Requires either:
 *   - SUPABASE_DB_URL in .env.local  (direct postgres connection, e.g. postgresql://...)
 *   - Or: run `npx supabase db push` if using the Supabase CLI
 *   - Or: paste the SQL manually in the Supabase dashboard SQL editor
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { execSync } from "node:child_process"

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
const DB_URL = process.env.SUPABASE_DB_URL || envFromFile.SUPABASE_DB_URL

const migrationPath = path.resolve(process.cwd(), "supabase/migrations/012_user_exercise_settings.sql")
const sql = fs.readFileSync(migrationPath, "utf8")

if (DB_URL) {
  console.log("Applying migration via psql...")
  try {
    execSync(`psql "${DB_URL}" -f "${migrationPath}"`, { stdio: "inherit" })
    console.log("Migration applied successfully.")
    process.exit(0)
  } catch {
    console.error("psql failed. Make sure psql is installed and SUPABASE_DB_URL is correct.")
    process.exit(1)
  }
}

// No DB_URL — print instructions
console.log("No SUPABASE_DB_URL found in .env.local.\n")
console.log("Option 1 — Supabase CLI:")
console.log("  npx supabase db push\n")
console.log("Option 2 — Add SUPABASE_DB_URL to .env.local and re-run this script.")
console.log("  (Find it in Supabase dashboard → Project Settings → Database → Connection string)\n")
console.log("Option 3 — Run this SQL manually in the Supabase dashboard SQL editor:")
console.log("  https://supabase.com/dashboard → your project → SQL Editor\n")
console.log("--- SQL ---")
console.log(sql)
console.log("-----------")
