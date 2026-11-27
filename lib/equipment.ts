import { supabase } from "@/lib/supabase"

/**
 * Equipment per exercise, identified from a photo.
 *
 * The user photographs the machine/bench/bar they are about to use. Claude
 * (via /api/equipment/identify) suggests what it is; nothing is saved until
 * the user confirms or edits that suggestion and picks how long it applies:
 *
 *   • standing — this is the equipment from now on, until another photo
 *     replaces it.
 *   • today    — only for today's local date; tomorrow the exercise falls
 *     back to its standing equipment.
 *
 * Rows are append-only (see supabase/migrations/018_exercise_equipment.sql),
 * so the history of what was used stays intact.
 */

export type EquipmentScope = "standing" | "today"

export type EquipmentRecord = {
  id: string
  exercise_name: string
  equipment_name: string
  brand: string | null
  equipment_type: string | null
  notes: string | null
  scope: EquipmentScope
  valid_on: string | null
  created_at: string
}

/** What the identify route returns. A suggestion only: the user confirms it. */
export type EquipmentSuggestion = {
  identified: boolean
  equipment_name: string
  brand: string | null
  equipment_type: string | null
  notes: string | null
}

export function equipmentKey(exerciseName: string): string {
  return exerciseName.toLowerCase().trim()
}

/** The user's local calendar date as YYYY-MM-DD. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * The equipment in effect for one exercise on `today`: the newest today-only
 * row for that date, otherwise the newest standing row, otherwise none.
 */
export function resolveActiveEquipment(
  records: EquipmentRecord[],
  exerciseName: string,
  today: string = localDateKey()
): EquipmentRecord | null {
  const key = equipmentKey(exerciseName)
  const mine = records
    .filter((record) => equipmentKey(record.exercise_name) === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    mine.find((record) => record.scope === "today" && record.valid_on === today) ??
    mine.find((record) => record.scope === "standing") ??
    null
  )
}

// --- Local cache ----------------------------------------------------------
// Keeps equipment visible offline and before the Supabase fetch returns.

const CACHE_KEY = "akt_exercise_equipment_v1"
const CACHE_LIMIT = 200

function readCache(): EquipmentRecord[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as EquipmentRecord[]) : []
  } catch {
    return []
  }
}

function writeCache(records: EquipmentRecord[]) {
  if (typeof window === "undefined") return
  try {
    const byId = new Map(records.map((record) => [record.id, record]))
    const sorted = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
    localStorage.setItem(CACHE_KEY, JSON.stringify(sorted.slice(0, CACHE_LIMIT)))
  } catch {
    // Storage full or blocked: Supabase still has the record.
  }
}

export function getCachedEquipment(exerciseName: string): EquipmentRecord | null {
  return resolveActiveEquipment(readCache(), exerciseName)
}

const SELECT_COLUMNS =
  "id, exercise_name, equipment_name, brand, equipment_type, notes, scope, valid_on, created_at"

/** Current equipment for an exercise, from Supabase with the cache as fallback. */
export async function loadActiveEquipment(exerciseName: string): Promise<EquipmentRecord | null> {
  if (!supabase) return getCachedEquipment(exerciseName)
  const today = localDateKey()
  try {
    const { data, error } = await supabase
      .from("exercise_equipment")
      .select(SELECT_COLUMNS)
      .eq("exercise_name", equipmentKey(exerciseName))
      .or(`scope.eq.standing,valid_on.eq.${today}`)
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) return getCachedEquipment(exerciseName)
    const rows = (data ?? []) as EquipmentRecord[]
    writeCache([...rows, ...readCache()])
    return resolveActiveEquipment(rows, exerciseName, today)
  } catch {
    return getCachedEquipment(exerciseName)
  }
}

/** Save the confirmed equipment. Returns the stored record. */
export async function saveEquipment(input: {
  exerciseName: string
  equipmentName: string
  brand: string | null
  equipmentType: string | null
  notes: string | null
  scope: EquipmentScope
  identifiedBy: "claude" | "manual"
}): Promise<EquipmentRecord> {
  if (!supabase) throw new Error("Sign in to save equipment.")
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) throw new Error("Sign in to save equipment.")

  const { data, error } = await supabase
    .from("exercise_equipment")
    .insert({
      user_id: auth.user.id,
      exercise_name: equipmentKey(input.exerciseName),
      equipment_name: input.equipmentName.trim(),
      brand: input.brand?.trim() || null,
      equipment_type: input.equipmentType?.trim() || null,
      notes: input.notes?.trim() || null,
      scope: input.scope,
      valid_on: input.scope === "today" ? localDateKey() : null,
      identified_by: input.identifiedBy,
    })
    .select(SELECT_COLUMNS)
    .single()
  if (error || !data) throw new Error(error?.message ?? "Could not save equipment.")
  const record = data as EquipmentRecord
  writeCache([record, ...readCache()])
  return record
}

// --- Photo → suggestion ----------------------------------------------------

const MAX_IMAGE_EDGE = 1568 // Claude's vision sweet spot; larger is downscaled anyway.

/** Downscale a camera photo to a JPEG small enough to upload quickly. */
async function compressImage(file: File): Promise<{ data: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Could not read the photo.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" }
}

export async function identifyEquipment(file: File, exerciseName: string): Promise<EquipmentSuggestion> {
  if (!supabase) throw new Error("Sign in to identify equipment.")
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sign in to identify equipment.")

  const image = await compressImage(file)
  const response = await fetch("/api/equipment/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ exerciseName, image: image.data, mediaType: image.mediaType }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error ?? "Could not identify the equipment.")
  return body.data as EquipmentSuggestion
}

export function describeEquipment(record: Pick<EquipmentRecord, "equipment_name" | "brand">): string {
  const name = record.equipment_name.trim()
  const brand = record.brand?.trim()
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name
  return `${brand} ${name}`
}
