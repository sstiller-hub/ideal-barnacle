export type NextSessionNoteScope = "routine" | "exercise"

export type NextSessionNote = {
  key: string
  scope: NextSessionNoteScope
  routineId?: string
  routineName?: string
  exerciseId?: string
  exerciseName?: string
  text: string
  createdAt: string
  updatedAt: string
  pinned?: boolean
  clearedAt?: string
  linkedByName?: boolean
}

type NextSessionNotesStore = {
  version: 1
  notes: NextSessionNote[]
}

const STORAGE_KEY = "next_session_notes_v1"
const STORAGE_VERSION = 1 as const

const nowIso = () => new Date().toISOString()

const normalizeName = (value?: string) => value?.trim().toLowerCase() || ""

const buildRoutineKey = (routineId?: string, routineName?: string) => {
  if (routineId) return `r:${routineId}`
  const name = normalizeName(routineName)
  if (!name) return null
  return `r:name:${name}`
}

const buildExerciseKey = (
  routineId?: string,
  routineName?: string,
  exerciseId?: string,
  exerciseName?: string,
) => {
  const routineKey = buildRoutineKey(routineId, routineName)
  if (!routineKey) return null
  if (exerciseId) return `${routineKey}|e:${exerciseId}`
  const name = normalizeName(exerciseName)
  if (!name) return null
  return `${routineKey}|e:name:${name}`
}

const hydrateNote = (note: Partial<NextSessionNote>): NextSessionNote | null => {
  const scope = note.scope
  if (scope !== "routine" && scope !== "exercise") return null
  const key =
    note.key ??
    (scope === "routine"
      ? buildRoutineKey(note.routineId, note.routineName)
      : buildExerciseKey(note.routineId, note.routineName, note.exerciseId, note.exerciseName))
  if (!key || !note.text) return null
  return {
    key,
    scope,
    routineId: note.routineId,
    routineName: note.routineName,
    exerciseId: note.exerciseId,
    exerciseName: note.exerciseName,
    text: note.text,
    createdAt: note.createdAt ?? nowIso(),
    updatedAt: note.updatedAt ?? nowIso(),
    pinned: note.pinned,
    clearedAt: note.clearedAt,
    linkedByName: note.linkedByName,
  }
}

const loadStore = (): NextSessionNotesStore => {
  if (typeof window === "undefined") return { version: STORAGE_VERSION, notes: [] }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { version: STORAGE_VERSION, notes: [] }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const notes = parsed.map(hydrateNote).filter((note): note is NextSessionNote => Boolean(note))
      return { version: STORAGE_VERSION, notes }
    }
    if (parsed?.version === STORAGE_VERSION && Array.isArray(parsed.notes)) {
      const notes = parsed.notes
        .map(hydrateNote)
        .filter((note): note is NextSessionNote => Boolean(note))
      return { version: STORAGE_VERSION, notes }
    }
  } catch {
    return { version: STORAGE_VERSION, notes: [] }
  }
  return { version: STORAGE_VERSION, notes: [] }
}

const saveStore = (store: NextSessionNotesStore) => {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

const upsertNote = (note: NextSessionNote) => {
  const store = loadStore()
  const notes = store.notes.filter((existing) => existing.key !== note.key)
  notes.push(note)
  saveStore({ version: STORAGE_VERSION, notes })
  return note
}

const findNote = (key: string) => {
  const store = loadStore()
  return store.notes.find((note) => note.key === key && !note.clearedAt) || null
}

const removeNote = (key: string) => {
  const store = loadStore()
  const notes = store.notes.filter((note) => note.key !== key)
  saveStore({ version: STORAGE_VERSION, notes })
}

const markNoteCleared = (key: string) => {
  const store = loadStore()
  const notes = store.notes.map((note) =>
    note.key === key ? { ...note, clearedAt: nowIso(), updatedAt: nowIso() } : note,
  )
  saveStore({ version: STORAGE_VERSION, notes })
}

export const getRoutineNextNote = (routineId?: string, routineName?: string) => {
  const key = buildRoutineKey(routineId, routineName)
  if (!key) return null
  return findNote(key)
}

export const setRoutineNextNote = (
  routineId: string | undefined,
  routineName: string | undefined,
  text: string,
  options?: { pinned?: boolean },
) => {
  const trimmed = text.trim()
  if (!trimmed) return null
  const key = buildRoutineKey(routineId, routineName)
  if (!key) return null
  const existing = findNote(key)
  const linkedByName = !routineId
  const note: NextSessionNote = {
    key,
    scope: "routine",
    routineId,
    routineName,
    text: trimmed,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    pinned: options?.pinned ?? existing?.pinned,
    linkedByName,
  }
  return upsertNote(note)
}

export const clearRoutineNextNote = (routineId?: string, routineName?: string) => {
  const key = buildRoutineKey(routineId, routineName)
  if (!key) return
  removeNote(key)
}

export const markRoutineNextNoteDone = (routineId?: string, routineName?: string) => {
  const key = buildRoutineKey(routineId, routineName)
  if (!key) return
  markNoteCleared(key)
}

export const getExerciseNextNote = (
  routineId?: string,
  routineName?: string,
  exerciseId?: string,
  exerciseName?: string,
) => {
  const key = buildExerciseKey(routineId, routineName, exerciseId, exerciseName)
  if (!key) return null
  return findNote(key)
}

export const setExerciseNextNote = (
  routineId: string | undefined,
  routineName: string | undefined,
  exerciseId: string | undefined,
  exerciseName: string | undefined,
  text: string,
  options?: { pinned?: boolean },
) => {
  const trimmed = text.trim()
  if (!trimmed) return null
  const key = buildExerciseKey(routineId, routineName, exerciseId, exerciseName)
  if (!key) return null
  const existing = findNote(key)
  const linkedByName = !routineId || !exerciseId
  const note: NextSessionNote = {
    key,
    scope: "exercise",
    routineId,
    routineName,
    exerciseId,
    exerciseName,
    text: trimmed,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    pinned: options?.pinned ?? existing?.pinned,
    linkedByName,
  }
  return upsertNote(note)
}

export const clearExerciseNextNote = (
  routineId?: string,
  routineName?: string,
  exerciseId?: string,
  exerciseName?: string,
) => {
  const key = buildExerciseKey(routineId, routineName, exerciseId, exerciseName)
  if (!key) return
  removeNote(key)
}

export const markExerciseNextNoteDone = (
  routineId?: string,
  routineName?: string,
  exerciseId?: string,
  exerciseName?: string,
) => {
  const key = buildExerciseKey(routineId, routineName, exerciseId, exerciseName)
  if (!key) return
  markNoteCleared(key)
}

export const listNextNotesForRoutine = (routineId?: string, routineName?: string) => {
  const routineKey = buildRoutineKey(routineId, routineName)
  if (!routineKey) return []
  const store = loadStore()
  return store.notes.filter((note) => note.key.startsWith(routineKey) && !note.clearedAt)
}

