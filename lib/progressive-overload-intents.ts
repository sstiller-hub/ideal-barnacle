export type PendingOverloadIntent = {
  exerciseName: string
  weightDelta: number
  repsOverride: number
  createdAt: string
}

type PendingOverloadStore = {
  version: 1
  intents: PendingOverloadIntent[]
}

const STORAGE_KEY = "pending_progressive_overloads_v1"
const STORAGE_VERSION = 1 as const

const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, " ")

const loadStore = (): PendingOverloadStore => {
  if (typeof window === "undefined") return { version: STORAGE_VERSION, intents: [] }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { version: STORAGE_VERSION, intents: [] }
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version === STORAGE_VERSION && Array.isArray(parsed.intents)) {
      return { version: STORAGE_VERSION, intents: parsed.intents }
    }
  } catch {
    // fall through
  }
  return { version: STORAGE_VERSION, intents: [] }
}

const saveStore = (store: PendingOverloadStore) => {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export const setPendingOverloadIntent = (exerciseName: string, repsLow: number) => {
  const normalized = normalizeName(exerciseName)
  const store = loadStore()
  const intents = store.intents.filter((i) => normalizeName(i.exerciseName) !== normalized)
  intents.push({
    exerciseName: normalized,
    weightDelta: 5,
    repsOverride: repsLow,
    createdAt: new Date().toISOString(),
  })
  saveStore({ version: STORAGE_VERSION, intents })
}

export const getPendingOverloadIntent = (exerciseName: string): PendingOverloadIntent | null => {
  const normalized = normalizeName(exerciseName)
  const store = loadStore()
  return store.intents.find((i) => normalizeName(i.exerciseName) === normalized) ?? null
}

export const clearPendingOverloadIntent = (exerciseName: string) => {
  const normalized = normalizeName(exerciseName)
  const store = loadStore()
  const intents = store.intents.filter((i) => normalizeName(i.exerciseName) !== normalized)
  saveStore({ version: STORAGE_VERSION, intents })
}

export const sweepExpiredOverloadIntents = (maxAgeDays = 30) => {
  const store = loadStore()
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const intents = store.intents.filter((i) => new Date(i.createdAt).getTime() > cutoff)
  if (intents.length !== store.intents.length) {
    saveStore({ version: STORAGE_VERSION, intents })
  }
}
