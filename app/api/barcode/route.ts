import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin()
  const authHeader = request.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 })
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = authData.user.id
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("gym_barcode_path")
    .eq("user_id", userId)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if (!profile?.gym_barcode_path) {
    return NextResponse.json({ error: "No barcode on file" }, { status: 404 })
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("user-assets")
    .createSignedUrl(profile.gym_barcode_path, 60)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message || "Failed to sign url" }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
