import { NextResponse } from "next/server"
import { z } from "zod"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import {
  EQUIPMENT_IDENTIFICATION_SCHEMA,
  buildIdentifyPrompt,
  parseIdentification,
} from "@/lib/equipment"

export const runtime = "nodejs"
export const maxDuration = 30

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const DEFAULT_MODEL = "claude-sonnet-5-5"
// Vercel caps request bodies at 4.5 MB; the client sends a ~1280px JPEG.
const MAX_BASE64_CHARS = 4_000_000
const TIMEOUT_MS = 25_000

const bodySchema = z.object({
  image: z.string().min(100).max(MAX_BASE64_CHARS),
  media_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  exercise_name: z.string().trim().min(1).max(120),
})

type AnthropicContentBlock = { type: string; text?: string }
type AnthropicResponse = {
  content?: AnthropicContentBlock[]
  stop_reason?: string
  error?: { message?: string }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Equipment ID isn't set up: ANTHROPIC_API_KEY is missing." }, { status: 503 })
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
  const userId = authData.user.id

  const rateLimit = checkRateLimit(`equipment:${userId}`, 20, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    )
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid photo payload" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_EQUIPMENT_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        // Mid-workout: keep it quick. Schema-constrained JSON instead of a
        // forced tool call, which Sonnet 5.5 rejects.
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: EQUIPMENT_IDENTIFICATION_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: body.media_type, data: body.image } },
              { type: "text", text: buildIdentifyPrompt(body.exercise_name) },
            ],
          },
        ],
      }),
    })
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return NextResponse.json(
      { error: aborted ? "Claude took too long. Try again or type the name." : "Couldn't reach Claude." },
      { status: 504 }
    )
  } finally {
    clearTimeout(timeout)
  }

  let payload: AnthropicResponse
  try {
    payload = (await response.json()) as AnthropicResponse
  } catch {
    return NextResponse.json({ error: "Claude returned an unreadable response." }, { status: 502 })
  }

  if (!response.ok) {
    console.warn("[equipment] anthropic error", response.status, payload?.error?.message)
    return NextResponse.json({ error: "Claude couldn't read that photo." }, { status: 502 })
  }
  if (payload.stop_reason === "refusal") {
    return NextResponse.json({ error: "Claude declined that photo. Type the name instead." }, { status: 422 })
  }

  const text = payload.content?.find((block) => block.type === "text")?.text
  let identification = null
  try {
    identification = text ? parseIdentification(JSON.parse(text)) : null
  } catch {
    identification = null
  }
  if (!identification) {
    return NextResponse.json({ error: "Claude couldn't name that equipment. Type the name instead." }, { status: 422 })
  }

  return NextResponse.json({ data: identification })
}
