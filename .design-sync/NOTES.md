# design-sync notes — ideal-barnacle

Repo-specific gotchas for future syncs. Read this before re-running.

## This repo is an app, not a component package

There is no `dist/`, no published package, and no Storybook. The design-system
surface is defined by a hand-written barrel, **`.design-sync/entry.tsx`**
(committed):

- It is the `cfg.entry`. `PKG_DIR` resolves to the repo root by walking up from
  it to `package.json`, which is what makes `srcDir`/`tsconfig` resolve.
- **Four components use `export default`** (`AktIndicatorChip`,
  `AktProgramMessageLine`, `SetRow`, `TranscriptionHeader`). A synthesized entry
  emits `export * from ...`, which does **not** re-export defaults — they would
  silently vanish from the bundle. The barrel names them explicitly. Keep it that
  way when adding components.
- It also exports **`AppFrame`**, the preview/root wrapper (see below). That is
  setup, not a component reimplementation.
- Scope is deliberate: data-wired screens (`WorkoutSession`,
  `TranscriptionSession`, `WorkoutScheduleEditor`, the alerts sheets, providers)
  are excluded — they read Supabase and app hooks and cannot render standalone.

`cfg.componentSrcMap` enumerates all 16 components explicitly. With an explicit
`--entry` there is no synth-entry fallback, so discovery relies on this map plus
the generated `.d.ts` tree — a new component needs an entry in **both** the
barrel and `componentSrcMap`.

## Tailwind v4 must be compiled first

`app/globals.css` is Tailwind *source* (`@import "tailwindcss"`), not CSS.
Pointing `cfg.cssEntry` at it ships an unstyled bundle. The build step
(`cfg.buildCmd`) compiles `.ds-sync/tw-input.css` → `.ds-sync/tailwind.css`,
which is what `cssEntry` points at. **Run it before every `package-build.mjs`.**

`.ds-sync/tw-input.css` does three things beyond importing `globals.css`:

1. Adds Google Fonts `@import`s for **Geist / Geist Mono**. The app loads these
   via `next/font` in `app/layout.tsx`, so they are absent from any bundle built
   from source — without this every design falls back to a system font. Same
   family, web-served instead of self-hosted.
2. `@source` directives so the scan reaches `components/`, `app/` and the
   authored previews.
3. **`@source inline(...)` safelists.** Tailwind only emits classes it sees
   *used*. The design agent composes its own layout glue from the token
   vocabulary, so the full `ink-*`, `good/warn`, `font-*`, radius, glow and
   display-size families are force-generated. Without this, documented classes
   like `bg-ink-04` and `font-display` do not exist in the shipped CSS and the
   agent's markup silently renders unstyled. **If you add a token family to
   `globals.css`, add it to the safelist too.**

Known non-class tokens: `--duration-fast/base/slow/entry` do **not** produce
`duration-*` utilities (Tailwind v4 reads `--transition-duration-*` for that).
`conventions.md` documents them as CSS variables. Don't "fix" this by adding
them to the safelist — the utilities won't generate.

## Prop contracts need generated declarations

`findTypesRoot` checks `build/ts`, `dist/types`, `types`, `lib`, `dist` in that
order. This repo has a `lib/` of plain utilities, so it matched `lib/`, parsed
**0** `.d.ts` files, and every emitted contract came out as
`[key: string]: unknown` — useless to the design agent.

Fix: `node node_modules/typescript/bin/tsc -p .ds-sync/tsconfig.dts.json` emits
declarations into `types/` (gitignored), which wins the lookup order over `lib/`.
**Re-run it whenever component props change**, before `package-build.mjs`.

Six components still need hand-written `cfg.dtsPropsFor` bodies because their
props come from `React.ComponentProps<'x'>` intersections or Radix roots that the
extractor flattens to nothing: `Badge`, `Input`, `Card`, `AlertDialog`,
`ExerciseCardPreview`, `VolumeControls`. Keep these in sync with source by hand.

## Preview cards force a white background

`lib/emit.mjs` bakes `<style>body{background:#fff}</style>` into every card. This
DS is white-on-black, so components rendered flat were invisible. `cfg.provider`
= `AppFrame` wraps every preview in the black canvas. Do not try to fix this by
editing `emit.mjs` — it's the app contract surface.

## Known render warns (triaged, expected)

- **`[FONT_REMOTE]`** for `Geist`, `Geist Fallback`, `Geist Mono`,
  `Geist Mono Fallback`, `Archivo Narrow`, `Bebas Neue`, `Impact` — correct.
  Most are served by Google Fonts via `@import` at runtime, by design. Not a
  `[FONT_MISSING]`. Two are easy to misread as new: **`Bebas Neue`** is imported
  by `app/globals.css:1` (Google Fonts) and **`Impact`** is only ever a *system*
  fallback inside the `--font-display` stack
  (`"Bebas Neue", "Impact", sans-serif`) — it is never meant to ship. Neither
  needs `extraFonts`.
- **`[GRID_OVERFLOW]`** was resolved by `cardMode: "column"` on
  `AktProgramMessageLine`, `Card`, `Input`, `BandHeader`, `Sparkline`, `SetRow`,
  `TranscriptionHeader` (their previews use fixed-width wrappers to show realistic
  layout). `AlertDialog` uses `cardMode: "single"` because it's an overlay.

## Re-sync risks — what can go stale

- **`types/` is generated and gitignored.** A fresh clone has no declarations
  until `tsc -p .ds-sync/tsconfig.dts.json` runs. Skipping it silently degrades
  every prop contract back to `[key: string]: unknown` — the build still exits 0,
  so nothing shouts. Always run it.
- **`.ds-sync/` is gitignored**, including `tw-input.css` and `tsconfig.dts.json`
  — both of which encode real decisions (font sources, the safelist, the
  declaration emit). On a fresh clone they must be recreated from this file. If
  that proves annoying, promote them into `.design-sync/`.
- **`cfg.dtsPropsFor` bodies are hand-copied** from source types. They will drift
  when those components' props change, and nothing detects it. Re-check the six
  listed above against source on each sync.
- **`AppFrame` lives in `.design-sync/entry.tsx`**, not in the app. If
  `app/layout.tsx` or `globals.css` change what the root supplies, update
  `AppFrame` to match or previews stop reflecting reality.
- **`SessionClock` renders a live ticking value** (`Date.now()`), so its
  screenshots differ every capture. Grades key on sources, not pixels, so this
  does not clear grades — don't chase it.
- **`ExerciseCardPreview` is a design study, not a reusable component.** It takes
  no props and renders its own annotated current/proposed/compact comparison in
  orange/green/purple — deliberately off-palette. Consider dropping it from the
  synced scope if the design agent starts imitating those colours.
- The bundle inlines **54 npm packages** (Radix, recharts, lucide). A major bump
  in any of them changes the bundle wholesale.
- **Styling drifts when unrelated app code changes.** `tw-input.css`'s `@source`
  directives scan all of `components/` and `app/`, so Tailwind's emitted utility
  set is a function of the *whole app*, not just the 16 synced components. A
  re-sync can therefore report `upload.styling: true` with
  `components: []` — every component byte-identical, only the stylesheet moved.
  That is expected, not a bug (seen 2026-09-12: a large `workout-session.tsx`
  rewrite shifted the CSS while all 16 components stayed unchanged). The
  `@source inline(...)` safelist is what stops this from *removing* documented
  token classes — which is exactly why it must stay in sync with `globals.css`.
  After any such delta, spot-check the token families with
  `sh .ds-sync/checkclasses.sh <classes…>` before uploading.
