import type { PersonalRecord, EvaluatedPR, PRMetric } from "./pr-types"

const PR_STORAGE_KEY = "personal_records"
const USER_ID = "default_user" // In a real app, this would come from auth

// Get all PRs for the current user
export function getPersonalRecords(): PersonalRecord[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(PR_STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

// Get PRs for a specific exercise
export function getExercisePRs(exerciseId: string): PersonalRecord[] {
  const allPRs = getPersonalRecords()
  return allPRs.filter((pr) => pr.exerciseId === exerciseId && pr.userId === USER_ID)
}

// Get a specific PR by exercise and metric
export function getPRByExerciseAndMetric(exerciseId: string, metric: PRMetric): PersonalRecord | null {
  const exercisePRs = getExercisePRs(exerciseId)
  return exercisePRs.find((pr) => pr.metric === metric) || null
}

// Upsert a PR (update if exists, insert if new)
export function upsertPR(pr: Omit<PersonalRecord, "id" | "createdAt" | "updatedAt">): PersonalRecord {
  const allPRs = getPersonalRecords()
  const now = new Date().toISOString()

  // Find existing PR for this user/exercise/metric combination
  const existingIndex = allPRs.findIndex(
    (p) => p.userId === pr.userId && p.exerciseId === pr.exerciseId && p.metric === pr.metric,
  )

  let newPR: PersonalRecord

  if (existingIndex >= 0) {
    // Update existing PR
    newPR = {
      ...allPRs[existingIndex],
      ...pr,
      updatedAt: now,
    }
    allPRs[existingIndex] = newPR
  } else {
    // Create new PR
    newPR = {
      id: `pr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...pr,
      createdAt: now,
      updatedAt: now,
    }
    allPRs.push(newPR)
  }

  localStorage.setItem(PR_STORAGE_KEY, JSON.stringify(allPRs))
  return newPR
}

// Save multiple evaluated PRs at once
export function savePRs(evaluatedPRs: EvaluatedPR[]): PersonalRecord[] {
  const savedPRs: PersonalRecord[] = []

  for (const evaluatedPR of evaluatedPRs) {
    if (evaluatedPR.status === "new_pr" || evaluatedPR.status === "first_pr") {
      const pr = upsertPR({
        userId: USER_ID,
        exerciseId: evaluatedPR.exerciseId,
        exerciseName: evaluatedPR.exerciseName,
        metric: evaluatedPR.metric,
        valueNumber: evaluatedPR.newRecord.valueNumber,
        unit: evaluatedPR.newRecord.unit,
        contextJson: evaluatedPR.newRecord.context,
        achievedAt: evaluatedPR.newRecord.achievedAt,
      })
      savedPRs.push(pr)
    }
  }

  return savedPRs
}

// Get PRs grouped by exercise
export function getPRsByExercise(): Map<string, PersonalRecord[]> {
  const allPRs = getPersonalRecords().filter((pr) => pr.userId === USER_ID)
  const grouped = new Map<string, PersonalRecord[]>()

  for (const pr of allPRs) {
    const exerciseName = pr.exerciseName
    if (!grouped.has(exerciseName)) {
      grouped.set(exerciseName, [])
    }
    grouped.get(exerciseName)!.push(pr)
  }

  return grouped
}
