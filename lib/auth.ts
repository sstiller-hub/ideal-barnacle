// lib/auth.ts
import { supabase } from "@/lib/supabase"

export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`
    },
  })

  return { error } // <-- always return this shape
}