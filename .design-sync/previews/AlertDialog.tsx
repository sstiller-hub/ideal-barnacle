import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'my-v0-project'

// Ported from app/settings/page.tsx — the deload confirmation is this
// dialog's canonical use. `open` is pinned so the card renders the open state.
export function Confirm() {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start Deload Week</AlertDialogTitle>
          <AlertDialogDescription>
            Deload week reduces your volume and intensity for 7 days to promote
            recovery. Your workouts will auto-adjust — sets are halved and
            weights are pre-filled at ~72% of your working weights. You can
            still edit everything manually.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Start Deload</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function ShortPrompt() {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send workouts to cloud</AlertDialogTitle>
          <AlertDialogDescription>
            This will attempt to upload 3 workouts from this device. If you have
            multiple devices, conflicts can happen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Send now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
