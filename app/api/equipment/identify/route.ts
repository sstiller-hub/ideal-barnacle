import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import * as z from "zod/v4"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { checkRateLimit } from "@/lib/rate-limit"

// Identifies the gym equipment in a photo. Returns a suggestion only — the
// client shows it for the user to confirm or edit before anything is saved.

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BASE64_LENGTH = 6_000_000 // ~4.5 MB decoded; the client sends ~300 KB
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const

const RequestSchema = z.object({
  exerciseName: z.string().trim().min(1).max(200),
  image: z.string().min(1).max(MAX_BASE64_LENGTH),
  mediaType: z.enum(MEDIA_TYPES),
})

const SuggestionSchema = z.object({
  identified: z.boolean(),
  equipment_name: z.string(),
  brand: z.string().nullable(),
  equipment_type: z.string().nullable(),
  notes: z.string().nullable(),
})

const SYSTEM_PROMPT = `You identify gym equipment from a photo so a lifter can record exactly which piece of equipment they used for an exercise. The record is used to keep their training history on a consistent load scale, so precision matters more than sounding confident.

Return:
- identified: true only if the photo clearly shows a piece of gym equipment.
- equipment_name: a short, specific name a lifter would recognise, e.g. "Iso-Lateral Chest Press", "Plate-Loaded Hack Squat", "Dual Adjustable Pulley". Include the model or line name if a label is legible. If identified is false, give your best short description of what the photo shows instead.
- brand: the manufacturer only if a logo or label is visible (e.g. "Hammer Strength", "Life Fitness", "Matrix"); otherwise null. Do not guess a brand from shape alone.
- equipment_type: one of "selectorized machine", "plate-loaded machine", "cable", "smith machine", "free weight", "bench", "rack", "bodyweight station", "cardio", or "other".
- notes: one short sentence on anything that affects loading or setup and is visible in the photo (e.g. "Weight stack in 15 lb increments", "Converging arms, independent sides"). null if nothing relevant is visible.`

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Equipment photos aren't set up on this server." }, { status: 503 })
  }

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

  const rateLimit = checkRateLimit(`equipment-identify:${authData.user.id}`, 20, 60 * 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many photos this hour. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    )
  }

  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const { exerciseName, image, mediaType } = parsedBody.data

  const client = new Anthropic()
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(SuggestionSchema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            {
              type: "text",
              text: `This is the equipment I'm about to use for: ${exerciseName}. What is it?`,
            },
          ],
        },
      ],
    })

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Couldn't read that photo. Try another angle." }, { status: 422 })
    }
    const suggestion = response.parsed_output
    if (!suggestion || !suggestion.equipment_name.trim()) {
      return NextResponse.json({ error: "Couldn't identify the equipment. Try another photo." }, { status: 422 })
    }
    return NextResponse.json({ data: suggestion })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Identification is busy. Try again in a minute." }, { status: 503 })
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.warn("[equipment-identify] bad request", error.message)
      return NextResponse.json({ error: "That photo couldn't be processed." }, { status: 422 })
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[equipment-identify] api error", error.status, error.message)
      return NextResponse.json({ error: "Identification failed. Try again." }, { status: 502 })
    }
    console.error("[equipment-identify] unexpected error", error)
    return NextResponse.json({ error: "Identification failed. Try again." }, { status: 500 })
  }
}
