"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

const LANDSCAPE_MOBILE_QUERY = "(orientation: landscape) and (max-width: 1024px) and (pointer: coarse)"

// Which way the device was turned. screen.orientation.angle reports how far the
// content has been rotated away from the device's natural orientation, so we
// counter-rotate by the same amount to land back on portrait. Hardcoding -90
// leaves one of the two landscape directions upside down.
function readCounterRotation() {
  if (typeof window === "undefined") return -90
  const angle =
    window.screen?.orientation?.angle ??
    (typeof window.orientation === "number" ? window.orientation : 90)
  return angle === 270 || angle === -90 ? 90 : -90
}

export default function PortraitLock({ children }: { children: ReactNode }) {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false)
  const [rotation, setRotation] = useState(-90)

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia(LANDSCAPE_MOBILE_QUERY)
    const update = () => {
      setIsLandscapeMobile(mediaQuery.matches)
      setRotation(readCounterRotation())
    }

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

  // Rotate the portrait-designed content to fill the landscape viewport, so the
  // app looks identical to portrait no matter how the phone is held. In
  // landscape: vw > vh. We size the inner box as (100vh x 100vw) — portrait
  // dimensions — then center and rotate so it visually fills the landscape screen.
  //
  // --app-vh is the height of that rotated box (100vw here, 100dvh normally).
  // Anything sizing itself to the full screen must use it rather than raw
  // dvh/vh units, which still resolve against the short landscape viewport and
  // would leave the bottom half of the box empty.
  //
  // Both branches render the same two wrapper elements. Returning bare children
  // in portrait and a wrapped tree in landscape changes the element type at this
  // position, so React tore down and rebuilt every page below on each rotation —
  // during a workout that re-ran session init, re-synced every exercise draft,
  // dropped keyboard focus mid-set, closed open sheets and replayed the page
  // transition. `display: contents` keeps the portrait wrappers out of layout
  // entirely, so they render identically to passing children straight through
  // while giving React a stable tree to reconcile against.
  const outerStyle: CSSProperties = isLandscapeMobile
    ? { position: "fixed", inset: 0, width: "100vw", height: "100vh", overflow: "hidden" }
    : { display: "contents" }

  const innerStyle: CSSProperties = isLandscapeMobile
    ? {
        position: "absolute",
        top: "50%",
        left: "50%",
        width: "100vh",
        height: "100vw",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transformOrigin: "center center",
        overflow: "hidden",
        ["--app-vh" as string]: "100vw",
      }
    : { display: "contents" }

  return (
    <div style={outerStyle}>
      <div className={isLandscapeMobile ? "portrait-lock-rotated" : undefined} style={innerStyle}>
        {children}
      </div>
    </div>
  )
}
