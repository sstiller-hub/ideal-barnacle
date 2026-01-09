"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Home, Dumbbell, History, Trophy, Settings } from "lucide-react"

type BottomNavProps = {
  fixed?: boolean
}

function BottomNav({ fixed = true }: BottomNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const [hoverHref, setHoverHref] = useState<string | null>(null)

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/workout", icon: Dumbbell, label: "Workouts" },
    { href: "/history", icon: History, label: "History" },
    { href: "/prs", icon: Trophy, label: "PRs" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ]
  const navIndexByHref = useMemo(() => {
    const indexByHref: Record<string, number> = {}
    navItems.forEach((item, index) => {
      indexByHref[item.href] = index
    })
    return indexByHref
  }, [navItems])

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

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

  const activeIndex = navItems.findIndex((item) => isActive(item.href))
  const hoverIndex = hoverHref ? navIndexByHref[hoverHref] ?? activeIndex : activeIndex
  const highlightIndex = hoverIndex >= 0 ? hoverIndex : 0

  return (
    <nav
      className={
        fixed
          ? "fixed left-0 right-0 z-50 pointer-events-none flex justify-center px-4 pb-[env(safe-area-inset-bottom)]"
          : "w-full"
      }
      style={
        fixed
          ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }
          : undefined
      }
    >
      <div
        data-nav-root
        data-expanded={isExpanded ? "true" : "false"}
        className={`relative flex items-center w-full max-w-[520px] px-1.5 py-1.5 ${
          fixed
            ? "pointer-events-auto rounded-full border border-border/40 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.06))] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_12px_40px_rgba(0,0,0,0.28),_0_2px_10px_rgba(0,0,0,0.18),_inset_0_1px_0_rgba(255,255,255,0.12)]"
            : "bg-card border-t border-border"
        }`}
      >
        <div
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 rounded-full bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.5),rgba(255,255,255,0.12)_55%,rgba(0,0,0,0.08)_100%)] shadow-[0_6px_16px_rgba(0,0,0,0.35),_inset_0_1px_0_rgba(255,255,255,0.6)] transition-[left] duration-500 ease-[cubic-bezier(0.2,0.9,0.2,1)]"
          style={{
            width: `calc((100% - 12px) / ${navItems.length})`,
            left: `calc(${highlightIndex} * (100% - 12px) / ${navItems.length} + 6px)`,
          }}
        />
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          const isHover = hoverHref === href
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
                  return
                }
                setIsExpanded(false)
                router.push(href)
              }}
              className={`relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-0 ${
                active || isHover
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span
                data-nav-label
                className={`max-w-[72px] truncate text-center text-[10px] leading-none ${active ? "font-semibold" : ""}`}
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
