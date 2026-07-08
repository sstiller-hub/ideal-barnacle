'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group relative isolate inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-sans font-medium outline-none [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] select-none transition-[background-color,border-color,transform] duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[pressed=true]:translate-y-px focus-visible:ring-2 focus-visible:ring-[#FFFFFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#000000] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: [
          'border-0 bg-[#FFFFFF] text-[#0D0D0F]',
          'data-[hoverable=true]:hover:bg-[#EDEDEE]',
          'data-[pressed=true]:bg-[#D2D2D4] data-[pressed=true]:shadow-[inset_0_2px_3px_rgba(0,0,0,0.16)]',
        ],
        secondary: [
          'border border-[rgba(255,255,255,0.08)] bg-[#2A2A2A] text-[rgba(255,255,255,0.95)]',
          'data-[hoverable=true]:hover:border-[rgba(255,255,255,0.14)] data-[hoverable=true]:hover:bg-[#333336]',
          'data-[pressed=true]:bg-[#1E1E20] data-[pressed=true]:shadow-[inset_0_2px_3px_rgba(0,0,0,0.4)]',
        ],
        ghost: [
          'border-0 bg-transparent text-[rgba(255,255,255,0.90)]',
          'data-[hoverable=true]:hover:bg-[rgba(255,255,255,0.04)]',
          'data-[pressed=true]:bg-[rgba(255,255,255,0.09)] data-[pressed=true]:shadow-[inset_0_2px_3px_rgba(0,0,0,0.4)]',
        ],
        outline: [
          'border border-[rgba(255,255,255,0.12)] bg-transparent text-[rgba(255,255,255,0.95)]',
          'data-[hoverable=true]:hover:border-[rgba(255,255,255,0.25)] data-[hoverable=true]:hover:bg-[rgba(255,255,255,0.02)]',
          'data-[pressed=true]:bg-[rgba(255,255,255,0.06)] data-[pressed=true]:shadow-[inset_0_2px_3px_rgba(0,0,0,0.4)]',
        ],
        destructive: [
          'border-0 bg-[#5A5A5A] text-[rgba(255,255,255,0.95)]',
          'data-[hoverable=true]:hover:bg-[#646464]',
          'data-[pressed=true]:bg-[#484848] data-[pressed=true]:shadow-[inset_0_2px_3px_rgba(0,0,0,0.4)]',
        ],
      },
      size: {
        sm: 'h-10 gap-1.5 rounded-[6px] px-4 text-xs has-[>svg]:px-3',
        default: 'h-12 rounded-[8px] px-[22px] text-sm has-[>svg]:px-4',
        lg: 'h-[60px] rounded-[10px] px-[30px] text-[15px] has-[>svg]:px-6',
        icon: 'size-12 rounded-[8px]',
        'icon-sm': 'size-10 rounded-[6px]',
        'icon-lg': 'size-[60px] rounded-[10px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

/** Ring color per variant — dark on the white primary, light on every dark surface. */
function ringColorForVariant(variant: ButtonProps['variant']) {
  return variant === 'default' ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.40)'
}

/** Spawns the actuation ring: a crisp monochrome pulse centered on the touch point. */
function spawnActuationRing(host: HTMLElement, clientX: number, clientY: number, color: string) {
  const rect = host.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  const radius = Math.max(
    Math.hypot(x, y),
    Math.hypot(rect.width - x, y),
    Math.hypot(x, rect.height - y),
    Math.hypot(rect.width - x, rect.height - y),
  )
  const diameter = radius * 2

  const ring = document.createElement('span')
  ring.setAttribute('aria-hidden', 'true')
  ring.className = 'akt-actuation-ring'
  ring.style.width = `${diameter}px`
  ring.style.height = `${diameter}px`
  ring.style.left = `${x - radius}px`
  ring.style.top = `${y - radius}px`
  ring.style.borderColor = color

  ring.addEventListener('animationend', () => ring.remove())
  host.appendChild(ring)
}

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Tracked ALL-CAPS control voice. Set false for long or sentence-case labels. */
    uppercase?: boolean
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  uppercase = true,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onPointerEnter,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e)
    if (e.defaultPrevented || props.disabled) return
    const el = e.currentTarget
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // Pointer may already be gone (e.g. released mid-dispatch) — the
      // press feedback below should still play out.
    }
    el.dataset.pressed = 'true'
    spawnActuationRing(el, e.clientX, e.clientY, ringColorForVariant(variant))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerUp?.(e)
    e.currentTarget.dataset.pressed = 'false'
  }

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerCancel?.(e)
    e.currentTarget.dataset.pressed = 'false'
  }

  const handlePointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerLeave?.(e)
    e.currentTarget.dataset.pressed = 'false'
    e.currentTarget.dataset.hoverable = 'false'
  }

  const handlePointerEnter = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerEnter?.(e)
    e.currentTarget.dataset.hoverable = e.pointerType === 'mouse' ? 'true' : 'false'
  }

  return (
    <Comp
      data-slot="button"
      data-pressed="false"
      data-hoverable="false"
      className={cn(buttonVariants({ variant, size, className }))}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onPointerEnter={handlePointerEnter}
      {...props}
    >
      <span
        className={cn(
          'relative z-10 inline-flex items-center justify-center gap-2',
          uppercase && 'uppercase tracking-[0.09em] font-semibold',
        )}
      >
        {children}
      </span>
    </Comp>
  )
}

export { Button, buttonVariants }
