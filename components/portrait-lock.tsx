"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"

const LANDSCAPE_MOBILE_QUERY = "(orientation: landscape) and (max-width: 1024px) and (pointer: coarse)"

export default function PortraitLock({ children }: { children: ReactNode }) {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false)
  const pathname = usePathname()
  const isWorkoutSession = pathname?.startsWith("/workout/session") ?? false

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia(LANDSCAPE_MOBILE_QUERY)
    const update = () => setIsLandscapeMobile(mediaQuery.matches)

    update()
    mediaQuery.addEventListener("change", update)
    window.addEventListener("orientationchange", update)
    window.addEventListener("resize", update)

    return () => {
      mediaQuery.removeEventListener("change", update)
      window.removeEventListener("orientationchange", update)
      window.removeEventListener("resize", update)
    }
  }, [isWorkoutSession])

  if (!isLandscapeMobile || isWorkoutSession) return <>{children}</>

  // Rotate the portrait-designed content -90° to fill the landscape viewport.
  // In landscape: vw > vh. We size the inner box as (100vh × 100vw) — portrait
  // dimensions — then center and rotate so it visually fills the landscape screen.
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
