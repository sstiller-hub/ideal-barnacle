import type React from "react"
import { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import UpdateAvailableBanner from "@/components/update-available"
import SonnerProvider from "@/components/sonner-provider"
import MobilePreviewWrapper from "@/components/mobile-preview-wrapper"
import { ThemeProvider } from "@/components/theme-provider"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

// Added PWA metadata and viewport configuration
export const metadata: Metadata = {
  title: "Akt",
  description: "Track workouts, monitor progress, and hit new PRs",
  generator: "v0.app",
  applicationName: "Akt",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Akt",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      {
        url: "/kova-tab-2.svg",
        type: "image/svg+xml",
      },
      {
        url: "/icon-light-32x32.png?v=2",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png?v=2",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg?v=2",
        type: "image/svg+xml",
      },
    ],
    apple: [
      { url: "/icons/akt-app-120.png?v=20260211", sizes: "120x120", type: "image/png" },
      { url: "/icons/akt-app-152.png?v=20260211", sizes: "152x152", type: "image/png" },
      { url: "/icons/akt-app-167.png?v=20260211", sizes: "167x167", type: "image/png" },
      { url: "/icons/akt-app-180.png?v=20260211", sizes: "180x180", type: "image/png" },
    ],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ea580c",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/kova-tab-2.svg" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icons/akt-app-120.png?v=20260211" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/akt-app-152.png?v=20260211" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/akt-app-167.png?v=20260211" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/akt-app-180.png?v=20260211" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Suspense fallback={children}>
            <MobilePreviewWrapper>{children}</MobilePreviewWrapper>
          </Suspense>
          <SonnerProvider />
          <UpdateAvailableBanner />
        </ThemeProvider>
      </body>
    </html>
  )
}
