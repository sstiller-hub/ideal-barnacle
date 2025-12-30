"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { getWorkoutHistory } from "@/lib/workout-storage"
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
import { Card } from "@/components/ui/card"
import { BottomNav } from "@/components/bottom-nav"
import { Upload, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { signInWithEmail } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { useTheme } from "next-themes"
import { resetScheduleToGrowthV2FixedDays } from "@/lib/schedule-storage"
import { clearInProgressWorkout } from "@/lib/autosave-workout-storage"
import { WorkoutScheduleEditor } from "@/components/workout-schedule-editor"

function SignInCard({
  email,
  setEmail,
}: {
  email: string
  setEmail: (value: string) => void
}) {
  return (
    <Card className="p-4">
      <h2 className="font-bold text-base mb-3">Sign in</h2>
      <div className="flex flex-col gap-3">
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
        />
        <Button onClick={() => signInWithEmail(email)}>Sign in</Button>
      </div>
    </Card>
  )
}

export default function SettingsPage() {
  const [email, setEmail] = useState("")
  const [workouts, setWorkouts] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [syncStatus, setSyncStatus] = useState<string>("")
  const [isSyncing, setIsSyncing] = useState(false)
  const [backupStatus, setBackupStatus] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvFileInputRef = useRef<HTMLInputElement>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const hasGoogleDriveConfig = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setWorkouts(getWorkoutHistory())
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 bg-background border-b p-3 flex items-center justify-between">
        <Link href="/" className="text-xl">
          ←
        </Link>
        <h1 className="text-lg font-bold">Settings</h1>
        <div className="w-6" />
      </div>

      <div className="p-4 space-y-4">
        {user ? (
          <Card className="p-4">
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
          </Card>
        ) : (
          <SignInCard email={email} setEmail={setEmail} />
        )}

        <Card className="p-4">
          <h2 className="font-bold text-base mb-2">Appearance</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose a light, dark, or system theme.
          </p>
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
        </Card>

        <Card className="p-4 border-blue-500">
          <h2 className="font-bold text-base mb-2">Cloud Sync</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Push local workouts to Supabase and pull down changes from other devices.
          </p>

          {syncStatus && (
            <p className="text-xs text-muted-foreground mb-2">{syncStatus}</p>
          )}

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
                    setSyncStatus(
                      `Syncing ${synced + failed}/${total}... (${pending} left)`
                    )
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
        </Card>

        <Card className="p-4 border-blue-500">
          <h2 className="font-bold text-base mb-2">Import Historical Data</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Import workout data from CSV file. Useful for migrating from other apps or importing historical records.
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
        </Card>

        {hasGoogleDriveConfig && (
          <Card className="p-4 border-blue-500">
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
          </Card>
        )}

        {!hasGoogleDriveConfig && (
          <Card className="p-4 border-muted">
            <h2 className="font-bold text-base mb-2">Google Drive Backup</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Google Drive integration requires configuration. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment
              variables to enable this feature.
            </p>
          </Card>
        )}

        <Card className="p-4">
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
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFromFile} />
          </div>
        </Card>

        <Card className="p-4 border-red-500">
          <h2 className="font-bold text-base mb-2">Clear All Data</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Remove all workout data, routines, and personal records from your device. This cannot be undone.
          </p>
          <Button onClick={handleClearAllData} className="w-full" variant="destructive">
            Clear All Data
          </Button>
        </Card>

        <Card className="p-4 border-orange-500">
          <h2 className="font-bold text-base mb-2">Demo Data</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Load realistic demo data with 14 days of workout history and progressive overload. Perfect for testing and
            demonstrations.
          </p>
          <Button onClick={handleSeedDemoData} className="w-full" variant="default">
            Load Demo Data
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Includes 10 workouts with progressive overload and PRs</p>
        </Card>

        <Card className="p-4 border-orange-500">
          <WorkoutScheduleEditor />
        </Card>

        <Card className="p-4 border-red-500">
          <h2 className="font-bold text-base mb-2">Reset Program</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Replace all routines and schedule with the Growth v2 program.
          </p>
          <Button onClick={onResetGrowthV2} className="w-full" variant="destructive">
            Reset to Growth v2 (Wipes old routines)
          </Button>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold text-base mb-2">Apple Health Integration</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Export your workouts to Apple Health. After exporting, you can import the file into the Health app.
          </p>
          <Button onClick={handleExportToHealth} className="w-full">
            Export to Apple Health
          </Button>
          <p className="text-xs text-muted-foreground mt-2">{workouts.length} workouts ready to export</p>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold text-base mb-2">Install as App</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Add this app to your iPhone home screen for a native app experience.
          </p>
          <div className="text-xs space-y-1 text-muted-foreground">
            <p>1. Tap the Share button in Safari</p>
            <p>2. Scroll down and tap "Add to Home Screen"</p>
            <p>3. Tap "Add" in the top right</p>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold text-base mb-2">Data Storage</h2>
          <p className="text-sm text-muted-foreground">
            All workout data is stored locally on your device. Your data never leaves your phone.
          </p>
        </Card>

        <div className="text-[10px] text-muted-foreground text-center">
          Build: {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev"}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
