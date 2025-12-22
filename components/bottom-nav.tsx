"use client"

import { usePathname, useRouter } from "next/navigation"
import { Home, Dumbbell, History, Trophy, Settings } from "lucide-react"

type BottomNavProps = {
  fixed?: boolean
}

function BottomNav({ fixed = true }: BottomNavProps) {
  const pathname = usePathname()
  const router = useRouter()

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

  return (
    <nav className={`${fixed ? "fixed bottom-0 left-0 right-0 z-50" : "w-full"} bg-card border-t border-border`}>
      <div className="flex items-center justify-around max-w-2xl mx-auto px-4 py-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span className={`text-xs ${active ? "font-semibold" : ""}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export { BottomNav }
export default BottomNav
