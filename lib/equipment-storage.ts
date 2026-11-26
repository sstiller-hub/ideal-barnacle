import { supabase } from "@/lib/supabase"
import {
  type EquipmentIdentification,
  type ExerciseEquipment,
  isExerciseEquipment,
  normalizeEquipmentKey,
} from "@/lib/equipment"

/**
 * Client side of equipment photos: sticky equipment in localStorage (offline
 * first, like seat settings) mirrored to user_exercise_settings.equipment,
 * photo prep, and the call to /api/equipment/identify.
 */

const STORAGE_KEY = "exercise_equipment_v1"

function loadAll(): Record<string, ExerciseEquipment> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, ExerciseEquipment> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (isExerciseEquipment(value)) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

export function getStickyEquipment(exerciseName: string): ExerciseEquipment | null {
  return loadAll()[normalizeEquipmentKey(exerciseName)] ?? null
}

export function setStickyEquipmentLocal(exerciseName: string, equipment: ExerciseEquipment | null): void {
  if (typeof window === "undefined") return
  const all = loadAll()
  const key = normalizeEquipmentKey(exerciseName)
  if (equipment) all[key] = equipment
  else delete all[key]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Storage full: the photo thumbnails are the big part. Retry without them.
    try {
      const slim = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { ...v, photo: null }]))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
    } catch {
      // Nothing more to do; Supabase still has it.
    }
  }
}

/**
 * Remote copy. Reads only the equipment column so a database without the
 * 018 migration fails this call alone, never the seat/bar-weight load.
 * Returns undefined when the remote can't answer (keep local), null when it
 * says there is no equipment.
 */
export async function loadRemoteEquipment(
  userId: string,
  exerciseName: string
): Promise<ExerciseEquipment | null | undefined> {
  if (!supabase) return undefined
  const { data, error } = await supabase
    .from("user_exercise_settings")
    .select("equipment")
    .eq("user_id", userId)
    .eq("exercise_name", normalizeEquipmentKey(exerciseName))
    .maybeSingle()
  if (error) {
    console.warn("[equipment] remote load failed", error)
    return undefined
  }
  if (!data) return undefined
  return isExerciseEquipment(data.equipment) ? data.equipment : null
}

/** Upserts only the equipment column, leaving seat and plate settings alone. */
export async function saveRemoteEquipment(
  userId: string,
  exerciseName: string,
  equipment: ExerciseEquipment | null
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from("user_exercise_settings").upsert(
    {
      user_id: userId,
      exercise_name: normalizeEquipmentKey(exerciseName),
      equipment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,exercise_name" }
  )
  if (error) {
    console.warn("[equipment] remote save failed", error)
    return false
  }
  return true
}

export type PreparedPhoto = {
  /** Base64 JPEG without the data: prefix, for Claude. */
  base64: string
  mediaType: "image/jpeg"
  /** Small data URL kept with the equipment. */
  thumbnail: string
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
      return { source: bitmap, width: bitmap.width, height: bitmap.height }
    } catch {
      // Fall through to <img>, which handles formats some bitmaps can't.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function render(
  image: { source: CanvasImageSource; width: number; height: number },
  maxSide: number,
  quality: number
): string {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas unavailable")
  context.drawImage(image.source, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg", quality)
}

/** Downscale a camera photo: ~1280px for Claude, ~160px thumbnail to keep. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const image = await decode(file)
  const full = render(image, 1280, 0.82)
  const thumbnail = render(image, 160, 0.7)
  if ("close" in image.source && typeof image.source.close === "function") image.source.close()
  return { base64: full.slice(full.indexOf(",") + 1), mediaType: "image/jpeg", thumbnail }
}

export async function identifyEquipment(
  photo: PreparedPhoto,
  exerciseName: string
): Promise<{ ok: true; data: EquipmentIdentification } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Sign in to use equipment photos." }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: "Sign in to use equipment photos." }

  try {
    const response = await fetch("/api/equipment/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: photo.base64, media_type: photo.mediaType, exercise_name: exerciseName }),
    })
    const json = (await response.json().catch(() => null)) as
      | { data?: EquipmentIdentification; error?: string }
      | null
    if (!response.ok || !json?.data) {
      return { ok: false, error: json?.error ?? `Identify failed (${response.status})` }
    }
    return { ok: true, data: json.data }
  } catch {
    return { ok: false, error: "No connection. Type the name instead." }
  }
}
