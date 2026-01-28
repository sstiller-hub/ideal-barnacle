"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import { resetRoutinesToGrowthV2 } from "@/lib/routine-storage"
import { downloadHealthExport } from "@/lib/health-integration"
import { seedDemoData } from "@/lib/seed-demo-data"
import { importWorkouts, type ImportResult } from "@/lib/import-workouts"
import {
  backupToGoogleDrive,
  restoreFromGoogleDrive,
  downloadBackupFile,
  restoreFromFile,
} from "@/lib/google-drive-backup"
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
import { Upload, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react"
import { signInWithGoogle } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { useTheme } from "next-themes"
import { resetScheduleToGrowthV2FixedDays } from "@/lib/schedule-storage"
import { clearInProgressWorkout } from "@/lib/autosave-workout-storage"
import { WorkoutScheduleEditor } from "@/components/workout-schedule-editor"
import {
  buildWyzeEntries,
  parseWyzeFile,
  type WyzeParseResult,
} from "@/lib/wyze-weight-import"
import { runManualSync, type ManualSyncReport } from "@/lib/workout-manual-sync"

export default function SettingsPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [syncStatus, setSyncStatus] = useState<string>("")
  const [isSyncing, setIsSyncing] = useState(false)
  const [backupStatus, setBackupStatus] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvFileInputRef = useRef<HTMLInputElement>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [wyzeParseResult, setWyzeParseResult] = useState<WyzeParseResult | null>(null)
  const [wyzeImporting, setWyzeImporting] = useState(false)
  const [wyzeImportStatus, setWyzeImportStatus] = useState<string>("")
  const [wyzeEntries, setWyzeEntries] = useState<
    Array<{ id: string; measured_at: string; weight_lb: number | null; weight_kg: number | null; source: string }>
  >([])
  const hasGoogleDriveConfig = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const { theme, setTheme } = useTheme()
  const [isThemeReady, setIsThemeReady] = useState(false)
  const [progressiveAutofillEnabled, setProgressiveAutofillEnabled] = useState(true)
  const [expandedSections, setExpandedSections] = useState<string[]>(["account"])
  const [manualSyncRunning, setManualSyncRunning] = useState(false)
  const [manualSyncReport, setManualSyncReport] = useState<ManualSyncReport | null>(null)
  const [manualSyncConfirmOpen, setManualSyncConfirmOpen] = useState(false)
  const [manualSyncIncludeSynced, setManualSyncIncludeSynced] = useState(false)
  const [manualSyncForceOverwrite, setManualSyncForceOverwrite] = useState(false)
  const [manualSyncRetryFailedOnly, setManualSyncRetryFailedOnly] = useState(false)
  const [manualSyncCandidateCount, setManualSyncCandidateCount] = useState<number | null>(null)
  const [manualSyncProgress, setManualSyncProgress] = useState<{
    current: number
    total: number
    currentWorkoutId?: string
    synced: number
    skipped: number
    conflicts: number
    errors: number
  } | null>(null)

  useEffect(() => {
    setWorkouts(getWorkoutHistory())
  }, [])

  useEffect(() => {
    setIsThemeReady(true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem("progressive_autofill_enabled")
    if (stored === null) return
    setProgressiveAutofillEnabled(stored === "true")
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadWyzeEntries = async (userId: string) => {
    const { data, error } = await supabase
      .from("body_weight_entries")
      .select("id, measured_at, weight_lb, weight_kg, source")
      .eq("user_id", userId)
      .eq("source", "wyze_import")
      .order("measured_at", { ascending: false })
      .limit(50)
    if (error) return
    setWyzeEntries(data ?? [])
  }

  useEffect(() => {
    if (!user?.id) return
    void loadWyzeEntries(user.id)
  }, [user?.id])

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

  const handleWyzeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    setWyzeImportStatus("")
    setWyzeParseResult(null)
    try {
      const result = await parseWyzeFile(selectedFile)
      setWyzeParseResult(result)
    } catch (error) {
      setWyzeParseResult({
        rows: [],
        totalRows: 0,
        validRows: 0,
        skippedRows: 0,
        range: null,
        errors: ["Unable to parse file."],
      })
    }
  }

  const handleWyzeImport = async () => {
    if (!wyzeParseResult || !user?.id) return
    setWyzeImporting(true)
    setWyzeImportStatus("")
    try {
      if (wyzeParseResult.rows.length === 0) {
        setWyzeImportStatus("No valid rows to import.")
        return
      }
      const entries = await buildWyzeEntries(user.id, wyzeParseResult.rows)
      const dedupedMap = new Map(entries.map((entry) => [entry.source_row_id, entry]))
      const dedupedEntries = Array.from(dedupedMap.values())
      const { error } = await supabase
        .from("body_weight_entries")
        .upsert(dedupedEntries, { onConflict: "user_id,source,source_row_id" })
      if (error) {
        const detail = [error.message, error.details, error.hint].filter(Boolean).join(" • ")
        setWyzeImportStatus(detail ? `Import failed: ${detail}` : "Import failed.")
        return
      }
      const duplicateCount = entries.length - dedupedEntries.length
      const suffix = duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ""
      setWyzeImportStatus(`Imported ${dedupedEntries.length} rows.${suffix}`)
      await loadWyzeEntries(user.id)
    } finally {
      setWyzeImporting(false)
    }
  }

  const handleDeleteWyzeEntry = async (entryId: string) => {
    if (!user?.id) return
    const { error } = await supabase
      .from("body_weight_entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", user.id)
    if (!error) {
      setWyzeEntries((prev) => prev.filter((entry) => entry.id !== entryId))
    }
  }

  const handleDeleteAllWyzeEntries = async () => {
    if (!user?.id) return
    const { error } = await supabase
      .from("body_weight_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("source", "wyze_import")
    if (!error) {
      setWyzeEntries([])
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

  const handleClearAllData = () => {
    const confirmed = confirm(
      "This will permanently delete ALL your workout data, routines, and PRs. This cannot be undone. Are you sure?",
    )
    if (!confirmed) return

    const keysToRemove = [
      "workout_history",
      "personal_records",
      "workout_routines",
      "workout_routines_v2",
      "workoutSessions",
      "workoutSets",
      "currentSessionId",
      "current_session_id",
      "workout_session",
      "autosave_workout_session",
      "workout_achievements",
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

  const handleSeedDemoData = () => {
    const confirmed = confirm("This will replace all existing data with demo data. Are you sure?")
    if (!confirmed) return

    const result = seedDemoData()

    setWorkouts(getWorkoutHistory())

    alert(`Demo data loaded! Added ${result.workouts} workouts and ${result.prs} personal records.`)

    setTimeout(() => {
      window.location.href = window.location.origin
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


  const handleBackupToGoogleDrive = async () => {
    setBackupStatus("Connecting to Google Drive...")
    const result = await backupToGoogleDrive()
    setBackupStatus("")
    alert(result.message)
  }

  const handleRestoreFromGoogleDrive = async () => {
    const confirmed = confirm("This will replace all current data with the backup. Continue?")
    if (!confirmed) return

    setBackupStatus("Connecting to Google Drive...")
    const result = await restoreFromGoogleDrive()
    setBackupStatus("")
    if (result.success) {
      setWorkouts(getWorkoutHistory())
      window.location.reload()
    }
    alert(result.message)
  }

  const handleDownloadBackup = () => {
    downloadBackupFile()
    alert("Backup file downloaded successfully!")
  }

  const handleRestoreFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const confirmed = confirm("This will replace all current data with the backup. Continue?")
    if (!confirmed) {
      e.target.value = ""
      return
    }

    const result = await restoreFromFile(file)
    if (result.success) {
      setWorkouts(getWorkoutHistory())
      window.location.reload()
    }
    alert(result.message)
    e.target.value = ""
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    )
  }

  useEffect(() => {
    if (!expandedSections.includes("account")) return
    let active = true
    const loadCount = async () => {
      const { listAllWorkouts } = await import("@/lib/workout-draft-storage")
      const drafts = await listAllWorkouts()
      const ids = new Set<string>()
      drafts.forEach((draft) => {
        if (draft.sets.length === 0) return
        if (manualSyncRetryFailedOnly && draft.sync_state !== "error" && draft.sync_state !== "pending") return
        if (!manualSyncIncludeSynced && draft.sync_state === "synced") return
        ids.add(draft.workout_id)
      })
      getWorkoutHistory().forEach((workout) => {
        ids.add(workout.id)
      })
      if (active) {
        setManualSyncCandidateCount(ids.size)
      }
    }
    void loadCount()
    return () => {
      active = false
    }
  }, [expandedSections, manualSyncIncludeSynced, manualSyncRetryFailedOnly, workouts.length])

  const handleManualSync = async (dryRun: boolean, retryFailedOnlyOverride?: boolean) => {
    if (!user) {
      alert("Please sign in to sync.")
      return
    }
    setManualSyncRunning(true)
    setManualSyncReport(null)
    setManualSyncProgress(null)
    setManualSyncConfirmOpen(false)
    try {
      const report = await runManualSync({
        dryRun,
        includeSynced: manualSyncIncludeSynced,
        forceOverwrite: manualSyncForceOverwrite,
        retryFailedOnly: retryFailedOnlyOverride ?? manualSyncRetryFailedOnly,
        onProgress: (payload) => setManualSyncProgress(payload),
      })
      setManualSyncReport(report)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Manual sync failed"
      setManualSyncReport({
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        dryRun,
        total: 0,
        attempted: 0,
        synced: 0,
        skipped: 0,
        conflicts: 0,
        errors: 1,
        results: [
          {
            workout_id: "unknown",
            started_at: null,
            completed_at: null,
            status: "error",
            error: message,
          },
        ],
      })
    } finally {
      setManualSyncRunning(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "100%", paddingBottom: "40px", background: "#0A0A0C" }}>
      <div className="px-4 pt-4">
        <div className="relative flex items-center justify-between mb-8 flex-shrink-0">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors duration-200"
            style={{
              background: "transparent",
              border: "none",
              padding: "0",
              cursor: "pointer",
            }}
            aria-label="Back to home"
            type="button"
          >
            <ChevronLeft size={16} strokeWidth={2} />
            <span style={{ fontSize: "11px", fontWeight: 400, letterSpacing: "0.01em" }}>
              Back
            </span>
          </button>
          <h1
            className="text-white/95 absolute left-1/2 transform -translate-x-1/2"
            style={{ fontSize: "16px", fontWeight: 500, letterSpacing: "-0.01em" }}
          >
            Settings
          </h1>
        </div>

        <div className="space-y-4">
          <SettingsSection
            id="account"
            title="ACCOUNT & SYNC"
            isExpanded={expandedSections.includes("account")}
            onToggle={() => toggleSection("account")}
          >
            <SettingItem label="Sign in" />
            <SettingItem label="Cloud Sync" />
            <SettingItem label="Manual Sync" />
            <SettingItem label="Google Drive Backup" />
            <SettingItem label="Local Backup" />
            <div className="mt-3 space-y-4">
              {user ? (
                <div>
                  <h2 className="font-bold text-base mb-2">Signed in</h2>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={async () => {
                      await supabase.auth.signOut()
                    }}
                  >
                    Sign out
                  </Button>
                </div>
              ) : (
                <div>
                  <h2 className="font-bold text-base mb-3">Sign in</h2>
                  <div className="flex flex-col gap-3">
                    <Button onClick={() => signInWithGoogle()}>Sign in with Google</Button>
                  </div>
                </div>
              )}

              <div>
                <h2 className="font-bold text-base mb-2">Cloud Sync</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Push local workouts to Supabase and pull down changes from other devices.
                </p>

                {syncStatus && <p className="text-xs text-muted-foreground mb-2">{syncStatus}</p>}

                <Button
                  className="w-full"
                  disabled={!user || isSyncing}
                  onClick={async () => {
                    setIsSyncing(true)
                    setSyncStatus("Syncing...")
                    try {
                      const { syncNow, getOutboxCount } = await import("@/lib/supabase-sync")
                      const res = await syncNow({
                        onProgress: ({ synced, failed, total, pending }) => {
                          setSyncStatus(`Syncing ${synced + failed}/${total}... (${pending} left)`)
                        },
                      })
                      const pending = getOutboxCount()
                      const message = `${res.push.message}. ${res.pull.message}. Pending: ${pending}`
                      setSyncStatus(message)
                      alert(message)
                      setWorkouts(getWorkoutHistory())
                    } catch (e) {
                      const message = (e as Error).message || "Sync failed"
                      setSyncStatus(message)
                      alert(message)
                      console.error("Sync failed", e)
                    } finally {
                      setIsSyncing(false)
                    }
                  }}
                >
                  {isSyncing ? "Syncing..." : user ? "Sync now" : "Sign in to sync"}
                </Button>

                <div className="mt-4 text-xs text-muted-foreground">
                  Local workouts loaded: {Array.isArray(workouts) ? workouts.length : 0}
                </div>
              </div>

              <div>
                <h2 className="font-bold text-base mb-2">Send all workouts to cloud</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Force upload any workouts saved on this device. This is a recovery tool.
                </p>

                <div className="flex flex-wrap gap-2 mb-3">
                  <Button
                    onClick={() => handleManualSync(true)}
                    variant="outline"
                    disabled={!user || manualSyncRunning}
                  >
                    Dry run
                  </Button>
                  <Button
                    onClick={() => setManualSyncConfirmOpen(true)}
                    disabled={!user || manualSyncRunning}
                  >
                    {manualSyncRunning ? "Sending..." : "Send now"}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={manualSyncIncludeSynced}
                      onChange={(e) => setManualSyncIncludeSynced(e.target.checked)}
                    />
                    Include already synced
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={manualSyncRetryFailedOnly}
                      onChange={(e) => setManualSyncRetryFailedOnly(e.target.checked)}
                    />
                    Retry failed only
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={manualSyncForceOverwrite}
                      onChange={(e) => setManualSyncForceOverwrite(e.target.checked)}
                    />
                    Force overwrite
                  </label>
                </div>

                <div className="text-xs text-muted-foreground mb-3">
                  Local workouts queued: {manualSyncCandidateCount ?? 0}
                </div>

                {manualSyncProgress && manualSyncRunning && (
                  <div className="text-xs text-muted-foreground mb-2">
                    Sending {manualSyncProgress.current}/{manualSyncProgress.total} • Synced: {manualSyncProgress.synced} •
                    Skipped: {manualSyncProgress.skipped} • Conflicts: {manualSyncProgress.conflicts} • Errors:{" "}
                    {manualSyncProgress.errors}
                  </div>
                )}

                {manualSyncReport && (
                  <div className="rounded-md border border-white/10 p-3 text-xs text-muted-foreground space-y-2">
                    <div>
                      Summary: {manualSyncReport.synced} synced, {manualSyncReport.skipped} skipped,{" "}
                      {manualSyncReport.conflicts} conflicts, {manualSyncReport.errors} errors.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {manualSyncReport.errors > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleManualSync(false, true)}
                          disabled={manualSyncRunning}
                        >
                          Retry failed only
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (typeof navigator === "undefined" || !navigator.clipboard) return
                          navigator.clipboard.writeText(JSON.stringify(manualSyncReport, null, 2))
                        }}
                      >
                        Copy report
                      </Button>
                    </div>
                    <details>
                      <summary className="cursor-pointer">Details</summary>
                      <div className="mt-2 space-y-2">
                        {manualSyncReport.results.map((result) => (
                          <div key={result.workout_id} className="border-t border-white/5 pt-2">
                            <div>
                              {result.workout_id} • {result.status}
                            </div>
                            {result.message && <div>{result.message}</div>}
                            {result.error && <div>{result.error}</div>}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>

              {hasGoogleDriveConfig ? (
                <div>
                  <h2 className="font-bold text-base mb-2">Google Drive Backup</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    Backup and restore your workout data to Google Drive for safekeeping.
                  </p>
                  {backupStatus && <p className="text-xs text-muted-foreground mb-2">{backupStatus}</p>}
                  <div className="space-y-2">
                    <Button onClick={handleBackupToGoogleDrive} className="w-full" disabled={!!backupStatus}>
                      Backup to Google Drive
                    </Button>
                    <Button
                      onClick={handleRestoreFromGoogleDrive}
                      className="w-full bg-transparent"
                      variant="outline"
                      disabled={!!backupStatus}
                    >
                      Restore from Google Drive
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="font-bold text-base mb-2">Google Drive Backup</h2>
                  <p className="text-sm text-muted-foreground">
                    Google Drive integration requires configuration. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your
                    environment variables to enable this feature.
                  </p>
                </div>
              )}

              <div>
                <h2 className="font-bold text-base mb-2">Local Backup</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Download a backup file to your device or restore from a previous backup.
                </p>
                <div className="space-y-2">
                  <Button onClick={handleDownloadBackup} className="w-full bg-transparent" variant="outline">
                    Download Backup File
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()} className="w-full" variant="outline">
                    Restore from File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleRestoreFromFile}
                  />
                </div>
              </div>
            </div>
          </SettingsSection>

        <SettingsSection
          id="appearance"
          title="APPEARANCE & DEFAULTS"
          isExpanded={expandedSections.includes("appearance")}
          onToggle={() => toggleSection("appearance")}
        >
          <SettingItem label="Appearance" />
          <SettingItem label="Workout Defaults" />
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
              </div>
          </div>
        </SettingsSection>

        <SettingsSection
          id="schedule"
          title="SCHEDULE & PROGRAMS"
          isExpanded={expandedSections.includes("schedule")}
          onToggle={() => toggleSection("schedule")}
        >
          <SettingItem label="Workout Schedule" />
          <SettingItem label="Reset Program" />
          <SettingItem label="Demo Data" />
          <div className="mt-3 space-y-4">
              <WorkoutScheduleEditor />

              <div>
                <h2 className="font-bold text-base mb-2">Reset Program</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Replace all routines and schedule with the Growth v2 program.
                </p>
                <Button onClick={onResetGrowthV2} className="w-full" variant="destructive">
                  Reset to Growth v2 (Wipes old routines)
                </Button>
              </div>

              <div>
                <h2 className="font-bold text-base mb-2">Demo Data</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Load realistic demo data with 14 days of workout history and progressive overload. Perfect for testing
                  and demonstrations.
                </p>
                <Button onClick={handleSeedDemoData} className="w-full" variant="default">
                  Load Demo Data
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Includes 10 workouts with progressive overload and PRs
                </p>
              </div>
          </div>
        </SettingsSection>

        <SettingsSection
          id="data"
          title="DATA & INTEGRATIONS"
          isExpanded={expandedSections.includes("data")}
          onToggle={() => toggleSection("data")}
        >
          <SettingItem label="Import Historical Data" />
          <SettingItem label="Import Weight Data" />
          <SettingItem label="Apple Health Integration" />
          <SettingItem label="Clear All Data" />
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

                    <div className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span>Sessions Created</span>
                      </div>
                      <span className="font-semibold text-green-600">{importResult.sessionsCreated}</span>
                    </div>

                    {importResult.duplicatesSkipped > 0 && (
                      <div className="flex items-center justify-between p-2 bg-yellow-500/10 rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-yellow-600" />
                          <span>Duplicates Skipped</span>
                        </div>
                        <span className="font-semibold text-yellow-600">{importResult.duplicatesSkipped}</span>
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
                <h2 className="font-bold text-base mb-2">Import Weight Data (Wyze)</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a Wyze Scale export to import body weight entries. Imported rows are labeled and read only.
                </p>

                <div className="space-y-3">
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleWyzeFileChange}
                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                  />

                  <Button
                    onClick={handleWyzeImport}
                    disabled={!wyzeParseResult || wyzeImporting || !user?.id}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {wyzeImporting ? "Importing..." : "Import Wyze Weights"}
                  </Button>
                  {!user?.id && (
                    <div className="text-xs text-muted-foreground">
                      Sign in to import weights.
                    </div>
                  )}
                </div>

                {wyzeParseResult && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between p-2 bg-muted rounded-lg text-xs">
                        <span>Total rows</span>
                        <span className="font-semibold">{wyzeParseResult.totalRows}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg text-xs">
                        <span>Valid rows</span>
                        <span className="font-semibold text-green-600">{wyzeParseResult.validRows}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-yellow-500/10 rounded-lg text-xs">
                        <span>Skipped rows</span>
                        <span className="font-semibold text-yellow-600">{wyzeParseResult.skippedRows}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded-lg text-xs">
                        <span>Date range</span>
                        <span className="font-semibold">
                          {wyzeParseResult.range
                            ? `${new Date(wyzeParseResult.range.start).toLocaleDateString()} → ${new Date(
                                wyzeParseResult.range.end,
                              ).toLocaleDateString()}`
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {wyzeParseResult.errors.length > 0 && (
                      <div className="p-2 bg-red-500/10 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <XCircle className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-medium text-red-600">Errors</span>
                        </div>
                        <ul className="space-y-1 text-xs text-red-600">
                          {wyzeParseResult.errors.map((error, idx) => (
                            <li key={idx}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {wyzeImportStatus && (
                      <div className="text-xs text-muted-foreground">{wyzeImportStatus}</div>
                    )}

                    {wyzeParseResult.rows.length > 0 && (
                      <div className="rounded-lg border border-border/60 overflow-hidden">
                        <div className="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                          Preview (first 20 rows)
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {wyzeParseResult.rows.slice(0, 20).map((row, idx) => (
                            <div key={`${row.measuredAt}-${idx}`} className="px-3 py-2 text-xs border-t border-border/40">
                              <div className="flex items-center justify-between">
                                <span>{new Date(row.measuredAt).toLocaleString()}</span>
                              <span className="font-semibold">{row.weightLb.toFixed(1)} lb</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {wyzeEntries.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Imported (Wyze)
                      </span>
                      <Button variant="ghost" size="sm" onClick={handleDeleteAllWyzeEntries}>
                        Delete all
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {wyzeEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                        >
                          <div className="flex flex-col">
                            <span>{new Date(entry.measured_at).toLocaleString()}</span>
                            <span className="text-muted-foreground">Imported (Wyze)</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">
                              {Number(entry.weight_lb ?? entry.weight_kg ?? 0).toFixed(1)} lb
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteWyzeEntry(entry.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
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
                <p className="text-xs text-muted-foreground mt-2">{workouts.length} workouts ready to export</p>
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
          id="about"
          title="ABOUT & DEVICE"
          isExpanded={expandedSections.includes("about")}
          onToggle={() => toggleSection("about")}
        >
          <SettingItem label="Install as App" />
          <SettingItem label="Data Storage" />
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
          </div>
        </SettingsSection>
        </div>

        <AlertDialog open={manualSyncConfirmOpen} onOpenChange={setManualSyncConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send workouts to cloud</AlertDialogTitle>
              <AlertDialogDescription>
                This will attempt to upload {manualSyncCandidateCount ?? 0} workouts from this device. If you have multiple
                devices, conflicts can happen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={manualSyncRunning}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleManualSync(false)} disabled={manualSyncRunning}>
                Send now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex-shrink-0 mt-12 space-y-2">
          <p className="text-white/20 text-center" style={{ fontSize: "10px", fontWeight: 400 }}>
            Build: dev
          </p>
        </div>
      </div>
    </div>
  )
}

function SettingsSection({
  id,
  title,
  children,
  isExpanded,
  onToggle,
}: {
  id: string
  title: string
  children: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: "2px",
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 transition-colors duration-200 hover:bg-white/[0.01]"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        type="button"
      >
        <span
          className="text-white/50"
          style={{
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            fontFamily: "'Archivo Narrow', sans-serif",
          }}
        >
          {title}
        </span>
        <div className="text-white/30">
          {isExpanded ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
        </div>
      </button>

      {isExpanded && (
        <div
          className="px-4 pb-2"
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.04)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function SettingItem({ label }: { label: string }) {
  return (
    <button
      className="w-full text-left py-2.5 px-0 transition-colors duration-200 hover:text-white/70"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
      type="button"
    >
      <span
        className="text-white/50"
        style={{
          fontSize: "12px",
          fontWeight: 400,
          letterSpacing: "0.005em",
        }}
      >
        {label}
      </span>
    </button>
  )
}
