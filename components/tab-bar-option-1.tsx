import { useMemo, useState } from "react"

type TabItem = {
  label: string
}

const TABS: TabItem[] = [
  { label: "Home" },
  { label: "Workouts" },
  { label: "History" },
  { label: "PRs" },
  { label: "Settings" },
]

export default function TabBarOption1() {
  const [activeTab, setActiveTab] = useState(0)
  const [hoveredTab, setHoveredTab] = useState<number | null>(null)

  const widthStyle = useMemo(() => `calc(${100 / TABS.length}% - 4px)`, [])
  const leftStyle = useMemo(
    () => `calc(${activeTab * (100 / TABS.length)}% + 4px)`,
    [activeTab]
  )

  return (
    <div
      className="relative inline-flex items-center rounded-full p-[1px] gap-[0.5px] backdrop-blur-xl"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1)",
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          height: "calc(100% - 8px)",
          top: "4px",
          width: widthStyle,
          left: leftStyle,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.28), rgba(255,255,255,0.18))",
          boxShadow:
            "0 4px 16px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 1px rgba(0,0,0,0.05)",
          transition: "left 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
      {TABS.map((tab, index) => {
        const isActive = activeTab === index
        const isHovered = hoveredTab === index
        return (
          <button
            key={tab.label}
            type="button"
            className="relative z-10 px-5 py-2.5 text-sm transition-all duration-300"
            style={{
              letterSpacing: "0.01em",
              color: isActive
                ? "rgba(255,255,255,0.98)"
                : isHovered
                  ? "rgba(255,255,255,0.8)"
                  : "rgba(255,255,255,0.55)",
              textShadow: isActive ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
            }}
            onClick={() => setActiveTab(index)}
            onMouseEnter={() => setHoveredTab(index)}
            onMouseLeave={() => setHoveredTab(null)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
