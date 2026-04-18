"use client"

import { useEffect, useState, type ReactNode } from "react"

const LANDSCAPE_MOBILE_QUERY = "(orientation: landscape) and (max-width: 1024px) and (pointer: coarse)"

export default function PortraitLock({ children }: { children: ReactNode }) {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false)

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
  }, [])

  if (!isLandscapeMobile) return <>{children}</>

  // Rotate the portrait-designed content -90° to fill the landscape viewport.
  // In landscape: vw > vh. We size the inner box as (100vh × 100vw) — portrait
  // dimensions — then center and rotate so it visually fills the landscape screen.
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "black" }}>
      <div
        style={{
          position: "fixed",
          width: "100vh",
          height: "100vw",
          top: "calc((100vh - 100vw) / 2)",
          left: "calc((100vw - 100vh) / 2)",
          transform: "rotate(-90deg)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  )
}
