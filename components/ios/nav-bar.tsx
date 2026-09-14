"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"

type Props = {
  /** Title of the screen this page was pushed from, shown beside the chevron. */
  backLabel: string
  onBack: () => void
  title: string
  subtitle?: React.ReactNode
  /** Trailing nav-bar action (e.g. share on Summary). */
  action?: React.ReactNode
  /** Long titles drop from 34pt to 28pt, per the handoff. */
  longTitle?: boolean
  children: React.ReactNode
}

/**
 * iOS pushed-page scaffold: a 44pt nav bar with a chevron + previous screen's
 * title, and a large title below it that collapses into an inline 17pt title
 * once it scrolls out of view (what UINavigationBar does natively; here an
 * IntersectionObserver on the large title drives it).
 */
export function IosNavPage({
  backLabel,
  onBack,
  title,
  subtitle,
  action,
  longTitle = false,
  children,
}: Props) {
  const largeTitleRef = useRef<HTMLHeadingElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const node = largeTitleRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      // The nav bar itself covers the top 44pt plus the status-bar inset, so
      // the large title counts as "gone" once it slides under that.
      { threshold: 0, rootMargin: "-72px 0px 0px 0px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div className="ios-navbar" data-scrolled={collapsed}>
        <button type="button" className="ios-navbar__back" onClick={onBack}>
          <ChevronLeft size={24} strokeWidth={2.4} />
          <span>{backLabel}</span>
        </button>
        {/* Rendered only while collapsed: keeping the text mounted would put
            the page title in the DOM twice, which screen readers announce and
            text queries trip over. The span itself stays so the opacity
            transition still has something to fade. */}
        <span className="ios-navbar__inline-title" data-visible={collapsed} aria-hidden={!collapsed}>
          {collapsed ? title : null}
        </span>
        <span className="flex items-center">{action}</span>
      </div>

      <h1 ref={largeTitleRef} className="ios-large-title" data-long={longTitle}>
        {title}
      </h1>
      {subtitle ? <div className="ios-ltsub">{subtitle}</div> : null}

      {children}
    </>
  )
}

/** Tab-root header: large title, no back button. */
export function IosLargeTitleHeader({
  title,
  subtitle,
  longTitle = false,
}: {
  title: string
  subtitle?: React.ReactNode
  longTitle?: boolean
}) {
  return (
    <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}>
      <h1 className="ios-large-title" data-long={longTitle}>
        {title}
      </h1>
      {subtitle ? <div className="ios-ltsub">{subtitle}</div> : null}
    </div>
  )
}

export default IosNavPage
