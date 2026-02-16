"use client"

import { useEffect, useState } from "react"

const LANDSCAPE_MOBILE_QUERY = "(orientation: landscape) and (max-width: 1024px) and (pointer: coarse)"

export default function PortraitLock() {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia(LANDSCAPE_MOBILE_QUERY)
    const update = () => setIsLandscapeMobile(mediaQuery.matches)

    update()
    mediaQuery.addEventListener("change", update)
    window.addEventListener("orientationchange", update)
    window.addEventListener("resize", update)

    const orientationApi = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "portrait") => Promise<void>
    }
    if (orientationApi.lock) {
      orientationApi.lock("portrait").catch(() => {
        // Many browsers (especially iOS Safari) block orientation lock.
      })
    }

    return () => {
      mediaQuery.removeEventListener("change", update)
      window.removeEventListener("orientationchange", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  if (!isLandscapeMobile) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-background text-foreground flex items-center justify-center p-8 text-center">
      <div className="max-w-xs space-y-3">
        <h2 className="text-xl font-semibold">Portrait Mode Only</h2>
        <p className="text-sm text-muted-foreground">Rotate your device back to portrait to continue.</p>
      </div>
    </div>
  )
}
