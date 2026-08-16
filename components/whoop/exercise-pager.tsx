"use client"

import { useRef, type ReactNode } from "react"

type ExercisePagerProps = {
  onPrevious: () => void
  onNext: () => void
  children: ReactNode
}

// Same swipe idiom as the home screen's day browser (app/page.tsx): track the
// delta on move, decide on end, ignore anything more vertical than horizontal
// so scrolling the set list never pages the exercise.
export default function ExercisePager({ onPrevious, onNext, children }: ExercisePagerProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const deltaRef = useRef<{ x: number; y: number } | null>(null)

  const handleStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) return
    startRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    deltaRef.current = null
  }

  const handleMove = (event: React.TouchEvent) => {
    if (!startRef.current || event.touches.length !== 1) return
    deltaRef.current = {
      x: event.touches[0].clientX - startRef.current.x,
      y: event.touches[0].clientY - startRef.current.y,
    }
  }

  const handleEnd = () => {
    const delta = deltaRef.current
    startRef.current = null
    deltaRef.current = null
    if (!delta) return
    if (Math.abs(delta.x) < 50 || Math.abs(delta.x) <= Math.abs(delta.y)) return
    if (delta.x > 0) onPrevious()
    else onNext()
  }

  return (
    <div onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}>
      {children}
    </div>
  )
}
