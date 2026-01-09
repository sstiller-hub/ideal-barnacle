// Seed script with sample workouts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database with sample workouts...")

  const sampleWorkouts = [
    {
      userId: "user_1",
      date: new Date("2025-01-15"),
      notes: "Chest & Triceps",
      exercises: [
        {
          id: "1",
          name: "Barbell Bench Press",
          type: "strength",
          sets: [
            { setIndex: 0, weight: 135, weightUnit: "lb", reps: 10 },
            { setIndex: 1, weight: 185, weightUnit: "lb", reps: 8 },
            { setIndex: 2, weight: 185, weightUnit: "lb", reps: 7 },
            { setIndex: 3, weight: 185, weightUnit: "lb", reps: 6 },
          ],
        },
        {
          id: "2",
          name: "Incline Dumbbell Press",
          type: "strength",
          sets: [
            { setIndex: 0, weight: 60, weightUnit: "lb", reps: 10 },
            { setIndex: 1, weight: 60, weightUnit: "lb", reps: 9 },
            { setIndex: 2, weight: 60, weightUnit: "lb", reps: 8 },
          ],
        },
      ],
    },
    {
      userId: "user_1",
      date: new Date("2025-01-17"),
      notes: "Back & Biceps",
      exercises: [
        {
          id: "3",
          name: "Barbell Deadlift",
          type: "strength",
          sets: [
            { setIndex: 0, weight: 225, weightUnit: "lb", reps: 8 },
            { setIndex: 1, weight: 275, weightUnit: "lb", reps: 5 },
            { setIndex: 2, weight: 275, weightUnit: "lb", reps: 5 },
          ],
        },
      ],
    },
  ]

  for (const workout of sampleWorkouts) {
    await prisma.workout.create({
      data: workout as any,
    })
  }

  console.log("Seeding completed!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
