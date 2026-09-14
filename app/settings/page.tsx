"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { plural } from "@/lib/utils"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { resetRoutinesToGrowthV2 } from "@/lib/routine-storage"
import { downloadHealthExport } from "@/lib/health-integration"
import { importWorkouts, type ImportResult } from "@/lib/import-workouts"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Upload,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays,
  ChevronRight,
  Database,
  Dumbbell,
  Palette,
  Smartphone,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { useTheme } from "next-themes"
import { resetScheduleToGrowthV2FixedDays } from "@/lib/schedule-storage"
import { clearInProgressWorkout } from "@/lib/autosave-workout-storage"
import { WorkoutScheduleEditor } from "@/components/workout-schedule-editor"
import { getPrExcludedExercises, setPrExcludedExercises } from "@/lib/pr-exclusions"
import { IosTabBar } from "@/components/ios/tab-bar"
import { IosLargeTitleHeader } from "@/components/ios/nav-bar"
import { IosGroup, IosRow } from "@/components/ios/grouped"
import { isRestSoundEnabled, playRestChime, setRestSoundEnabled } from "@/lib/session-feedback"
import { useDeloadWeek } from "@/hooks/useDeloadWeek"

export default function SettingsPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const csvFileInputRef = useRef<HTMLInputElement>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const hasGoogleDriveConfig = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const { theme, setTheme } = useTheme()
  const [isThemeReady, setIsThemeReady] = useState(false)
  const [progressiveAutofillEnabled, setProgressiveAutofillEnabled] = useState(true)
  const [restSoundEnabled, setRestSoundEnabledState] = useState(true)
  const [expandedSections, setExpandedSections] = useState<string[]>([])
  const [prExclusionInput, setPrExclusionInput] = useState("")
  const [prExclusionSaved, setPrExclusionSaved] = useState(false)
  const { isDeload, deloadEndsAt, startDeload, cancelDeload } = useDeloadWeek()
  const [deloadConfirmOpen, setDeloadConfirmOpen] = useState(false)

  useEffect(() => {
    setWorkouts(getWorkoutHistory())
    setLastSyncedAt(localStorage.getItem("last_synced_at"))
  }, [])

  useEffect(() => {
    setIsThemeReady(true)
  }, [])

  useEffect(() => {
    setRestSoundEnabledState(isRestSoundEnabled())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem("progressive_autofill_enabled")
    if (stored === null) return
    setProgressiveAutofillEnabled(stored === "true")
    const exclusions = getPrExcludedExercises()
    setPrExclusionInput(exclusions.join(", "))
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setCsvFile(selectedFile)
      setImportResult(null)
    }
  }

  const handleImportCsv = async () => {
    if (!csvFile) return

    setImporting(true)

    try {
      const text = await csvFile.text()
      const result = importWorkouts(text)
      setImportResult(result)
      setWorkouts(getWorkoutHistory())
    } catch (error) {
      setImportResult({
        rowsParsed: 0,
        sessionsCreated: 0,
        duplicatesSkipped: 0,
        errors: [(error as Error).message || "Failed to import CSV"],
      })
    } finally {
      setImporting(false)
    }
  }

  const handleExportToHealth = () => {
    if (workouts.length === 0) {
      alert("No workouts to export")
      return
    }
    downloadHealthExport(workouts)
    alert("Workout data exported! You can now import this file into the Apple Health app.")
  }

  const handleSavePrExclusions = () => {
    const parsed = prExclusionInput
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
    setPrExcludedExercises(parsed)
    setPrExclusionSaved(true)
    window.dispatchEvent(new Event("pr-exclusions:updated"))
    window.setTimeout(() => setPrExclusionSaved(false), 2000)
  }

  const handleClearAllData = () => {
    const confirmed = confirm(
      "This will permanently delete ALL your workout data, routines, and PRs. This cannot be undone. Are you sure?",
    )
    if (!confirmed) return

    const keysToRemove = [
      "workout_history",
      "personal_records",
      "workout_routines_v2",
      "workoutSessions",
      "workoutSets",
      "currentSessionId",
      "workout_schedule",
      "exercise_preferences",
    ]

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key)
    })

    setWorkouts([])

    alert("All data has been cleared!")

    setTimeout(() => {
      window.location.replace(window.location.href)
    }, 100)
  }

  function onResetGrowthV2() {
    const ok = window.confirm("Reset to Growth v2? This will wipe old routines and schedule.")
    if (!ok) return
    clearInProgressWorkout()
    resetRoutinesToGrowthV2()
    resetScheduleToGrowthV2FixedDays(365)
    window.location.href = "/"
    // if you have a toast util, call it here
  }


  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    )
  }

  // The account cell shows who you are and when the record last left the
  // device — the two facts worth surfacing before you tap into Account & Sync.
  const accountEmail = user?.email ?? null
  const accountName =
    (user?.user_metadata?.full_name as string | undefined) || accountEmail?.split("@")[0] || "Not signed in"
  const accountInitials =
    accountName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "—"
  const accountDetail = accountEmail
    ? `${accountEmail} · Synced ${
        lastSyncedAt
          ? new Date(lastSyncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "never"
      }`
    : "Sign in to sync across devices"

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: "100%",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--ios-tabbar-clearance))",
        background: "#000",
      }}
    >
      {/* Settings is a tab root now: large title, no back button. */}
      <IosLargeTitleHeader title="Settings" />

      {/* Account cell — the one 80pt row, pushing to Account & Sync. */}
      <IosGroup>
        <IosRow
          style={{ minHeight: "80px" }}
          icon={
            <span
              className="flex items-center justify-center"
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "999px",
                background: "var(--ink-15)",
                fontSize: "22px",
                fontWeight: 600,
                color: "#fff",
              }}
            >
              {accountInitials}
            </span>
          }
          label={<span style={{ fontSize: "19px" }}>{accountName}</span>}
          detail={accountDetail}
          chevron
          onClick={() => router.push("/settings/account")}
        />
      </IosGroup>

      {/* Group 1 — how training itself behaves. */}
      <IosGroup hasIcons style={{ marginTop: "20px" }}>
        <SettingsSection
          icon={<Palette size={17} strokeWidth={1.8} />}
          title="APPEARANCE & DEFAULTS"
          isExpanded={expandedSections.includes("appearance")}
          onToggle={() => toggleSection("appearance")}
        >
          <div className="mt-3 space-y-4">
              <div>
                <h2 className="font-bold text-base mb-2">Appearance</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose a light, dark, or system theme.
                </p>
                {isThemeReady ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={theme === "light" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setTheme("light")}
                    >
                      Light
                    </Button>
                    <Button
                      type="button"
                      variant={theme === "dark" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setTheme("dark")}
                    >
                      Dark
                    </Button>
                    <Button
                      type="button"
                      variant={theme === "system" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setTheme("system")}
                    >
                      System
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Loading theme…</div>
                )}
              </div>

              <div>
                <h2 className="font-bold text-base mb-2">Workout Defaults</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Use recent performance to prefill reps/weight when starting a workout.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">Smart progressive autofill</div>
                  <Button
                    type="button"
                    variant={progressiveAutofillEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const next = !progressiveAutofillEnabled
                      setProgressiveAutofillEnabled(next)
                      localStorage.setItem("progressive_autofill_enabled", String(next))
                    }}
                  >
                    {progressiveAutofillEnabled ? "On" : "Off"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-4 mb-4">
                  Play a chime when the rest timer runs out. iPhones have no
                  vibration API in the browser, so this is the only rest cue that
                  reaches you with the phone in a pocket.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">Rest timer sound</div>
                  <Button
                    type="button"
                    variant={restSoundEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const next = !restSoundEnabled
                      setRestSoundEnabledState(next)
                      setRestSoundEnabled(next)
                      // Turning it on is the one moment there is a user gesture
                      // to unlock audio, so preview the cue here.
                      if (next) playRestChime()
                    }}
                  >
                    {restSoundEnabled ? "On" : "Off"}
                  </Button>
                </div>
              </div>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={<CalendarDays size={17} strokeWidth={1.8} />}
          title="SCHEDULE & PROGRAMS"
          isExpanded={expandedSections.includes("schedule")}
          onToggle={() => toggleSection("schedule")}
        >
          <div className="mt-3 space-y-4">
              <WorkoutScheduleEditor />

              <div>
                <h2 className="font-bold text-base mb-2">Reset Program</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Replace all routines and schedule with the Growth v2 program.
                </p>
                <Button onClick={onResetGrowthV2} className="w-full" variant="destructive" uppercase={false}>
                  Reset to Growth v2 (Wipes old routines)
                </Button>
              </div>

          </div>
        </SettingsSection>

        <SettingsSection
          icon={<Dumbbell size={17} strokeWidth={1.8} />}
          title="TRAINING"
          isExpanded={expandedSections.includes("training")}
          onToggle={() => toggleSection("training")}
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Deload week reduces your training volume and intensity for 7 days to promote recovery. Sets are halved
                and weights are pre-filled at ~72% of your working weights — you can still edit everything manually.
              </p>

              {isDeload ? (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "var(--radius-xs)",
                    padding: "12px 14px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(255, 255, 255, 0.55)",
                      marginBottom: "8px",
                      fontFamily: "var(--font-label)",
                    }}
                  >
                    Deload active — ends{" "}
                    {deloadEndsAt?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                  <button
                    onClick={async () => {
                      await cancelDeload()
                      toast("Deload cancelled", { duration: 2000 })
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: "11px",
                      color: "rgba(255, 255, 255, 0.28)",
                      fontFamily: "var(--font-label)",
                      letterSpacing: "0.06em",
                      textDecoration: "underline",
                    }}
                    type="button"
                  >
                    Cancel deload
                  </button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setDeloadConfirmOpen(true)}>
                  Start Deload Week
                </Button>
              )}
            </div>
          </div>
        </SettingsSection>
      </IosGroup>

      {/* Group 2 — what the app holds and what it runs on. */}
      <IosGroup hasIcons style={{ marginTop: "20px" }}>
        <SettingsSection
          icon={<Database size={17} strokeWidth={1.8} />}
          title="DATA & INTEGRATIONS"
          isExpanded={expandedSections.includes("data")}
          onToggle={() => toggleSection("data")}
        >
          <div className="mt-3 space-y-4">
              <div>
                <h2 className="font-bold text-base mb-2">Import Historical Data</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Import workout data from CSV file. Useful for migrating from other apps or importing historical
                  records.
                </p>

                <div className="bg-muted p-3 rounded-lg font-mono text-xs mb-4">
                  <div className="font-semibold mb-1">CSV Format:</div>
                  <div>Date,Workout,Exercise_Normalized,Set,Reps,Weight (lbs)</div>
                  <div className="text-muted-foreground">2024-01-15,Push Day,Bench Press,1,10,135</div>
                </div>

                <div className="space-y-3">
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvFileChange}
                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                  />

                  <Button onClick={handleImportCsv} disabled={!csvFile || importing} className="w-full">
                    <Upload className="w-4 h-4 mr-2" />
                    {importing ? "Importing..." : "Import Workouts"}
                  </Button>
                </div>

                {importResult && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                      <span>Rows Parsed</span>
                      <span className="font-semibold">{importResult.rowsParsed}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-good-tint rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-good-ink" />
                        <span>Sessions Created</span>
                      </div>
                      <span className="font-semibold text-good-ink">{importResult.sessionsCreated}</span>
                    </div>

                    {importResult.duplicatesSkipped > 0 && (
                      <div className="flex items-center justify-between p-2 bg-warn-tint rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-warn-ink" />
                          <span>Duplicates Skipped</span>
                        </div>
                        <span className="font-semibold text-warn-ink">{importResult.duplicatesSkipped}</span>
                      </div>
                    )}

                    {importResult.errors.length > 0 && (
                      <div className="p-2 bg-red-500/10 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <XCircle className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium text-red-600">Errors</span>
                        </div>
                        <ul className="space-y-1 text-xs text-red-600">
                          {importResult.errors.map((error, idx) => (
                            <li key={idx}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h2 className="font-bold text-base mb-2">Apple Health Integration</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Export your workouts to Apple Health. After exporting, you can import the file into the Health app.
                </p>
                <Button onClick={handleExportToHealth} className="w-full">
                  Export to Apple Health
                </Button>
                <p className="text-xs text-muted-foreground mt-2">{workouts.length} {plural(workouts.length, "workout", "workouts")} ready to export</p>
              </div>

              <div>
                <h2 className="font-bold text-base mb-2">PR Exclusions</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Comma-separated list of exercises to hide from PR cards.
                </p>
                <textarea
                  value={prExclusionInput}
                  onChange={(e) => setPrExclusionInput(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Side Crunch, Decline Bench Knee Raise"
                />
                <Button onClick={handleSavePrExclusions} className="w-full mt-3" variant="secondary">
                  {prExclusionSaved ? "Saved" : "Save Exclusions"}
                </Button>
              </div>

              <div>
                <h2 className="font-bold text-base mb-2">Clear All Data</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Remove all workout data, routines, and personal records from your device. This cannot be undone.
                </p>
                <Button onClick={handleClearAllData} className="w-full" variant="destructive">
                  Clear All Data
                </Button>
              </div>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={<Smartphone size={17} strokeWidth={1.8} />}
          title="ABOUT & DEVICE"
          isExpanded={expandedSections.includes("about")}
          onToggle={() => toggleSection("about")}
        >
          <div className="mt-3 space-y-4">
              <div>
                <h2 className="font-bold text-base mb-2">Install as App</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Add this app to your iPhone home screen for a native app experience.
                </p>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p>1. Tap the Share button in Safari</p>
                  <p>2. Scroll down and tap &quot;Add to Home Screen&quot;</p>
                  <p>3. Tap &quot;Add&quot; in the top right</p>
                </div>
              </div>

              <div>
                <h2 className="font-bold text-base mb-2">Data Storage</h2>
                <p className="text-sm text-muted-foreground">
                  All workout data is stored locally on your device. Your data never leaves your phone.
                </p>
              </div>
              <div>
                <h2 className="font-bold text-base mb-2">Version</h2>
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="app-version"
                >
                  {process.env.NEXT_PUBLIC_APP_VERSION ||
                    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
                    "dev"}
                </p>
              </div>
          </div>
        </SettingsSection>
      </IosGroup>

      <div
        style={{
          padding: "26px 32px 0",
          fontSize: "13px",
          color: "var(--ink-40)",
          textAlign: "center",
        }}
      >
        Akt {process.env.NEXT_PUBLIC_APP_VERSION || "2.4"} ({workouts.length})
      </div>

      <IosTabBar active="settings" />

        <AlertDialog open={deloadConfirmOpen} onOpenChange={setDeloadConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Deload Week</AlertDialogTitle>
              <AlertDialogDescription>
                Deload week reduces your volume and intensity for 7 days to promote recovery. Your workouts will
                auto-adjust — sets are halved and weights are pre-filled at ~72% of your working weights. You can
                still edit everything manually.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await startDeload()
                  setDeloadConfirmOpen(false)
                  toast.success("Deload week started", { duration: 3000 })
                }}
              >
                Start Deload
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

    </div>
  )
}

/**
 * One section of the Settings root, rendered as a grouped-list row.
 *
 * The section still expands in place — its body drops in underneath the row,
 * inside the same group — but the row itself now reads as an iOS cell: 29pt
 * monochrome icon tile, 17pt white label, disclosure chevron that turns when
 * the section is open.
 */
function SettingsSection({
  icon,
  title,
  children,
  isExpanded,
  onToggle,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
}) {
  // "APPEARANCE & DEFAULTS" → "Appearance & Defaults": iOS cells are sentence
  // case, not the tracked label-font caps the old accordion used.
  const label = title
    .toLowerCase()
    .replace(/(^|\s|&\s)([a-z])/g, (match, prefix, letter: string) => `${prefix}${letter.toUpperCase()}`)

  return (
    <>
      <button type="button" className="ios-row" onClick={onToggle} aria-expanded={isExpanded}>
        <span className="ios-tile">{icon}</span>
        <span style={{ flex: "1 1 auto", minWidth: 0 }}>{label}</span>
        <ChevronRight
          size={18}
          strokeWidth={2}
          className="ios-row__chevron transition-transform duration-base"
          style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </button>

      {isExpanded && (
        <div style={{ padding: "4px 16px 18px 16px" }}>
          {children}
        </div>
      )}
    </>
  )
}
