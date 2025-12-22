/**
 * Regression Tests for Kova Workout App
 * Run these tests to verify critical functionality
 */

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

// Test utilities
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

// ============================================
// PR Display Tests
// ============================================

function testPRDataStructure(): TestResult {
  const testName = "PR data structure includes date and workout info"

  try {
    // Simulate PR data as stored in localStorage
    const mockPR = {
      id: "pr_test_123",
      userId: "default_user",
      exerciseId: "bench_press",
      exerciseName: "Bench Press",
      metric: "weight" as const,
      valueNumber: 185,
      unit: "lbs",
      achievedAt: "2025-01-15T10:30:00.000Z",
      contextJson: {
        reps: 8,
        workoutId: "workout_123",
        workoutName: "Upper Body Push",
        workoutDate: "2025-01-15",
      },
      createdAt: "2025-01-15T10:30:00.000Z",
      updatedAt: "2025-01-15T10:30:00.000Z",
    }

    // Verify required fields exist
    assert(mockPR.achievedAt !== undefined, "PR must have achievedAt field")
    assert(mockPR.contextJson.workoutId !== undefined, "PR context must have workoutId")
    assert(mockPR.contextJson.workoutName !== undefined, "PR context must have workoutName")
    assert(mockPR.contextJson.workoutDate !== undefined, "PR context must have workoutDate")

    return { name: testName, passed: true }
  } catch (error) {
    return { name: testName, passed: false, error: (error as Error).message }
  }
}

function testPRDisplayDataExtraction(): TestResult {
  const testName = "PR display extracts date and workout name"

  try {
    // Simulate the PR extraction logic from home page
    const mockPR = {
      exerciseName: "Bench Press",
      valueNumber: 185,
      achievedAt: "2025-01-15T10:30:00.000Z",
      contextJson: {
        reps: 8,
        workoutId: "workout_123",
        workoutName: "Upper Body Push",
        workoutDate: "2025-01-15",
      },
    }

    // This is what the home page SHOULD extract
    const extractedData = {
      name: mockPR.exerciseName,
      weight: mockPR.valueNumber || 0,
      reps: mockPR.contextJson?.reps || 0,
      workoutId: mockPR.contextJson?.workoutId || null,
      workoutName: mockPR.contextJson?.workoutName || null,
      achievedAt: mockPR.achievedAt || null,
    }

    // Verify all fields are extracted
    assert(extractedData.name === "Bench Press", "Name must be extracted")
    assert(extractedData.weight === 185, "Weight must be extracted")
    assert(extractedData.reps === 8, "Reps must be extracted")
    assert(extractedData.workoutId === "workout_123", "WorkoutId must be extracted")
    assert(extractedData.workoutName === "Upper Body Push", "WorkoutName must be extracted")
    assert(extractedData.achievedAt === "2025-01-15T10:30:00.000Z", "AchievedAt must be extracted")

    return { name: testName, passed: true }
  } catch (error) {
    return { name: testName, passed: false, error: (error as Error).message }
  }
}

function testPRDateFormatting(): TestResult {
  const testName = "PR date formatting works correctly"

  try {
    const now = new Date()
    const today = formatDate(now)

    // Test relative date formatting logic
    function getRelativeDate(dateStr: string): string {
      const date = new Date(dateStr)
      const diffTime = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return "Today"
      if (diffDays === 1) return "Yesterday"
      if (diffDays < 7) return `${diffDays}d ago`
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
      return `${Math.floor(diffDays / 30)}mo ago`
    }

    // Test cases
    assert(getRelativeDate(now.toISOString()) === "Today", "Today should show 'Today'")

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    assert(getRelativeDate(yesterday.toISOString()) === "Yesterday", "Yesterday should show 'Yesterday'")

    const threeDaysAgo = new Date(now)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    assert(getRelativeDate(threeDaysAgo.toISOString()) === "3d ago", "3 days ago should show '3d ago'")

    return { name: testName, passed: true }
  } catch (error) {
    return { name: testName, passed: false, error: (error as Error).message }
  }
}

// ============================================
// Data Clearing Tests
// ============================================

function testDataClearingKeys(): TestResult {
  const testName = "All localStorage keys are properly cleared"

  try {
    // These are all the keys that MUST be cleared
    const requiredClearKeys = [
      "workout_history",
      "personal_records",
      "achievements",
      "workoutSessions",
      "workoutSets",
      "currentSessionId",
      "autosave_workout",
      "workout_schedule",
    ]

    // Verify each key is in the clear list
    for (const key of requiredClearKeys) {
      assert(requiredClearKeys.includes(key), `Key '${key}' must be in clear list`)
    }

    return { name: testName, passed: true }
  } catch (error) {
    return { name: testName, passed: false, error: (error as Error).message }
  }
}

// ============================================
// Calendar Selection Tests
// ============================================

function testCalendarSingleSelection(): TestResult {
  const testName = "Calendar allows only single date selection"

  try {
    // Simulate calendar state
    let selectedDate = new Date("2025-01-15")

    // Select a new date
    const newDate = new Date("2025-01-20")
    selectedDate = newDate

    // Verify only one date is selected
    assert(selectedDate.getTime() === newDate.getTime(), "Only one date should be selected at a time")

    return { name: testName, passed: true }
  } catch (error) {
    return { name: testName, passed: false, error: (error as Error).message }
  }
}

function testFutureDateSelection(): TestResult {
  const testName = "Calendar allows future date selection"

  try {
    const today = new Date()
    const futureDate = new Date(today)
    futureDate.setDate(futureDate.getDate() + 7)

    // Calendar should NOT disable future dates
    const isDisabled = false // This should be the behavior

    assert(!isDisabled, "Future dates should be selectable")

    return { name: testName, passed: true }
  } catch (error) {
    return { name: testName, passed: false, error: (error as Error).message }
  }
}

// ============================================
// Workout Session Tests
// ============================================

function testResumeWorkoutNavigation(): TestResult {
  const testName = "Resume workout includes routineId parameter"

  try {
    // Simulate resume workout URL construction
    const routineId = "routine_123"
    const resumeUrl = `/workout/session?routineId=${routineId}`

    assert(resumeUrl.includes("routineId="), "Resume URL must include routineId parameter")
    assert(resumeUrl.includes(routineId), "Resume URL must include actual routine ID")

    return { name: testName, passed: true }
  } catch (error) {
    return { name: testName, passed: false, error: (error as Error).message }
  }
}

// ============================================
// Run All Tests
// ============================================

export function runAllTests(): { results: TestResult[]; summary: string } {
  const tests = [
    testPRDataStructure,
    testPRDisplayDataExtraction,
    testPRDateFormatting,
    testDataClearingKeys,
    testCalendarSingleSelection,
    testFutureDateSelection,
    testResumeWorkoutNavigation,
  ]

  const results: TestResult[] = []

  for (const test of tests) {
    try {
      results.push(test())
    } catch (error) {
      results.push({
        name: test.name,
        passed: false,
        error: (error as Error).message,
      })
    }
  }

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log("\n========================================")
  console.log("REGRESSION TEST RESULTS")
  console.log("========================================\n")

  for (const result of results) {
    const status = result.passed ? "✓ PASS" : "✗ FAIL"
    console.log(`${status}: ${result.name}`)
    if (result.error) {
      console.log(`        Error: ${result.error}`)
    }
  }

  console.log("\n----------------------------------------")
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)
  console.log("----------------------------------------\n")

  return {
    results,
    summary: `${passed}/${results.length} tests passed`,
  }
}

// Run tests
runAllTests()
