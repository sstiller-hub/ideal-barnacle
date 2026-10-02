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
import { IosSegmentedControl, IosSwitch } from "@/components/ios/controls"
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
        background: "var(--background)",
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
          <PanelBlock title="Appearance" description="Choose a light, dark, or system theme.">
            {isThemeReady ? (
              <IosSegmentedControl
                ariaLabel="Theme"
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "System" },
                ]}
                value={(theme as "light" | "dark" | "system") ?? "system"}
                onChange={(next) => setTheme(next)}
              />
            ) : (
              <div className="ios-panel__desc">Loading theme…</div>
            )}
          </PanelBlock>

          <PanelBlock
            title="Workout defaults"
            description="Use recent performance to prefill reps and weight when starting a workout."
          >
            <PanelToggle
              label="Smart progressive autofill"
              checked={progressiveAutofillEnabled}
              onChange={(next) => {
                setProgressiveAutofillEnabled(next)
                localStorage.setItem("progressive_autofill_enabled", String(next))
              }}
            />
          </PanelBlock>

          <PanelBlock
            title="Rest timer sound"
            description="Play a chime when the rest timer runs out. iPhones have no vibration API in the browser, so this is the only rest cue that reaches you with the phone in a pocket."
          >
            <PanelToggle
              label="Rest timer sound"
              checked={restSoundEnabled}
              onChange={(next) => {
                setRestSoundEnabledState(next)
                setRestSoundEnabled(next)
                // Turning it on is the one moment there is a user gesture
                // to unlock audio, so preview the cue here.
                if (next) playRestChime()
              }}
            />
          </PanelBlock>
        </SettingsSection>

        <SettingsSection
          icon={<CalendarDays size={17} strokeWidth={1.8} />}
          title="SCHEDULE & PROGRAMS"
          isExpanded={expandedSections.includes("schedule")}
          onToggle={() => toggleSection("schedule")}
        >
          <WorkoutScheduleEditor />

          <PanelBlock
            title="Reset program"
            description="Replace all routines and the schedule with the Growth v2 program."
          >
            <button type="button" className="ios-btn" data-tone="destructive" onClick={onResetGrowthV2}>
              Reset to Growth v2 (wipes old routines)
            </button>
          </PanelBlock>
        </SettingsSection>

        <SettingsSection
          icon={<Dumbbell size={17} strokeWidth={1.8} />}
          title="TRAINING"
          isExpanded={expandedSections.includes("training")}
          onToggle={() => toggleSection("training")}
        >
          <PanelBlock
            title="Deload week"
            description="Deload week reduces your training volume and intensity for 7 days to promote recovery. Sets are halved and weights are pre-filled at ~72% of your working weights — you can still edit everything manually."
          >
            {isDeload ? (
              <>
                <div className="ios-panel__desc" style={{ color: "var(--ink-70)" }}>
                  Deload active — ends{" "}
                  {deloadEndsAt?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <button
                  type="button"
                  className="ios-btn"
                  onClick={async () => {
                    await cancelDeload()
                    toast("Deload cancelled", { duration: 2000 })
                  }}
                >
                  Cancel deload
                </button>
              </>
            ) : (
              <button type="button" className="ios-btn" onClick={() => setDeloadConfirmOpen(true)}>
                Start deload week
              </button>
            )}
          </PanelBlock>
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
          <PanelBlock
            title="Import historical data"
            description="Import workout data from a CSV file — useful for migrating from other apps or importing historical records."
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                lineHeight: 1.5,
                color: "var(--ink-70)",
                background: "var(--ink-04)",
                borderRadius: "var(--radius-xs)",
                padding: "10px 12px",
                overflowX: "auto",
              }}
            >
              <div style={{ color: "var(--ink-50)" }}>CSV format</div>
              <div>Date,Workout,Exercise_Normalized,Set,Reps,Weight (lbs)</div>
              <div style={{ color: "var(--ink-50)" }}>2024-01-15,Push Day,Bench Press,1,10,135</div>
            </div>
            <label className="ios-btn" style={{ cursor: "pointer" }}>
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvFileChange}
                className="sr-only"
              />
              {csvFile ? csvFile.name : "Choose CSV file"}
            </label>
            <button
              type="button"
              className="ios-btn"
              data-tone="primary"
              onClick={handleImportCsv}
              disabled={!csvFile || importing}
            >
              <Upload size={16} strokeWidth={2} />
              {importing ? "Importing…" : "Import workouts"}
            </button>

            {importResult && (
              <div className="ios-panel__list">
                <div className="ios-panel__stat">
                  <span>Rows parsed</span>
                  <span>{importResult.rowsParsed}</span>
                </div>
                <div className="ios-panel__stat">
                  <span className="inline-flex items-center" style={{ gap: "6px" }}>
                    <CheckCircle2 size={14} style={{ color: "var(--good-ink)" }} /> Sessions created
                  </span>
                  <span style={{ color: "var(--good-ink)" }}>{importResult.sessionsCreated}</span>
                </div>
                {importResult.duplicatesSkipped > 0 && (
                  <div className="ios-panel__stat">
                    <span className="inline-flex items-center" style={{ gap: "6px" }}>
                      <AlertCircle size={14} style={{ color: "var(--warn-ink)" }} /> Duplicates skipped
                    </span>
                    <span style={{ color: "var(--warn-ink)" }}>{importResult.duplicatesSkipped}</span>
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="ios-panel__stat" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                    <span className="inline-flex items-center" style={{ gap: "6px", color: "var(--warn)" }}>
                      <XCircle size={14} /> Errors
                    </span>
                    <ul style={{ fontSize: "12px", color: "var(--ink-70)", marginTop: "4px" }}>
                      {importResult.errors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </PanelBlock>

          <PanelBlock
            title="Apple Health"
            description={`Export your workouts to Apple Health, then import the file in the Health app. ${workouts.length} ${plural(workouts.length, "workout", "workouts")} ready to export.`}
          >
            <button type="button" className="ios-btn" onClick={handleExportToHealth}>
              Export to Apple Health
            </button>
          </PanelBlock>

          <PanelBlock title="PR exclusions" description="Comma-separated list of exercises to hide from PR cards.">
            <textarea
              value={prExclusionInput}
              onChange={(e) => setPrExclusionInput(e.target.value)}
              rows={3}
              aria-label="PR exclusions"
              className="ios-textarea"
              placeholder="Side Crunch, Decline Bench Knee Raise"
            />
            <button type="button" className="ios-btn" onClick={handleSavePrExclusions}>
              {prExclusionSaved ? "Saved" : "Save exclusions"}
            </button>
          </PanelBlock>

          <PanelBlock
            title="Clear all data"
            description="Remove all workout data, routines, and personal records from this device. This cannot be undone."
          >
            <button type="button" className="ios-btn" data-tone="destructive" onClick={handleClearAllData}>
              Clear all data
            </button>
          </PanelBlock>
        </SettingsSection>

        <SettingsSection
          icon={<Smartphone size={17} strokeWidth={1.8} />}
          title="ABOUT & DEVICE"
          isExpanded={expandedSections.includes("about")}
          onToggle={() => toggleSection("about")}
        >
          <PanelBlock
            title="Install as app"
            description="Add Akt to your iPhone home screen: tap Share in Safari, choose “Add to Home Screen”, then tap Add."
          />
          <PanelBlock
            title="Data storage"
            description="All workout data is stored locally on this device unless you turn on cloud sync in Account & Sync."
          />
          <PanelBlock title="Version">
            <div className="ios-panel__desc" data-testid="app-version">
              {process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev"}
            </div>
          </PanelBlock>
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

      {isExpanded && <div className="ios-panel">{children}</div>}
    </>
  )
}

/** One titled block inside an expanded Settings section. */
function PanelBlock({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <section className="ios-panel__block">
      <h2 className="ios-panel__title">{title}</h2>
      {description ? <p className="ios-panel__desc">{description}</p> : null}
      {children}
    </section>
  )
}

/** Label + switch on one line, the iOS way of saying On/Off. */
function PanelToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between" style={{ gap: "12px", minHeight: "44px" }}>
      <span style={{ fontSize: "15px", color: "#fff" }}>{label}</span>
      <IosSwitch checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  )
}
