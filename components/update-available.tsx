"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

type WaitingWorker = ServiceWorker | null

export default function UpdateAvailableBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const waitingWorkerRef = useRef<WaitingWorker>(null)

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return

    let registration: ServiceWorkerRegistration | null = null

    const onControllerChange = () => {
      window.location.reload()
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg

        if (reg.waiting) {
          waitingWorkerRef.current = reg.waiting
          setUpdateAvailable(true)
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              waitingWorkerRef.current = newWorker
              setUpdateAvailable(true)
            }
          })
        })
      })
      .catch((err) => {
        console.warn("Service worker registration failed", err)
      })

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
      if (registration) {
        registration.removeEventListener("updatefound", () => {})
      }
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 shadow-lg">
        <div className="text-sm">
          <div className="font-semibold">Update available</div>
          <div className="text-muted-foreground">Reload to get the latest version.</div>
        </div>
        <Button
          onClick={() => {
            const worker = waitingWorkerRef.current
            if (worker) {
              worker.postMessage({ type: "SKIP_WAITING" })
            } else {
              window.location.reload()
            }
          }}
        >
          Reload
        </Button>
      </div>
    </div>
  )
}
