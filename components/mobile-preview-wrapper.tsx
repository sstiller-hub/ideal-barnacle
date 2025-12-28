"use client"

import { useSearchParams } from "next/navigation"

const DEVICE_PRESETS: Record<string, { width: number; height: number }> = {
  iphone16: { width: 430, height: 932 },
}

export default function MobilePreviewWrapper({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const preset = searchParams.get("mobilePreview")

  if (!preset || !DEVICE_PRESETS[preset]) {
    return <>{children}</>
  }

  const { width, height } = DEVICE_PRESETS[preset]

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div
        className="bg-background border border-border rounded-[32px] shadow-lg overflow-hidden"
        style={{ width, height }}
      >
        {children}
      </div>
    </div>
  )
}
