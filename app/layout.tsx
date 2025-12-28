import type React from "react"
import { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import UpdateAvailableBanner from "@/components/update-available"
import SonnerProvider from "@/components/sonner-provider"
import MobilePreviewWrapper from "@/components/mobile-preview-wrapper"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

// Added PWA metadata and viewport configuration
export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Track workouts, monitor progress, and hit new PRs",
  generator: "v0.app",
  applicationName: "Workout Tracker",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Workout Tracker",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ea580c",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`font-sans antialiased`}>
        <Suspense fallback={children}>
          <MobilePreviewWrapper>{children}</MobilePreviewWrapper>
        </Suspense>
        <SonnerProvider />
        <UpdateAvailableBanner />
      </body>
    </html>
  )
}
