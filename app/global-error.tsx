"use client"

import { useEffect } from "react"
import { reportClientError } from "@/lib/report-client-error"

/**
 * Root error boundary — the last resort for a crash in the root layout itself.
 *
 * This replaces the whole document, so it renders its own <html>/<body> and
 * cannot rely on the layout's providers, fonts, or stylesheet being applied.
 * Everything here is inline-styled with the palette from globals.css so the
 * screen still reads correctly when the app's CSS never loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError(error, "root")
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          backgroundColor: "#000000",
          color: "#FFFFFF",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "384px",
            borderRadius: "12px",
            border: "1px solid #2A2A2A",
            backgroundColor: "#1A1A1A",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Akt hit an error</h1>
          <p style={{ marginTop: "8px", fontSize: "14px", color: "#9CA3AF" }}>
            Your logged sets are saved on this device and will sync once you are back in.
          </p>

          {error.digest ? (
            <p
              style={{
                marginTop: "16px",
                fontSize: "12px",
                fontFamily: "ui-monospace, monospace",
                color: "#9CA3AF",
              }}
            >
              {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              width: "100%",
              height: "48px",
              borderRadius: "8px",
              border: 0,
              backgroundColor: "#FFFFFF",
              color: "#0D0D0F",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
