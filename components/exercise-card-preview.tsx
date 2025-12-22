"use client"

import { Button } from "@/components/ui/button"
import { Check, Minus, Plus } from "lucide-react"

export function ExerciseCardPreview() {
  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Current Design</h3>
        <div className="border-2 border-orange-500 rounded-xl bg-orange-50/30 p-3">
          <div className="text-sm font-medium text-muted-foreground mb-2">1</div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                <Minus className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center">
                <div className="text-2xl font-semibold">50</div>
                <div className="text-xs text-muted-foreground">lbs</div>
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                <Minus className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center">
                <div className="text-2xl font-semibold">0</div>
                <div className="text-xs text-muted-foreground">reps</div>
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground mb-2">Plates per side</div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-2 bg-muted rounded-full relative">
                <div className="absolute left-1/4 top-1/2 -translate-y-1/2 w-3 h-6 bg-green-500 rounded" />
              </div>
            </div>
            <div className="text-xs">
              Plates: <span className="font-medium">25</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Button size="icon" className="h-9 w-9 bg-orange-500 hover:bg-orange-600">
              <Check className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-emerald-600">Proposed Design</h3>
        <div className="border-2 border-orange-500 rounded-xl bg-orange-50/30 p-3 space-y-2">
          {/* Single row layout */}
          <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
            {/* Set badge */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background text-sm font-medium">
              1
            </div>

            {/* Weight control */}
            <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5">
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Minus className="h-3 w-3" />
              </Button>
              <div className="flex-1 text-center">
                <div className="text-lg font-semibold leading-none">50</div>
                <div className="text-[10px] text-muted-foreground">lbs</div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Reps control */}
            <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5">
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Minus className="h-3 w-3" />
              </Button>
              <div className="flex-1 text-center">
                <div className="text-lg font-semibold leading-none">12</div>
                <div className="text-[10px] text-muted-foreground">reps</div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Checkmark */}
            <Button size="icon" className="h-8 w-8 bg-orange-500 hover:bg-orange-600">
              <Check className="h-4 w-4" />
            </Button>
          </div>

          {/* Compact plate info */}
          <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-base">🏋️</span>
              <span className="text-muted-foreground">Plates per side:</span>
            </div>
            <span className="font-semibold">25 lbs</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-purple-600">Alternative: Ultra-Compact</h3>
        <div className="border-2 border-orange-500 rounded-xl bg-orange-50/30 p-2 space-y-1.5">
          {/* Condensed single row */}
          <div className="flex items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-xs font-medium">
              1
            </div>

            <div className="flex flex-1 items-center gap-1 rounded-md border bg-background px-1.5 py-1">
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <Minus className="h-3 w-3" />
              </Button>
              <div className="flex-1 text-center">
                <div className="text-base font-semibold leading-none">50</div>
              </div>
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <span className="text-xs text-muted-foreground">×</span>

            <div className="flex flex-1 items-center gap-1 rounded-md border bg-background px-1.5 py-1">
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <Minus className="h-3 w-3" />
              </Button>
              <div className="flex-1 text-center">
                <div className="text-base font-semibold leading-none">12</div>
              </div>
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <Button size="icon" className="h-7 w-7 bg-orange-500 hover:bg-orange-600">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Minimal plate display */}
          <div className="flex items-center justify-between rounded-md bg-background/60 px-2 py-1 text-[11px]">
            <span className="text-muted-foreground">🏋️ Per side</span>
            <span className="font-medium">25 lbs</span>
          </div>
        </div>
      </div>
    </div>
  )
}
