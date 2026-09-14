"use client"

import type React from "react"
import { ChevronRight } from "lucide-react"

/** Uppercase 13pt section header above a grouped list or card. */
export function IosSectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="ios-ghd">{children}</div>
}

/** 13pt explanatory copy beneath a group. */
export function IosSectionFooter({ children }: { children: React.ReactNode }) {
  return <div className="ios-gft">{children}</div>
}

/** Inset grouped container — rows inside get hairline separators for free. */
export function IosGroup({
  children,
  hasIcons = false,
  style,
}: {
  children: React.ReactNode
  /** Indents the hairlines to 57pt so they clear leading icon tiles. */
  hasIcons?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div className="ios-grp" data-icons={hasIcons} style={style}>
      {children}
    </div>
  )
}

type RowProps = {
  icon?: React.ReactNode
  label: React.ReactNode
  /** Secondary line under the label (account cell, routine rows). */
  detail?: React.ReactNode
  /** Trailing 17pt ink-45 value. */
  value?: React.ReactNode
  /** Trailing control that replaces the chevron (a switch, say). */
  accessory?: React.ReactNode
  chevron?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

export function IosRow({
  icon,
  label,
  detail,
  value,
  accessory,
  chevron = false,
  onClick,
  style,
}: RowProps) {
  const interactive = Boolean(onClick)
  const Tag = interactive ? "button" : "div"
  return (
    <Tag
      className="ios-row"
      {...(interactive ? { type: "button" as const, onClick } : {})}
      style={{ cursor: interactive ? "pointer" : "default", ...style }}
    >
      {icon ? <span className="ios-tile">{icon}</span> : null}
      <span style={{ minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ display: "block" }}>{label}</span>
        {detail ? (
          <span style={{ display: "block", fontSize: "13px", color: "var(--ink-40)", marginTop: "2px" }}>
            {detail}
          </span>
        ) : null}
      </span>
      {value ? <span className="ios-row__value">{value}</span> : null}
      {accessory}
      {chevron ? <ChevronRight size={18} strokeWidth={2} className="ios-row__chevron" /> : null}
    </Tag>
  )
}

/** Centred action row (Dry Run / Send Now). */
export function IosActionRow({
  label,
  onClick,
  emphasis = false,
  disabled = false,
}: {
  label: React.ReactNode
  onClick: () => void
  emphasis?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="ios-row"
      onClick={onClick}
      disabled={disabled}
      style={{
        justifyContent: "center",
        fontWeight: emphasis ? 600 : 400,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  )
}

/** Inset grouped card — same surface as a group, free-form contents. */
export function IosCard({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="ios-card" style={style}>
      {children}
    </div>
  )
}
