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
  const [hoverHref, setHoverHref] = useState<string | null>(null)
  const lastScrollY = useRef(0)
  const navRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/workout", icon: Dumbbell, label: "Workouts" },
    { href: "/history", icon: History, label: "History" },
    { href: "/prs", icon: Trophy, label: "PRs" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ]
  const iconOffsetByHref: Record<string, string> = {
    "/": "translate-x-[6px]",
    "/workout": "translate-x-[4px]",
    "/history": "translate-x-[0px]",
    "/prs": "translate-x-[-4px]",
    "/settings": "translate-x-[-7px]",
  }

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
    const onPointerMove = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const button = target?.closest<HTMLButtonElement>("[data-nav-item]")
      const href = button?.dataset.href ?? null
      setHoverHref(href)
    }
    const onPointerUp = () => {
      if (hoverHref && !isActive(hoverHref)) {
        router.push(hoverHref)
      }
      setHoverHref(null)
      setIsExpanded(false)
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
  }, [isExpanded, hoverHref, router])

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
        data-nav-root
        data-expanded={isExpanded ? "true" : "false"}
        data-collapsed={isCollapsed ? "true" : "false"}
        data-minimized={isMinimized ? "true" : "false"}
        className={`inline-flex items-center gap-1 ml-0 mr-auto ${
          fixed
            ? "pointer-events-auto rounded-full border border-border/50 bg-background/45 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_12px_40px_rgba(0,0,0,0.22),_0_2px_10px_rgba(0,0,0,0.16),_inset_0_1px_0_rgba(255,255,255,0.12)] transition-[width,transform,opacity,box-shadow,backdrop-filter]"
            : "bg-card border-t border-border"
        } ${isCollapsed ? "duration-700 ease-[cubic-bezier(0.6,0,0.4,1)]" : "duration-700 ease-[cubic-bezier(0.2,0.9,0.2,1)]"} ${
          isMinimized ? "py-1" : "py-2.5"
        } ${
          isCollapsed
            ? "w-14 h-14 px-0 justify-center scale-[0.96] opacity-95"
            : "w-fit px-2 justify-start scale-100 opacity-100"
        }`}
      >
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          const showLabel = isExpanded || (!isCollapsed && active)
          const showItem = active || isExpanded
          const isHover = hoverHref === href
          const iconOffset = iconOffsetByHref[href] ?? "translate-x-[6px]"
          return (
            <button
              key={href}
              data-nav-item
              data-href={href}
              data-hovered={isHover ? "true" : "false"}
              onPointerEnter={() => {
                if (isExpanded) setHoverHref(href)
              }}
              onPointerLeave={() => {
                if (isExpanded) setHoverHref(null)
              }}
              onPointerDown={(event) => {
                if (active) {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  setIsExpanded(true)
                  setHoverHref(href)
                }
              }}
              onClick={() => {
                if (active) {
                  const now = Date.now()
                  if (now - lastTapRef.current < 300) {
                    setIsExpanded((prev) => {
                      const next = !prev
                      setHoverHref(next ? href : null)
                      return next
                    })
                    lastTapRef.current = 0
                    return
                  }
                  lastTapRef.current = now
                  return
                }
                setIsExpanded(false)
                router.push(href)
              }}
              className={`flex ${isCollapsed ? "items-center justify-center" : "flex-col items-center"} ${
                showLabel ? "gap-1" : "gap-0"
              } ${isCollapsed ? "h-12 w-12 p-0" : "px-3"} ${
                isCollapsed ? "" : isMinimized ? "py-1" : "py-2"
              } rounded-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-0 ${
                active || isHover
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              } ${
                showItem
                  ? "max-w-[84px] opacity-100 translate-x-0"
                  : "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
              }`}
            >
              <span className={isCollapsed ? "flex h-12 w-12 items-center justify-center" : ""}>
                <Icon
                  className={`w-5 h-5 block ${active ? "stroke-[2.5]" : ""} ${
                    isCollapsed ? iconOffset : ""
                  }`}
                />
              </span>
              {showLabel && (
                <span
                  className={`text-[10px] leading-none transition-all duration-300 ${
                    isExpanded ? "opacity-100 translate-y-0" : "opacity-100 translate-y-0"
                  } ${active ? "font-semibold" : ""}`}
                >
                  {label}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export { BottomNav }
export default BottomNav
