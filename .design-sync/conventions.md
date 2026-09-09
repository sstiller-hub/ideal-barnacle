# Building with this design system

A workout-logging system with a **terminal/industrial** aesthetic: pure black
canvas, white ink, near-zero chroma. Colour appears only as signal — green when
something was *earned*, amber when something needs attention. Nothing else is
coloured.

## Wrap every design in `AppFrame`

Components are white-on-black. Rendered on a light surface they are invisible.
`AppFrame` supplies the canvas, the foreground colour and the sans stack — it is
the design-system equivalent of the app's root layout.

```jsx
<AppFrame>
  <BandHeader label="THIS WEEK">
    <DeltaChip tone="good" arrow="up" value="+2.4K" pct="12%" context="WK/WK" />
  </BandHeader>
  <StatUnit value="72.4K" unit="LB" label="VOLUME · WK OF MAR 3" />
  <Sparkline data={[48200, 52400, 57800, 64900, 72400]} height={56} live domainPadding={5000} />
</AppFrame>
```

Without it you get black text on a white page and the design reads as broken.

## Styling idiom: Tailwind utilities over a token theme

Style with utility classes. Do **not** invent hex values or new colour names —
the palette below is the whole vocabulary, and it is what ships in the
stylesheet.

| Family | Real class names | Use for |
|---|---|---|
| Canvas | `bg-background` `text-foreground` `bg-card` `bg-popover` `bg-secondary` `bg-muted` `text-muted-foreground` | page and panel surfaces |
| Ink scale | `text-ink-95` `text-ink-90` `text-ink-85` `text-ink-70` `text-ink-50` `text-ink-40` `text-ink-35` `text-ink-30` `text-ink-25` `text-ink-20` (also `bg-ink-*` and `border-ink-*` at `15 12 08 06 04 02`) | **the main tool.** White at an alpha. Body text `text-ink-70`, labels `text-ink-35`, hairlines `border-ink-08`, raised fills `bg-ink-04` |
| Earned (green) | `text-good` `bg-good-tint` `text-good-ink` `border-good` | a PR, a beaten session, an upward trend — **only** when the athlete beat something |
| Attention (amber) | `text-warn` `bg-warn-tint` `text-warn-ink` `border-warn` | flags, deload notices, actionable state |
| Type roles | `font-sans` (Geist, UI) · `font-mono` (Geist Mono) · `font-display` (Bebas Neue — **every headline numeral**) · `font-label` (Archivo Narrow — tracked uppercase micro-labels) | |
| Display sizes | `text-marquee` (48px) `text-hero` (72px) `text-stage` (96px) | big numbers above the normal scale |
| Radius | `rounded-flat` (1px) `rounded-xs` `rounded-sm` `rounded-md` `rounded-lg` `rounded-xl` `rounded-2xl` | |
| Glow | `shadow-glow-good` `shadow-glow-warn` `shadow-glow-warn-soft` | "earned light" on signal indicators — use sparingly |
| Easing | `ease-theatre` | the house curve |

Durations are CSS variables, not utilities — use
`style={{ transitionDuration: 'var(--duration-fast)' }}` with `--duration-fast`
(160ms), `--duration-base` (200ms), `--duration-slow` (300ms), `--duration-entry`
(400ms).

There is deliberately **no "bad" tone.** Declines and misses are neutral
(`text-ink-40`, `bg-ink-04`) — the app records, it does not judge. Reach for
`destructive` only for genuinely destructive actions.

### House voice

- Micro-labels are uppercase, tracked, `font-label`, tiny (8–10px), `text-ink-35`:
  `VOLUME`, `SESSIONS`, `WK/WK`, `LAST UPPER · TO BEAT`.
- Headline numerals are `font-display` with tabular figures and a small inline
  unit — that is `StatUnit`'s whole job, so use `StatUnit` rather than
  hand-rolling one.
- `Button` labels are tracked all-caps by default. For a long or sentence-case
  label pass `uppercase={false}`.

## Where the truth lives

- `_ds/<folder>/styles.css` and its `@import`s — the real tokens and every
  utility that exists. Read it before inventing a class.
- `components/<group>/<Name>/<Name>.d.ts` — the prop contract.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage.

## The pieces

- **general** — `Button`, `Badge`, `Input`, `Card`, `AlertDialog`,
  `AktIndicatorChip`, `AktProgramMessageLine`, `VolumeControls`,
  `ExerciseCardPreview`
- **ledger** — `StatUnit`, `DeltaChip`, `BandHeader`, `Sparkline`,
  `SessionClock`. This is the house style for presenting numbers; a section is
  a `BandHeader` (label + hairline + a right-slot `DeltaChip`) over `StatUnit`s
  and a `Sparkline`.
- **whoop** — `SetRow`, `TranscriptionHeader` for the set-logging flow.

`Card` composes with `CardHeader`, `CardTitle`, `CardDescription`,
`CardAction`, `CardContent`, `CardFooter`. `AlertDialog` composes with
`AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`,
`AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`,
`AlertDialogCancel`.
