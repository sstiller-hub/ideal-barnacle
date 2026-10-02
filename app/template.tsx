"use client"

import type React from "react"
import { useEffect } from "react"
import { motion, useReducedMotion } from "motion/react"

// The fade/scale-in is a navigation transition, so the very first load skips
// it. That also keeps the server HTML at full opacity — the server can't know
// the user's motion preference, and starting at opacity 0 left every page
// faded until hydration caught up.
let hasNavigated = false

export default function Template({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  const animateIn = hasNavigated && !reduceMotion

  useEffect(() => {
    hasNavigated = true
  }, [])

  return (
    <motion.div
      initial={animateIn ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
      transition={{
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1],
      }}
      style={{ height: "100%" }}
    >
      {children}
    </motion.div>
  )
}
