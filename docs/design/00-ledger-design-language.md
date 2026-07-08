# Ledger Design Language — Shared Foundation

**Status:** Approved direction. This file is the shared foundation for two screen redesigns:

- `01-home-screen-spec.md` — Home screen ("One ledger, three horizons")
- `02-active-workout-spec.md` — Active workout ("One lane, one live set")

Visual references (approved mockups):
- Home: https://claude.ai/code/artifact/4e24a822-ffe2-4fb6-96ff-3e7aaeac184b
- Session: https://claude.ai/code/artifact/a2a495a2-afbd-46ef-916d-24409c0d5948

**Read this file first, build the shared components in it, then implement the two screen specs.** The screen specs assume these components exist.

---

## 1. The doctrine (why every rule below exists)

Kova is a *system of record* (see CLAUDE.md → Product Philosophy). Systems of record are ledgers: hairline rules, tabular numerals, one ink, and color only where something was earned. The current screens have the right information — the incohesion comes from each section speaking its own dialect. Five rules unify them:

1. **One vocabulary.** Repeated anatomy (band headers, chips, stat units) is the cohesion mechanism.
2. **One numeral voice.** Every headline stat is Bebas numeral + small unit + condensed cap.
3. **Color is earned.** Emerald (`--good`) appears only when the lifter beat something. Declines and neutrals stay in the ink ladder. Never red/orange for a down number — the app records, it does not judge.
4. **One surface, one radius.** Flat bands separated by hairlines. Only *interactive* elements get a border, always at `--radius-flat` (surfaces like the rest dock use `--radius-xs`). If it has a border, you can press it.
5. **State changes ink, never layout.** No element changes size, position, or shape as a result of a state change. Exactly one element on screen may be permanently animated ("one live thing").

---

## 2. Tokens — use only these

All of these already exist in `app/globals.css` (from the Akt sync). **No new tokens are needed. No raw `rgba(255,255,255,x)` literals or hex colors in new/edited JSX** — use the CSS vars.

