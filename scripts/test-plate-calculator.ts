// Basic tests for plate calculator logic
// IMPORTANT: targetWeight represents TOTAL PLATES LOADED (not including bar)

import { computePlates, formatPlateText } from "../lib/plate-calculator"

function assertEqual(actual: any, expected: any, testName: string) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr === expectedStr) {
    console.log(`✓ ${testName}`)
  } else {
    console.error(`✗ ${testName}`)
    console.error(`  Expected: ${expectedStr}`)
    console.error(`  Got: ${actualStr}`)
  }
}

function runTests() {
  console.log("Running Plate Calculator Tests...\n")
  console.log("Note: targetWeight = TOTAL PLATES LOADED (divided by 2 for per side)\n")

  // Test 1: Exact calculation - 90 lbs total plates (45 per side)
  const test1 = computePlates(90)
  assertEqual(test1.weightPerSide, 45, "90 lbs total plates should be 45 lbs per side")
  assertEqual(test1.isExact, true, "90 lbs should be exactly achievable")
  assertEqual(test1.achievableWeight, 90, "90 lbs should achieve exactly 90")
  assertEqual(formatPlateText(test1), "45", "90 lbs should use one 45 per side")

  // Test 2: Zero weight
  const test2 = computePlates(0)
  assertEqual(test2.platesPerSide.length, 0, "0 lbs should have no plates")
  assertEqual(test2.weightPerSide, 0, "0 lbs should be 0 per side")

  // Test 3: Negative weight
  const test3 = computePlates(-10)
  assertEqual(test3.platesPerSide.length, 0, "Negative weight should have no plates")
  assertEqual(test3.weightPerSide, 0, "Negative weight should be 0 per side")

  // Test 4: Complex weight - 270 lbs total plates (135 per side)
  const test4 = computePlates(270)
  assertEqual(test4.weightPerSide, 135, "270 lbs total plates should be 135 lbs per side")
  assertEqual(test4.isExact, true, "270 lbs should be exactly achievable")
  assertEqual(formatPlateText(test4), "45 + 45 + 45", "270 lbs should use three 45s per side")

  // Test 5: Weight requiring mixed plates - 140 lbs total (70 per side)
  const test5 = computePlates(140)
  assertEqual(test5.weightPerSide, 70, "140 lbs total plates should be 70 lbs per side")
  assertEqual(formatPlateText(test5), "45 + 25", "140 lbs should use 45 + 25 per side")

  // Test 6: Weight with fractional plates - 95 lbs total (47.5 per side)
  const test6 = computePlates(95)
  assertEqual(test6.weightPerSide, 47.5, "95 lbs should be 47.5 per side")
  assertEqual(formatPlateText(test6), "45 + 2.5", "95 lbs should use 45 + 2.5 per side")

  // Test 7: Unachievable weight (rounds down) - 96 lbs total
  const test7 = computePlates(96)
  assertEqual(test7.isExact, false, "96 lbs should not be exactly achievable")
  assertEqual(test7.achievableWeight, 95, "96 lbs should round down to 95")

  // Test 8: Invalid input (NaN)
  const test8 = computePlates(Number.NaN)
  assertEqual(test8.platesPerSide.length, 0, "NaN should have no plates")
  assertEqual(test8.weightPerSide, 0, "NaN should be 0 per side")

  // Test 9: Large weight - 450 lbs total (225 per side)
  const test9 = computePlates(450)
  assertEqual(test9.weightPerSide, 225, "450 lbs should be 225 per side")
  assertEqual(formatPlateText(test9), "45 + 45 + 45 + 45 + 45", "450 lbs should use five 45s per side")

  // Test 10: Small exact weight - 10 lbs total (5 per side)
  const test10 = computePlates(10)
  assertEqual(test10.weightPerSide, 5, "10 lbs should be 5 per side")
  assertEqual(formatPlateText(test10), "5", "10 lbs should use one 5 per side")

  // Test 11: Mixed plates example - 160 lbs total (80 per side)
  const test11 = computePlates(160)
  assertEqual(test11.weightPerSide, 80, "160 lbs should be 80 per side")
  assertEqual(formatPlateText(test11), "45 + 35", "160 lbs should use 45 + 35 per side")

  console.log("\nAll tests completed!")
}

runTests()
