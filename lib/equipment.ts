/**
 * Equipment photos: snap the machine you're about to use, Claude names it,
 * you confirm the name, and it sticks to that exercise.
 *
 * Two scopes:
 *  - Sticky ("from now on"): saved per exercise name and pre-loaded into every
 *    future session until a new photo replaces it or it is removed.
 *  - Today only: lives on the session's exercise and disappears with the
 *    session. The sticky equipment comes back next time.
 *
 * Keyed by exercise name like every other per-exercise setting, so a Cape
 * exercise ("<name> [Cape]") keeps its own equipment automatically.
 *
 * Claude's answer is a suggestion. Nothing is stored until the user confirms
 * it (and can edit the name first), per the system-of-record rules.
 */

export const EQUIPMENT_KINDS = [
  "plate_loaded",
  "selectorized",
  "cable",
  "smith",
  "free_weight",
  "bench_rack",
  "bodyweight",
  "cardio",
  "other",
] as const

export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number]

export const EQUIPMENT_KIND_LABELS: Record<EquipmentKind, string> = {
  plate_loaded: "Plate-loaded",
  selectorized: "Pin-select stack",
  cable: "Cable",
  smith: "Smith machine",
  free_weight: "Free weight",
  bench_rack: "Bench / rack",
  bodyweight: "Bodyweight station",
  cardio: "Cardio",
  other: "Other",
}

export type EquipmentConfidence = "high" | "medium" | "low"

/** What the identify route returns: Claude's read of the photo. */
export type EquipmentIdentification = {
  name: string
  brand: string | null
  kind: EquipmentKind
  confidence: EquipmentConfidence
  matchesExercise: boolean
  note: string | null
}

/** What gets stored once the user confirms. */
export type ExerciseEquipment = {
  name: string
  brand: string | null
  kind: EquipmentKind
  /** Small JPEG data URL so the card can show what was photographed. */
  photo: string | null
  setAt: string
}

export type EquipmentScope = "sticky" | "today"

export const EQUIPMENT_NAME_MAX = 80

/** Structured-output schema the identify route hands to Claude. */
export const EQUIPMENT_IDENTIFICATION_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description:
        "Short display name. Brand and model line only when visible in the photo (placard, logo, decal), e.g. 'Hammer Strength Iso-Lateral Row'. Otherwise a plain description, e.g. 'Plate-loaded seated row'.",
    },
    brand: {
      type: ["string", "null"],
      description: "Manufacturer only if visible in the photo, else null.",
    },
    kind: { type: "string", enum: [...EQUIPMENT_KINDS] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    matches_exercise: {
      type: "boolean",
      description: "True when this equipment can plausibly be used for the named exercise.",
    },
    note: {
      type: ["string", "null"],
      description:
        "One short sentence on anything that changes how loads compare to another machine (lever ratio, starting resistance, cam), or null.",
    },
  },
  required: ["name", "brand", "kind", "confidence", "matches_exercise", "note"],
  additionalProperties: false,
} as const

export function buildIdentifyPrompt(exerciseName: string): string {
  return [
    `I'm about to do "${exerciseName}" on the gym equipment in this photo.`,
    "Identify the equipment so I can log which machine my sets were done on.",
    "Read any brand placards, logos or model decals that are visible. Do not invent a model name you cannot see; describe the machine instead.",
    "If the photo does not show gym equipment, say so in the name with low confidence.",
  ].join(" ")
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed
}

function asKind(value: unknown): EquipmentKind {
  const lowered = typeof value === "string" ? value.toLowerCase().trim() : ""
  return (EQUIPMENT_KINDS as readonly string[]).includes(lowered) ? (lowered as EquipmentKind) : "other"
}

function asConfidence(value: unknown): EquipmentConfidence {
  const lowered = typeof value === "string" ? value.toLowerCase().trim() : ""
  return lowered === "high" || lowered === "medium" ? lowered : "low"
}

/**
 * Normalize Claude's JSON into an identification. Enum casing is not
 * guaranteed by structured outputs, so compare case-insensitively.
 * Returns null when there is no usable name.
 */
export function parseIdentification(raw: unknown): EquipmentIdentification | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const name = cleanString(record.name, EQUIPMENT_NAME_MAX)
  if (!name) return null
  return {
    name,
    brand: cleanString(record.brand, 40),
    kind: asKind(record.kind),
    confidence: asConfidence(record.confidence),
    matchesExercise: record.matches_exercise !== false,
    note: cleanString(record.note, 200),
  }
}

/** Today-only wins over sticky; sticky is what comes back next session. */
export function effectiveEquipment(exercise: {
  equipment?: ExerciseEquipment | null
  equipmentToday?: ExerciseEquipment | null
}): { equipment: ExerciseEquipment; scope: EquipmentScope } | null {
  if (exercise.equipmentToday) return { equipment: exercise.equipmentToday, scope: "today" }
  if (exercise.equipment) return { equipment: exercise.equipment, scope: "sticky" }
  return null
}

export function isExerciseEquipment(value: unknown): value is ExerciseEquipment {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return typeof record.name === "string" && record.name.trim().length > 0 && typeof record.setAt === "string"
}

export function normalizeEquipmentKey(exerciseName: string): string {
  return exerciseName.toLowerCase().trim()
}
