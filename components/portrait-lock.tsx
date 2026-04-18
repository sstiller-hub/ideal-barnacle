"use client"

import { useEffect, useState } from "react"

const LANDSCAPE_MOBILE_QUERY = "(orientation: landscape) and (max-width: 1024px) and (pointer: coarse)"

export default function PortraitLock({ children }: { children: React.ReactNode }) {
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

  if (!isLandscapeMobile) return <>{children}</>

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "100vh",
          height: "100vw",
          transform: "translate(-50%, -50%) rotate(-90deg)",
          transformOrigin: "center center",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  )
}
