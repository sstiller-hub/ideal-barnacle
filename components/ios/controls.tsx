"use client"

import type React from "react"
import { useEffect, useRef } from "react"
import { Check, ChevronDown } from "lucide-react"

/** iOS segmented control — one row, selected segment lifts on a shadowed pill. */
export function IosSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly T[] | readonly { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  ariaLabel?: string
}) {
  const items = options.map((option) =>
    typeof option === "string" ? { value: option as T, label: option } : option,
  )
  return (
    <div className="ios-segmented" role="tablist" aria-label={ariaLabel}>
      {items.map(({ value: optionValue, label }) => (
        <button
          key={optionValue}
          type="button"
          role="tab"
          aria-selected={optionValue === value}
          data-selected={optionValue === value}
          className="ios-segmented__seg"
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export type IosMenuOption<T extends string> = {
  value: T
  label: string
  /** Optional second line (routine picker rows). */
  detail?: string
}

/**
 * A chip that opens an iOS-style pull-down menu (UIMenu): the chip lifts while
 * the menu is open, the menu is anchored 8pt below it, and it dismisses on an
 * outside tap, on selection, or on Escape.
 */
export function IosPullDownChip<T extends string>({
  label,
  open,
  onOpenChange,
  header,
  options,
  value,
  onSelect,
  menuWidth = 250,
  menuStyle,
  children,
}: {
  label?: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  header?: string
  options: IosMenuOption<T>[]
  value: T | null
  onSelect: (next: T) => void
  menuWidth?: number
  menuStyle?: React.CSSProperties
  /** Custom trigger; defaults to the chip. */
  children?: (props: { open: boolean; toggle: () => void }) => React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onOpenChange])

  const toggle = () => onOpenChange(!open)

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
      {children ? (
        children({ open, toggle })
      ) : (
        <button
          type="button"
          className="ios-chip"
          data-open={open}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
        >
          {label}
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      )}

      {open ? (
        <div
          role="menu"
          className="ios-menu"
          style={{ top: "calc(100% + 8px)", left: 0, width: `${menuWidth}px`, ...menuStyle }}
        >
          {header ? <div className="ios-menu__header">{header}</div> : null}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className="ios-menu__item"
              onClick={() => {
                onSelect(option.value)
                onOpenChange(false)
              }}
            >
              <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                <span style={{ display: "block" }}>{option.label}</span>
                {option.detail ? (
                  <span style={{ display: "block", fontSize: "13px", color: "var(--ink-50)", marginTop: "2px" }}>
                    {option.detail}
                  </span>
                ) : null}
              </span>
              {option.value === value ? <Check size={18} strokeWidth={2.4} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Native-style switch, replacing the checkboxes in Settings. */
export function IosSwitch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-on={checked}
      className="ios-switch"
      onClick={() => onChange(!checked)}
    />
  )
}
