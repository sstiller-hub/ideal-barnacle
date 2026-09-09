"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { reportClientError } from "@/lib/report-client-error"

/**
 * Route-level error boundary. Catches render and data errors below the root
 * layout, which previously white-screened the app with no way back other than
 * a manual reload.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError(error, "route")
  }, [error])

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold text-card-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your logged sets are saved on this device and will sync once you are back in.
        </p>

        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-muted-foreground">{error.digest}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="ghost" onClick={() => window.location.assign("/")}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  )
}
