"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { BottomNav } from "@/components/bottom-nav"
import { WorkoutScheduleEditor } from "@/components/workout-schedule-editor"

export default function SchedulePage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between">
        <Link href="/" className="text-xl">
          ←
        </Link>
        <h1 className="text-lg font-bold">Schedule</h1>
        <div className="w-6" />
      </header>

      <main className="p-4">
        <Card className="p-4">
          <WorkoutScheduleEditor />
        </Card>
      </main>

      <BottomNav />
    </div>
  )
}
