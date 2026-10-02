"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Clock, House, Settings } from "lucide-react"

type TabId = "home" | "history" | "settings"

const TABS: { id: TabId; href: string; label: string; Icon: typeof House }[] = [
  { id: "home", href: "/", label: "Home", Icon: House },
  { id: "history", href: "/history", label: "History", Icon: Clock },
  { id: "settings", href: "/settings", label: "Settings", Icon: Settings },
]

/**
 * Floating glass tab bar for the three roots (Home, History, Settings).
 *
 * Replaces the gear-in-header navigation. It shrinks to a compact pill on
 * scroll-down and re-expands on scroll-up, the way the iOS 26 tab bar does.
 * Scroll containers on tab roots reserve `--ios-tabbar-clearance` so nothing
 * ends up trapped underneath it.
 */
export function IosTabBar({ active }: { active?: TabId }) {
  const router = useRouter()
  const pathname = usePathname()
  const [compact, setCompact] = useState(false)
  const lastScrollY = useRef(0)

  const current: TabId =
    active ??
    (pathname?.startsWith("/history")
      ? "history"
      : pathname?.startsWith("/settings")
        ? "settings"
        : "home")

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      // Hysteresis of 6px keeps a rubber-banding scroll from flickering the bar.
      if (Math.abs(y - lastScrollY.current) < 6) return
      setCompact(y > lastScrollY.current && y > 24)
      lastScrollY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <nav
      className="ios-glass fixed z-[90] flex"
      aria-label="Primary"
      style={{
        left: "50%",
        bottom: "calc(36px + env(safe-area-inset-bottom, 0px))",
        transform: "translateX(-50%)",
        padding: "5px",
        gap: "4px",
        borderRadius: "999px",
        transition: "padding var(--duration-base) var(--ease-theatre)",
      }}
    >
      {TABS.map(({ id, href, label, Icon }) => {
        const selected = id === current
        return (
          <button
            key={id}
            type="button"
            onClick={() => router.push(href)}
            aria-label={label}
            aria-current={selected ? "page" : undefined}
            className="flex items-center justify-center"
            style={{
              width: compact ? "50px" : "62px",
              height: compact ? "46px" : "54px",
              borderRadius: "999px",
              border: "none",
              background: selected ? "var(--ink-15)" : "transparent",
              color: selected ? "#fff" : "var(--ink-50)",
              cursor: "pointer",
              transition:
                "width var(--duration-base) var(--ease-theatre), height var(--duration-base) var(--ease-theatre), background var(--duration-fast), color var(--duration-fast)",
            }}
          >
            <Icon size={compact ? 22 : 26} strokeWidth={1.8} />
          </button>
        )
      })}
    </nav>
  )
}

export default IosTabBar
