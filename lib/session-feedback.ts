// Non-visual confirmation for the set-logging loop.
//
// During a working set the phone is usually face-down on a bench or in a
// pocket, so every confirmation the session UI gives visually needs a channel
// that lands without looking. Vibration covers Android; iOS Safari has no
// Vibration API at all, so iOS falls back to the switch trick below for the
// cues that come from a tap, and to an audible chime for the one that does not.

const REST_SOUND_KEY = "rest_sound_enabled"

export type HapticPattern =
  // A value changed under the thumb (stepper tap).
  | "tap"
  // A set was logged — slightly heavier so it reads as a commit, not a nudge.
  | "logged"
  // Rest hit zero. Long enough to notice through a pocket.
  | "restOver"

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  logged: 18,
  restOver: [90, 60, 90, 60, 180],
}

// Toggling an <input type="checkbox" switch> plays a system haptic on iOS
// 17.4+, which is the only way to reach the Taptic Engine from a PWA. The
// element is built once and kept off-screen; the haptic comes from the toggle
// itself, so nothing ever needs to render or be read out.
let switchLabel: HTMLLabelElement | null = null

function getSwitchLabel(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null
  if (!switchLabel) {
    const label = document.createElement("label")
    label.ariaHidden = "true"
    label.style.display = "none"
    const input = document.createElement("input")
    input.type = "checkbox"
    // Not in the TS DOM lib yet — it is iOS-only and unratified.
    input.setAttribute("switch", "")
    label.appendChild(input)
    document.head.appendChild(label)
    switchLabel = label
  }
  return switchLabel
}

export function haptic(pattern: HapticPattern): void {
  if (typeof navigator === "undefined") return

  if (typeof navigator.vibrate !== "function") {
    // iOS only fires the switch haptic inside user activation, so "restOver"
    // — which comes off a timer, with no tap behind it — cannot use this and
    // stays on playRestChime(). It also has one fixed intensity, so "tap" and
    // "logged" feel the same here; the weight difference is Android-only.
    if (pattern === "restOver") return
    try {
      getSwitchLabel()?.click()
    } catch {
      // Best-effort, same as vibration below.
    }
    return
  }

  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Vibration is best-effort; a rejection must never break the log action.
  }
}

export function isRestSoundEnabled(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(REST_SOUND_KEY) !== "false"
}

export function setRestSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  localStorage.setItem(REST_SOUND_KEY, String(enabled))
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) {
    try {
      audioContext = new Ctor()
    } catch {
      return null
    }
  }
  return audioContext
}

// WebAudio starts suspended until a user gesture. Priming from the same tap
// that starts the rest timer means the chime can fire later on a timer, with no
// gesture of its own — which is the only moment it is actually useful.
export function primeRestChime(): void {
  if (!isRestSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
}

// Two short sine blips. Synthesized rather than shipped as an asset so there is
// nothing to fetch at the moment it needs to play.
export function playRestChime(): void {
  if (!isRestSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()
  try {
    const startAt = ctx.currentTime
    ;[0, 0.18].forEach((offset, index) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = index === 0 ? 880 : 1174.7
      const at = startAt + offset
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.18)
    })
  } catch {
    // Audio is best-effort — the visual timer and notification still land.
  }
}
