// Design-system entry for /design-sync.
//
// This repo is a Next.js app, not a published component package, so there is no
// dist/ to point the converter at. This barrel is the design-system surface:
// the presentational components that render standalone, with default exports
// given explicit names (a synthesized `export *` entry drops defaults).
//
// Deliberately excluded: data-wired screens (WorkoutSession, TranscriptionSession,
// WorkoutScheduleEditor, alerts sheets) and providers — they read Supabase/hooks
// and cannot render as design-system parts.

import type { ReactNode } from 'react'

/**
 * The design system's root frame. Mirrors what `app/layout.tsx` + `globals.css`
 * give every screen in the real app: the black terminal surface, the foreground
 * colour, and the sans stack. Components are white-on-black by design, so
 * anything rendered outside this frame is invisible against a light page.
 *
 * Wrap the root of every design in it.
 */
export function AppFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="bg-background text-foreground font-sans antialiased min-h-full p-4">
      {children}
    </div>
  )
}

export {
  Button,
  buttonVariants,
} from '@/components/ui/button'
export { Badge, badgeVariants } from '@/components/ui/badge'
export { Input } from '@/components/ui/input'
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

export { BandHeader } from '@/components/ledger/band-header'
export { DeltaChip } from '@/components/ledger/delta-chip'
export { SessionClock } from '@/components/ledger/session-clock'
export { Sparkline } from '@/components/ledger/sparkline'
export { StatUnit } from '@/components/ledger/stat-unit'

export { default as AktIndicatorChip } from '@/components/akt-indicator-chip'
export { default as AktProgramMessageLine } from '@/components/akt-program-message-line'
export { default as SetRow } from '@/components/whoop/set-row'
export { default as TranscriptionHeader } from '@/components/whoop/transcription-header'

export { ExerciseCardPreview } from '@/components/exercise-card-preview'
export { VolumeControls } from '@/components/volume-controls'
