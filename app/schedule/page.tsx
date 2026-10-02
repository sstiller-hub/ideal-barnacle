"use client"

import { useRouter } from "next/navigation"
import { WorkoutScheduleEditor } from "@/components/workout-schedule-editor"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosCard } from "@/components/ios/grouped"

export default function SchedulePage() {
  const router = useRouter()
  return (
    <main style={{ minHeight: "100%", background: "var(--background)", paddingBottom: "40px" }}>
      <IosNavPage backLabel="Home" onBack={() => router.push("/")} title="Schedule">
        <IosCard style={{ paddingTop: "4px", paddingBottom: "8px" }}>
          <WorkoutScheduleEditor />
        </IosCard>
      </IosNavPage>
    </main>
  )
}
