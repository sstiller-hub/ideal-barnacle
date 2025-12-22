// Google Drive backup and restore functionality

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""
const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
const SCOPES = "https://www.googleapis.com/auth/drive.file"

let tokenClient: any = null
let gapiInited = false
let gisInited = false

// Initialize Google API
export async function initializeGoogleDrive(): Promise<boolean> {
  if (!CLIENT_ID) {
    console.warn("[v0] Google Client ID not configured")
    return false
  }

  try {
    return new Promise((resolve, reject) => {
      // Load gapi
      const gapiScript = document.createElement("script")
      gapiScript.src = "https://apis.google.com/js/api.js"
      gapiScript.onerror = () => reject(new Error("Failed to load Google API script"))
      gapiScript.onload = () => {
        ;(window as any).gapi.load("client", async () => {
          try {
            await (window as any).gapi.client.init({
              discoveryDocs: [DISCOVERY_DOC],
            })
            gapiInited = true
            if (gisInited) resolve(true)
          } catch (error) {
            reject(error)
          }
        })
      }
      document.body.appendChild(gapiScript)

      // Load gis (Google Identity Services)
      const gisScript = document.createElement("script")
      gisScript.src = "https://accounts.google.com/gsi/client"
      gisScript.onerror = () => reject(new Error("Failed to load Google Identity script"))
      gisScript.onload = () => {
        try {
          tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: "", // defined later
          })
          gisInited = true
          if (gapiInited) resolve(true)
        } catch (error) {
          reject(error)
        }
      }
      document.body.appendChild(gisScript)
    })
  } catch (error) {
    console.error("[v0] Google Drive initialization error:", error)
    return false
  }
}

// Get all localStorage data
function getAllLocalStorageData() {
  return {
    workout_history: localStorage.getItem("workout_history"),
    personal_records: localStorage.getItem("personal_records"),
    workout_routines: localStorage.getItem("workout_routines"),
    timestamp: new Date().toISOString(),
    version: "1.0",
  }
}

// Restore all localStorage data
function restoreAllLocalStorageData(data: any) {
  if (data.workout_history) localStorage.setItem("workout_history", data.workout_history)
  if (data.personal_records) localStorage.setItem("personal_records", data.personal_records)
  if (data.workout_routines) localStorage.setItem("workout_routines", data.workout_routines)
}

// Backup to Google Drive
export async function backupToGoogleDrive(): Promise<{ success: boolean; message: string }> {
  if (!CLIENT_ID) {
    return {
      success: false,
      message: "Google Drive is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in environment variables.",
    }
  }

  try {
    if (!gapiInited || !gisInited) {
      const initialized = await initializeGoogleDrive()
      if (!initialized) {
        return { success: false, message: "Failed to initialize Google Drive" }
      }
    }

    // Request access token
    return new Promise((resolve) => {
      tokenClient.callback = async (resp: any) => {
        if (resp.error !== undefined) {
          resolve({ success: false, message: resp.error })
          return
        }

        try {
          // Get all data
          const backupData = getAllLocalStorageData()
          const jsonString = JSON.stringify(backupData, null, 2)

          // Create file metadata
          const file = new Blob([jsonString], { type: "application/json" })
          const metadata = {
            name: `workout-backup-${new Date().toISOString().split("T")[0]}.json`,
            mimeType: "application/json",
          }

          // Create form data
          const form = new FormData()
          form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }))
          form.append("file", file)

          // Upload to Google Drive
          const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: new Headers({ Authorization: "Bearer " + (window as any).gapi.client.getToken().access_token }),
            body: form,
          })

          if (response.ok) {
            const result = await response.json()
            resolve({
              success: true,
              message: `Backup saved successfully to Google Drive (${result.name})`,
            })
          } else {
            resolve({ success: false, message: "Failed to upload to Google Drive" })
          }
        } catch (error) {
          resolve({ success: false, message: `Error: ${error}` })
        }
      }

      tokenClient.requestAccessToken({ prompt: "consent" })
    })
  } catch (error) {
    console.error("[v0] Google Drive backup error:", error)
    return { success: false, message: `Error initializing Google Drive: ${error}` }
  }
}

// Restore from Google Drive (file picker)
export async function restoreFromGoogleDrive(): Promise<{ success: boolean; message: string }> {
  if (!CLIENT_ID) {
    return {
      success: false,
      message: "Google Drive is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in environment variables.",
    }
  }

  try {
    if (!gapiInited || !gisInited) {
      const initialized = await initializeGoogleDrive()
      if (!initialized) {
        return { success: false, message: "Failed to initialize Google Drive" }
      }
    }

    return new Promise((resolve) => {
      tokenClient.callback = async (resp: any) => {
        if (resp.error !== undefined) {
          resolve({ success: false, message: resp.error })
          return
        }

        try {
          // List backup files
          const response = await (window as any).gapi.client.drive.files.list({
            pageSize: 10,
            fields: "files(id, name, modifiedTime)",
            q: "name contains 'workout-backup' and mimeType='application/json'",
            orderBy: "modifiedTime desc",
          })

          const files = response.result.files
          if (!files || files.length === 0) {
            resolve({ success: false, message: "No backup files found in Google Drive" })
            return
          }

          // Get the most recent backup
          const latestFile = files[0]

          // Download file content
          const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${latestFile.id}?alt=media`, {
            headers: new Headers({
              Authorization: "Bearer " + (window as any).gapi.client.getToken().access_token,
            }),
          })

          if (fileResponse.ok) {
            const backupData = await fileResponse.json()
            restoreAllLocalStorageData(backupData)
            resolve({
              success: true,
              message: `Successfully restored from ${latestFile.name} (${new Date(latestFile.modifiedTime).toLocaleDateString()})`,
            })
          } else {
            resolve({ success: false, message: "Failed to download backup file" })
          }
        } catch (error) {
          resolve({ success: false, message: `Error: ${error}` })
        }
      }

      tokenClient.requestAccessToken({ prompt: "consent" })
    })
  } catch (error) {
    console.error("[v0] Google Drive restore error:", error)
    return { success: false, message: `Error initializing Google Drive: ${error}` }
  }
}

// Download backup as JSON file (fallback option)
export function downloadBackupFile() {
  const backupData = getAllLocalStorageData()
  const jsonString = JSON.stringify(backupData, null, 2)
  const blob = new Blob([jsonString], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `workout-backup-${new Date().toISOString().split("T")[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Restore from uploaded JSON file
export function restoreFromFile(file: File): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const backupData = JSON.parse(e.target?.result as string)
        restoreAllLocalStorageData(backupData)
        resolve({
          success: true,
          message: `Successfully restored from ${file.name} (${new Date(backupData.timestamp).toLocaleDateString()})`,
        })
      } catch (error) {
        resolve({ success: false, message: `Error parsing backup file: ${error}` })
      }
    }
    reader.onerror = () => {
      resolve({ success: false, message: "Error reading file" })
    }
    reader.readAsText(file)
  })
}
