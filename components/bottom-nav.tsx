"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Home, Dumbbell, History, Trophy, Settings } from "lucide-react"

type BottomNavProps = {
  fixed?: boolean
}

function BottomNav({ fixed = true }: BottomNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMinimized, setIsMinimized] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const lastScrollY = useRef(0)
  const navRef = useRef<HTMLDivElement>(null)

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/workout", icon: Dumbbell, label: "Workouts" },
    { href: "/history", icon: History, label: "History" },
    { href: "/prs", icon: Trophy, label: "PRs" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ]

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  useEffect(() => {
    if (!fixed) return
    const onScroll = () => {
      const currentY = window.scrollY
      const delta = currentY - lastScrollY.current
      if (currentY < 10) {
        setIsMinimized(false)
      } else if (delta > 8) {
        setIsMinimized(true)
      } else if (delta < -8) {
        setIsMinimized(false)
      }
      lastScrollY.current = currentY
    }

    lastScrollY.current = window.scrollY
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [fixed])

  useEffect(() => {
    if (!isExpanded) return
    const onPointerUp = () => setIsExpanded(false)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    return () => {
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
  }, [isExpanded])

  const isCollapsed = !isExpanded

  return (
    <nav
      className={
        fixed
          ? "fixed left-0 right-0 z-50 pointer-events-none px-4"
          : "w-full"
      }
      style={
        fixed
          ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }
          : undefined
      }
    >
      <div
        ref={navRef}
        className={`flex items-center ${
          fixed
            ? "pointer-events-auto rounded-full border border-border/50 bg-background/45 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_12px_40px_rgba(0,0,0,0.22),_0_2px_10px_rgba(0,0,0,0.16),_inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-300"
            : "bg-card border-t border-border"
        } ${isMinimized ? "py-1" : "py-2.5"} ${
          isCollapsed
            ? "w-14 h-14 px-0 justify-center ml-0 mr-auto"
            : "w-full max-w-2xl px-4 justify-around mx-auto"
        }`}
      >
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          const showLabel = isExpanded || (!isCollapsed && active)
          const showItem = active || isExpanded
          return (
            <button
              key={href}
              onPointerDown={() => {
                if (active) {
                  setIsExpanded(true)
                }
              }}
              onClick={() => {
                if (active) return
                setIsExpanded(false)
                router.push(href)
              }}
              className={`flex flex-col items-center ${showLabel ? "gap-1" : "gap-0"} ${
                isCollapsed ? "h-12 w-12 p-0 justify-center" : "px-3"
              } ${isCollapsed ? "" : isMinimized ? "py-1" : "py-2"} rounded-lg transition-all duration-300 ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              } ${
                showItem
                  ? "max-w-[84px] opacity-100 translate-x-0"
                  : "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span
                className={`text-[10px] leading-none transition-all duration-300 ${
                  showLabel ? "max-h-4 opacity-100 translate-y-0" : "max-h-0 opacity-0 translate-y-1"
                } ${active ? "font-semibold" : ""}`}
                aria-hidden={!showLabel}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export { BottomNav }
export default BottomNav
