import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { runWorkoutAnalytics } from "@/lib/workout-analytics-server"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const workoutId = id
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

  const rateLimit = checkRateLimit(`complete:${userId}`, 20, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    )
  }

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("id, user_id")
    .eq("id", workoutId)
    .single()

  if (workoutError || !workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 })
  }
  if (workout.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await runWorkoutAnalytics(supabase, { userId, workoutId })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analytics failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
