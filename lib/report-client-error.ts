"use client"

import { track } from "@vercel/analytics"

/**
 * Client-side crash reporting for the two error boundaries.
 *
 * The app has no error-reporting service, so a crash in the browser used to
 * leave no trace anywhere — server logs only ever see the API routes. Vercel
 * Analytics custom events are the one reporting channel already available on
 * the Hobby plan, so boundary crashes ride along as a `client_error` event.
 */

// Analytics drops a custom event whose property values are over-long, so trim
// the message rather than lose the whole report.
const MAX_MESSAGE_LENGTH = 100

export type ErrorBoundaryKind = "route" | "root"

export function reportClientError(
  error: Error & { digest?: string },
  boundary: ErrorBoundaryKind,
): void {
  console.error(`[${boundary}-error]`, error)

  try {
    track("client_error", {
      boundary,
      // Set by Next.js on server-thrown errors; the only handle on a message
      // that production has stripped from the client.
      digest: error.digest ?? null,
      message: error.message.slice(0, MAX_MESSAGE_LENGTH),
      path: typeof window === "undefined" ? null : window.location.pathname,
    })
  } catch {
    // Reporting is best-effort. A blocked script or an ad blocker eating the
    // analytics endpoint must never keep the error screen from rendering.
  }
}