| Purpose | Token |
|---|---|
| Ink ladder | `--ink-95 … --ink-02` (95/90/85/70/50/40/35/30/25/20/15/12/08/06/04/02) |
| Earned accent | `--good` (#34d399), `--good-tint` (10%), `--good-ink` (70%) |
| Display face | `--font-display` (Bebas Neue) |
| Label face | `--font-label` (Archivo Narrow) |
| Body face | Geist (default `--font-sans`) |
| Radii | `--radius-flat` (1px, controls) · `--radius-xs` (4px, docked surfaces) |
| Motion | `--ease-theatre` · `--duration-fast/base/slow/entry` |

**Delete on sight while implementing:** the hardcoded orange `#FF5733` (all occurrences — it exists nowhere in the token system), and ad-hoc radii `2px`, `3px`, `5px`, `8px`, `14px`, `18px` in the two target files.

---

## 3. Typography roles

| Role | Spec | Usage |
|---|---|---|
| Marquee | `--font-display` 48–52px, line-height 0.9, color `#fff` | Screen title only (UPPER / exercise name uses 36–40px) |
| Stat numeral | `--font-display` 34px, line-height 1, `--ink-95`, `font-variant-numeric: tabular-nums` | Every headline number |
| Stat unit | 12px, `--ink-30`, letter-spacing 0.06em, inline after numeral (e.g. `LB`, `× `, `OF 8`) | |
| Stat cap | `--font-label` 8px 600, letter-spacing 0.16em, `--ink-30`, uppercase, margin-top 5px | Label under numeral |
| Band label | `--font-label` 10px 600, letter-spacing 0.2em, `--ink-35`, uppercase | Section headers |
| Eyebrow | `--font-label` 9px 600, letter-spacing 0.2em, `--ink-35` | Above titles |
| Row text | Geist 11px 400, `--ink-85` | List/receipt rows |
| Row meta | Geist 8.5–9px 400, `--ink-30` tabular | Set counts, dates |

Kill the current 6px/7px micro-label one-offs; the minimum label size is 8px.

---

## 4. Shared components (build these first)

Create `components/ledger/` with the following. Keep them presentational (no data fetching); style with inline styles or Tailwind consistent with the codebase's current idiom.

### 4.1 `DeltaChip` — `components/ledger/delta-chip.tsx`

The single comparison component used everywhere (home band headers, PR cards, session set rows).

```ts
type DeltaChipProps = {
  tone: "good" | "neutral"        // good = earned (beat / PR / trending up). neutral = everything else incl. declines
  arrow?: "up" | "down"           // optional leading arrow glyph (↑ / ↓ as text)
  value: string                   // e.g. "+0.7K", "22.9K", "MATCHED", "26 OF 30", "PR · 210 × 6"
  pct?: string                    // e.g. "2%" — rendered at 65% opacity
  context?: string                // e.g. "VS LAST UPPER · 1W" — rendered at 55% opacity, letter-spacing 0.08em
  size?: "sm" | "md"              // md default (10px, 3px 8px padding); sm (8.5px, 2px 7px)
}
```

Styles:
- `display: inline-flex; align-items: center; gap: 5px; border-radius: var(--radius-flat); white-space: nowrap;`
- Font: `--font-label`, 600, letter-spacing 0.05em, tabular-nums.
- `tone="good"`: color `--good-ink`, background `--good-tint`, border `1px solid rgba(52,211,153,.22)` (this one rgba is acceptable — it is the tint border; alternatively add nothing and reuse `--good-tint`).
- `tone="neutral"`: color `--ink-40`, background `--ink-04`, border `1px solid var(--ink-08)`.

**Tone assignment rule (enforce in callers):** `good` only for: session/lift volume that *beat* the previous same workout, a lift trending up, a PR, "N of M lifts up" when N ≥ M/2, day-complete status dot. Everything else — including *all* negative deltas — is `neutral`. There is no "bad" tone.

### 4.2 `StatUnit` — `components/ledger/stat-unit.tsx`

```ts
type StatUnitProps = {
  value: string                    // pre-formatted, e.g. "30.6K", "9", "120.9K", "2:32"
  unit?: string                    // "LB", "OF 8", "/ 24" — rendered inline after value
  label: string                    // "VOLUME", "EXERCISES", "LIFTS BEATEN"
  size?: "md" | "sm"               // md: 34px numeral (home bands); sm: 21px numeral (session top bar)
}
```

Numeral per §3 "Stat numeral"; unit per "Stat unit" (sm: unit 10px); cap per "Stat cap" (sm: 7px caps, 0.16em, margin-top 4px).

### 4.3 `BandHeader` — `components/ledger/band-header.tsx`

```ts
type BandHeaderProps = { label: string; children?: ReactNode /* right slot, usually a DeltaChip */ }
```

`display:flex; align-items:center; gap:10px; margin-bottom:14px`. Label per §3 "Band label", `white-space:nowrap`. Middle: `flex:1; height:1px; background: var(--ink-08)`. Right slot renders `children`.

### 4.4 `Sparkline` — `components/ledger/sparkline.tsx`

One chart spec replacing the two divergent recharts configs (`TrainingVolumeCard` and `PRCard` in `app/page.tsx`). Recharts `AreaChart` with:

- Stroke: `rgba(255,255,255,0.30)`, width 1.5, `type="monotone"`.
- Fill: vertical gradient `rgba(255,255,255,0.08)` → transparent.
- Baseline: 1px line at the bottom, `--ink-06` (render as a `ReferenceLine` or absolutely-positioned div).
- Intermediate dots: r=1.3, `rgba(255,255,255,0.22)` (omit entirely for >12 points).
- Endpoint dot: r=2.2, `rgba(255,255,255,0.85)`.
- Prop `live?: boolean` — when true, overlay a pulse ring on the endpoint: absolutely positioned div, `border: 1px solid rgba(255,255,255,.35); border-radius: 50%;` animating `transform: scale(0.4→1.5)`, `opacity 0.9→0` over 2.4s infinite on `--ease-theatre`. Suppressed under `prefers-reduced-motion`.
- No tooltips, no axes, `YAxis hide` with padded domain as today.

### 4.5 `SessionClock` — `components/ledger/session-clock.tsx`

Isolated ticking clock so the 1-second interval doesn't re-render its parent tree.

```ts
type SessionClockProps = { startedAt: string /* ISO */; render?: (formatted: string) => ReactNode }
```

Owns its own `useState` + `setInterval(1000)`; formats `m:ss` (`h:mm:ss` past 60m). Default render: StatUnit-sm numeral text. **This component is the only thing that re-renders per second.**

### 4.6 Control style (rule, not a component)

Every pressable control: `background: var(--ink-02); border: 1px solid var(--ink-08); border-radius: var(--radius-flat);` text in body face or `--font-label`, `--ink-70` at rest. States change **ink only**: hover/active → bg `--ink-04`/`--ink-06`, border `--ink-12`, text `--ink-95`. Disabled → text `--ink-30`, same geometry. **A control never changes padding, border-radius, or from borderless→bordered between states.**

---

## 5. Motion doctrine

- **Entry:** top-level sections rise in sequence on mount — `opacity 0→1`, `translateY(8px)→0`, 500ms `--ease-theatre`, 60–80ms stagger. Once per mount, not per state change.
- **One live thing:** at most one permanently-animating element per screen. Home: the week sparkline's endpoint pulse. Session: the rest dock's breathing dot while resting (plus the existing ≤10s urgency pulse); when not resting, the current-set edge is static.
- **Interactions:** ink transitions at `--duration-fast`/`--duration-base`. No scale/size morphs.
- **Always** honor `prefers-reduced-motion: reduce` (entry renders final state; pulses off).

---

## 6. Execution order

1. **PR 1:** `components/ledger/*` (this file) — components only, no screen changes.
2. **PR 2:** Home screen (`01-home-screen-spec.md`).
3. **PR 3:** Active workout, visual pass (`02-active-workout-spec.md` §A).
4. **PR 4:** Active workout, navigation/perf pass (`02-active-workout-spec.md` §B). Keep separate — it's behavioral and needs its own QA.

Verify each PR with `npm run build`, `npm run lint`, and `npm run test:e2e` (Playwright auto-starts dev on :3001). Existing e2e specs assert on text content — expect to update assertions where labels change (e.g. `PROGRESS` → `THIS WEEK`); grep `tests/` for the old strings.
