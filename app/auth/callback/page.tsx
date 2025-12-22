"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [msg, setMsg] = useState("Signing you in…")

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href)

        // 1) PKCE flow: ?code=...
        const code = url.searchParams.get("code")
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
          if (error) throw error
        }

        // 2) Token flow in QUERY: ?access_token=...&refresh_token=...
        const qAccess = url.searchParams.get("access_token")
        const qRefresh = url.searchParams.get("refresh_token")
        if (qAccess && qRefresh) {
          const { error } = await supabase.auth.setSession({
            access_token: qAccess,
            refresh_token: qRefresh,
          })
          if (error) throw error
        }

        // 3) Token flow in HASH: #access_token=...&refresh_token=...
        const hash = window.location.hash?.startsWith("#")
          ? window.location.hash.slice(1)
          : ""
        if (hash.includes("access_token")) {
          const params = new URLSearchParams(hash)
          const access_token = params.get("access_token")
          const refresh_token = params.get("refresh_token")

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token })
            if (error) throw error
          }
        }

        // confirm
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!data.session) {
          setMsg("No session found — auth redirect worked, but session was not created.")
          return
        }

        router.replace("/settings")
      } catch (e: any) {
        console.error("Auth callback failed:", e)
        setMsg(e?.message || "Auth failed")
      }
    }

    run()
  }, [router])

  return <p className="p-4 text-sm">{msg}</p>
}