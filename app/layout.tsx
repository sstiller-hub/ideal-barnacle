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
      { url: "/akt-app-icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
        <link rel="icon" href="/akt-app-icon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
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
