"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { plural } from "@/lib/utils"
import { getWorkoutHistory, type CompletedWorkout } from "@/lib/workout-storage"
import {
  backupToGoogleDrive,
  restoreFromGoogleDrive,
  downloadBackupFile,
  restoreFromFile,
} from "@/lib/google-drive-backup"
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
import { signInWithGoogle } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { runManualSync, type ManualSyncReport } from "@/lib/workout-manual-sync"
import { IosNavPage } from "@/components/ios/nav-bar"
import { IosActionRow, IosGroup, IosRow, IosSectionFooter, IosSectionHeader } from "@/components/ios/grouped"
import { IosSwitch } from "@/components/ios/controls"

/**
 * Account & Sync — pushed out of the Settings accordion into its own page.
 *
 * Everything here used to live inside one expandable "ACCOUNT & SYNC" section
 * on the Settings root. As a sub-page it gets a large title and grouped lists,
 * and every checkbox becomes a native switch.
 */
export default function AccountSyncPage() {
  const router = useRouter()
  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [syncStatus, setSyncStatus] = useState<string>("")
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [backupStatus, setBackupStatus] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasGoogleDriveConfig = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(true)
  const [driveBackupEnabled, setDriveBackupEnabled] = useState(false)
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
    if (typeof window === "undefined") return
    setCloudSyncEnabled(localStorage.getItem("cloud_sync_enabled") !== "false")
    setDriveBackupEnabled(localStorage.getItem("drive_backup_enabled") === "true")
    setLastSyncedAt(localStorage.getItem("last_synced_at"))
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

  useEffect(() => {
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
      if (active) setManualSyncCandidateCount(ids.size)
    }
    void loadCount()
    return () => {
      active = false
    }
  }, [manualSyncIncludeSynced, manualSyncRetryFailedOnly, workouts.length])

  const formatSyncTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Never"

  const handleSyncNow = async () => {
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
      const now = new Date().toISOString()
      localStorage.setItem("last_synced_at", now)
      setLastSyncedAt(now)
      setWorkouts(getWorkoutHistory())
    } catch (e) {
      const message = (e as Error).message || "Sync failed"
      setSyncStatus(message)
      console.error("Sync failed", e)
    } finally {
      setIsSyncing(false)
    }
  }

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

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "100%", background: "#000", paddingBottom: "40px" }}
    >
      <IosNavPage backLabel="Settings" onBack={() => router.push("/settings")} title="Account & Sync">
        {/* --- Identity --- */}
        <IosGroup>
          {user ? (
            <IosRow label="Signed in" value={user.email ?? ""} />
          ) : (
            <IosActionRow label="Sign in with Google" onClick={() => void signInWithGoogle()} />
          )}
          {user ? (
            <IosActionRow
              label="Sign Out"
              onClick={async () => {
                await supabase?.auth.signOut()
              }}
            />
          ) : null}
        </IosGroup>

        {/* --- Cloud sync --- */}
        <IosSectionHeader>Cloud sync</IosSectionHeader>
        <IosGroup>
          <IosRow
            label="Cloud Sync"
            accessory={
              <IosSwitch
                checked={cloudSyncEnabled}
                ariaLabel="Cloud Sync"
                onChange={(next) => {
                  setCloudSyncEnabled(next)
                  localStorage.setItem("cloud_sync_enabled", String(next))
                }}
              />
            }
          />
          <IosRow
            label="Sync Now"
            value={isSyncing ? "Syncing…" : `Last ${formatSyncTime(lastSyncedAt)}`}
            onClick={() => {
              if (!user || isSyncing) return
              void handleSyncNow()
            }}
          />
          <IosRow
            label="Google Drive Backup"
            accessory={
              <IosSwitch
                checked={driveBackupEnabled}
                disabled={!hasGoogleDriveConfig}
                ariaLabel="Google Drive Backup"
                onChange={(next) => {
                  setDriveBackupEnabled(next)
                  localStorage.setItem("drive_backup_enabled", String(next))
                }}
              />
            }
          />
        </IosGroup>
        <IosSectionFooter>
          {"Pushes local workouts to the cloud and pulls down changes from your other devices. Local workouts loaded: " +
            (Array.isArray(workouts) ? workouts.length : 0) +
            "."}
          {hasGoogleDriveConfig ? null : " Google Drive backup isn’t available in this version of Akt."}
        </IosSectionFooter>
        {syncStatus ? <IosSectionFooter>{syncStatus}</IosSectionFooter> : null}

        {hasGoogleDriveConfig ? (
          <IosGroup style={{ marginTop: "20px" }}>
            <IosActionRow label="Backup to Google Drive" onClick={handleBackupToGoogleDrive} disabled={!!backupStatus} />
            <IosActionRow
              label="Restore from Google Drive"
              onClick={handleRestoreFromGoogleDrive}
              disabled={!!backupStatus}
            />
          </IosGroup>
        ) : null}

        {/* --- Bulk upload --- */}
        <IosSectionHeader>Send all workouts to cloud</IosSectionHeader>
        <IosGroup>
          <IosRow
            label="Include Already Synced"
            accessory={
              <IosSwitch
                checked={manualSyncIncludeSynced}
                ariaLabel="Include Already Synced"
                onChange={setManualSyncIncludeSynced}
              />
            }
          />
          <IosRow
            label="Retry Failed Only"
            accessory={
              <IosSwitch
                checked={manualSyncRetryFailedOnly}
                ariaLabel="Retry Failed Only"
                onChange={setManualSyncRetryFailedOnly}
              />
            }
          />
          <IosRow
            label="Force Overwrite"
            accessory={
              <IosSwitch
                checked={manualSyncForceOverwrite}
                ariaLabel="Force Overwrite"
                onChange={setManualSyncForceOverwrite}
              />
            }
          />
        </IosGroup>

        <IosGroup style={{ marginTop: "20px" }}>
          <IosActionRow
            label="Dry Run"
            onClick={() => void handleManualSync(true)}
            disabled={!user || manualSyncRunning}
          />
          <IosActionRow
            label={manualSyncRunning ? "Sending…" : "Send Now"}
            emphasis
            onClick={() => setManualSyncConfirmOpen(true)}
            disabled={!user || manualSyncRunning}
          />
        </IosGroup>
        <IosSectionFooter>
          {manualSyncCandidateCount ?? 0} {plural(manualSyncCandidateCount ?? 0, "workout", "workouts")} queued for
          upload from this device.
        </IosSectionFooter>

        {manualSyncProgress && manualSyncRunning ? (
          <IosSectionFooter>
            Sending {manualSyncProgress.current}/{manualSyncProgress.total} • Synced: {manualSyncProgress.synced} •
            Skipped: {manualSyncProgress.skipped} • Conflicts: {manualSyncProgress.conflicts} • Errors:{" "}
            {manualSyncProgress.errors}
          </IosSectionFooter>
        ) : null}

        {manualSyncReport ? (
          <>
            <IosSectionFooter>
              Summary: {manualSyncReport.synced} synced, {manualSyncReport.skipped} skipped,{" "}
              {manualSyncReport.conflicts} conflicts, {manualSyncReport.errors} errors.
            </IosSectionFooter>
            <IosGroup style={{ marginTop: "12px" }}>
              {manualSyncReport.errors > 0 ? (
                <IosActionRow
                  label="Retry Failed Only"
                  onClick={() => void handleManualSync(false, true)}
                  disabled={manualSyncRunning}
                />
              ) : null}
              <IosActionRow
                label="Copy Report"
                onClick={() => {
                  if (typeof navigator === "undefined" || !navigator.clipboard) return
                  navigator.clipboard.writeText(JSON.stringify(manualSyncReport, null, 2))
                }}
              />
            </IosGroup>
          </>
        ) : null}

        {/* --- Local backup --- */}
        <IosSectionHeader>Local backup</IosSectionHeader>
        <IosGroup>
          <IosActionRow label="Download Backup File" onClick={handleDownloadBackup} />
          <IosActionRow label="Restore from File" onClick={() => fileInputRef.current?.click()} />
        </IosGroup>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFromFile} />
      </IosNavPage>

      <AlertDialog open={manualSyncConfirmOpen} onOpenChange={setManualSyncConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send workouts to cloud</AlertDialogTitle>
            <AlertDialogDescription>
              This will attempt to upload {manualSyncCandidateCount ?? 0}{" "}
              {plural(manualSyncCandidateCount ?? 0, "workout", "workouts")} from this device. If you have multiple
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
    </div>
  )
}
