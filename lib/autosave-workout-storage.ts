export type WorkoutStatus = "in_progress" | "paused" | "completed"

export interface WorkoutSession {
  id: string
  workoutId?: string
  startedAt: string
  endedAt?: string
  status: WorkoutStatus
  notes?: string
  routineId?: string
  routineName?: string
  remoteSessionId?: string
  activeDurationSeconds: number
  currentExerciseIndex?: number
  exercises?: any[]
  restTimer?: {
    exerciseIndex: number
    setIndex: number
    remainingSeconds: number
    startedAt?: string
  }
  lastActiveAt?: string
}

export interface WorkoutSet {
  id: string
  sessionId: string
  exerciseName: string
  setNumber: number
  weight: number | null
  reps: number | null
  rpe?: number | null
  isCompleted: boolean
  validationFlags?: string[]
  isOutlier?: boolean
  isIncomplete?: boolean
}

const SESSIONS_KEY = "workoutSessions"
const SETS_KEY = "workoutSets"
const CURRENT_SESSION_KEY = "currentSessionId"

// Session helpers
export function loadSessions(): WorkoutSession[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(SESSIONS_KEY)
  return stored ? JSON.parse(stored) : []
}

export function saveSessions(sessions: WorkoutSession[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

export function saveSession(session: WorkoutSession): void {
  const sessions = loadSessions()
  const index = sessions.findIndex((s) => s.id === session.id)
  if (index >= 0) {
    sessions[index] = session
  } else {
    sessions.push(session)
  }
  saveSessions(sessions)
}

export function getSessionById(sessionId: string): WorkoutSession | null {
  const sessions = loadSessions()
  return sessions.find((s) => s.id === sessionId) || null
}

export function updateSetForSession(
  sessionId: string,
  exerciseId: string,
  setIndex: number,
  patch: Partial<WorkoutSet>,
): WorkoutSession | null {
  const session = getSessionById(sessionId)
  if (!session?.exercises) return session || null
  const exercises = session.exercises.map((exercise: any) => {
    if (exercise.id !== exerciseId) return exercise
    const sets = Array.isArray(exercise.sets)
      ? exercise.sets.map((set: any, idx: number) => (idx === setIndex ? { ...set, ...patch } : set))
      : []
    return { ...exercise, sets }
  })
  const updated = { ...session, exercises }
  saveSession(updated)
  return updated
}

export function addSetToSession(
  sessionId: string,
  exerciseId: string,
  newSet: WorkoutSet,
): WorkoutSession | null {
  const session = getSessionById(sessionId)
  if (!session?.exercises) return session || null
  const exercises = session.exercises.map((exercise: any) => {
    if (exercise.id !== exerciseId) return exercise
    const sets = Array.isArray(exercise.sets) ? [...exercise.sets, newSet] : [newSet]
    return { ...exercise, sets }
  })
  const updated = { ...session, exercises }
  saveSession(updated)
  return updated
}

export function removeSetFromSession(
  sessionId: string,
  exerciseId: string,
  setIndex: number,
): WorkoutSession | null {
  const session = getSessionById(sessionId)
  if (!session?.exercises) return session || null
  const exercises = session.exercises.map((exercise: any) => {
    if (exercise.id !== exerciseId) return exercise
    const sets = Array.isArray(exercise.sets)
      ? exercise.sets.filter((_: any, idx: number) => idx !== setIndex)
      : []
    return { ...exercise, sets }
  })
  const updated = { ...session, exercises }
  saveSession(updated)
  return updated
}

export function deleteSession(sessionId: string): void {
  const sessions = loadSessions()
  const filtered = sessions.filter((s) => s.id !== sessionId)
  saveSessions(filtered)
}

// Set helpers
export function loadSets(): WorkoutSet[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(SETS_KEY)
  return stored ? JSON.parse(stored) : []
}

export function saveSets(sets: WorkoutSet[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SETS_KEY, JSON.stringify(sets))
}

export function saveSet(set: WorkoutSet): void {
  const sets = loadSets()
  const index = sets.findIndex((s) => s.id === set.id)
  if (index >= 0) {
    sets[index] = set
  } else {
    sets.push(set)
  }
  saveSets(sets)
}

export function getSetsForSession(sessionId: string): WorkoutSet[] {
  const sets = loadSets()
  return sets.filter((s) => s.sessionId === sessionId).sort((a, b) => a.setNumber - b.setNumber)
}

export function deleteSetsForSession(sessionId: string): void {
  const sets = loadSets()
  const filtered = sets.filter((s) => s.sessionId !== sessionId)
  saveSets(filtered)
}

export function deleteSet(setId: string): void {
  const sets = loadSets()
  const filtered = sets.filter((s) => s.id !== setId)
  saveSets(filtered)
}

// Current session helpers
export function loadCurrentSessionId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(CURRENT_SESSION_KEY)
}

export function saveCurrentSessionId(sessionId: string | null): void {
  if (typeof window === "undefined") return
  if (sessionId) {
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId)
  } else {
    localStorage.removeItem(CURRENT_SESSION_KEY)
  }
}

// Get current in-progress session
export function getCurrentInProgressSession(): WorkoutSession | null {
  const currentId = loadCurrentSessionId()
  if (currentId) {
    const session = getSessionById(currentId)
    if (session && (session.status === "in_progress" || session.status === "paused")) {
      return session
    }
  }

  const sessions = loadSessions().filter(
    (session) => session.status === "in_progress" || session.status === "paused",
  )
  if (sessions.length === 0) return null

  const mostRecent = sessions.reduce((latest, session) => {
    const latestStart = latest?.startedAt ? new Date(latest.startedAt).getTime() : 0
    const sessionStart = session.startedAt ? new Date(session.startedAt).getTime() : 0
    return sessionStart > latestStart ? session : latest
  }, sessions[0])

  saveCurrentSessionId(mostRecent.id)
  return mostRecent
}

// Clear completed sessions older than 30 days
export function cleanupOldSessions(): void {
  const sessions = loadSessions()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const filtered = sessions.filter((s) => {
    if (s.status === "in_progress") return true
    if (s.endedAt) {
      return new Date(s.endedAt) > thirtyDaysAgo
    }
    return true
  })

  saveSessions(filtered)
}

export function clearInProgressWorkout(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(SESSIONS_KEY)
  localStorage.removeItem(SETS_KEY)
  localStorage.removeItem(CURRENT_SESSION_KEY)
}
