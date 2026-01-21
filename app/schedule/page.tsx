"use client"

import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { WorkoutScheduleEditor } from "@/components/workout-schedule-editor"
import { ChevronLeft } from "lucide-react"

export default function SchedulePage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors duration-200"
          style={{
            background: "transparent",
            border: "none",
            padding: "0",
            cursor: "pointer",
          }}
          aria-label="Back to home"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          <span style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.01em" }}>
            Back
          </span>
        </button>
        <h1 className="text-lg font-bold">Schedule</h1>
        <div className="w-6" />
      </header>

      <main className="p-4">
        <Card className="p-4">
          <WorkoutScheduleEditor />
        </Card>
      </main>

    </div>
  )
}
