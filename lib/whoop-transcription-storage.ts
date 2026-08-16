import type { AliasMap } from "./whoop-transcription"

/**
 * Local-only state for the Whoop transcription view. Progress is ephemeral UI
 * state, not training data, so it deliberately stays out of the Supabase sync
 * queue. Aliases are long-lived — an exercise is mapped to its Whoop library
 * name once and reused forever.
 */

const PROGRESS_KEY = "whoop_transcription_v1"
const ALIASES_KEY = "whoop_exercise_aliases_v1"
const PRUNE_DAYS = 30

export interface TranscriptionProgress {
  checkedSetIds: string[]
  lastExerciseIndex: number
  showWarmups?: boolean
  /** ISO timestamp of the last write, used for pruning. */
  updatedAt: string
  finishedAt?: string
}

type ProgressStore = Record<string, TranscriptionProgress>

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  const stored = localStorage.getItem(key)
  if (!stored) return fallback
  try {
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

function pruneOld(store: ProgressStore): ProgressStore {
  const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000
  const pruned: ProgressStore = {}
  Object.entries(store).forEach(([workoutId, entry]) => {
    const updated = new Date(entry.updatedAt).getTime()
    if (Number.isNaN(updated) || updated >= cutoff) pruned[workoutId] = entry
  })
  return pruned
}

export function getTranscriptionProgress(workoutId: string): TranscriptionProgress | null {
  const store = readJSON<ProgressStore>(PROGRESS_KEY, {})
  return store[workoutId] ?? null
}

export function saveTranscriptionProgress(
  workoutId: string,
  progress: Omit<TranscriptionProgress, "updatedAt">,
): void {
  if (typeof window === "undefined") return
  const store = pruneOld(readJSON<ProgressStore>(PROGRESS_KEY, {}))
  store[workoutId] = { ...progress, updatedAt: new Date().toISOString() }
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(store))
}

export function clearTranscriptionProgress(workoutId: string): void {
  if (typeof window === "undefined") return
  const store = readJSON<ProgressStore>(PROGRESS_KEY, {})
  delete store[workoutId]
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(store))
}

export function getExerciseAliases(): AliasMap {
  return readJSON<AliasMap>(ALIASES_KEY, {})
}

/** `normalizedName` must come from normalizeExerciseName(). Empty alias clears. */
export function saveExerciseAlias(normalizedName: string, whoopName: string): AliasMap {
  const aliases = getExerciseAliases()
  const trimmed = whoopName.trim()
  if (trimmed) {
    aliases[normalizedName] = trimmed
  } else {
    delete aliases[normalizedName]
  }
  if (typeof window !== "undefined") {
    localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases))
  }
  return aliases
}
