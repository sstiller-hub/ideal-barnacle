# Execution Prompts — paste into Opus 4.8 Claude Code sessions

Two prompts, two sessions, run in order. Prompt 1 covers PR 1 + PR 2 from the execution order (shared components, then home). Prompt 2 covers PR 3 + PR 4 (session visual, then session behavior) — it assumes Prompt 1's work is merged or on the current branch.

Start each session on a branch cut from the branch containing `docs/design/` (or from `main` after PR #80 merges).

---

## Prompt 1 — Ledger components + Home screen

```
Read these two files completely before writing any code:

1. docs/design/00-ledger-design-language.md — the design doctrine, tokens, and shared component specs
2. docs/design/01-home-screen-spec.md — the home screen redesign spec

Then implement them as two commits on this branch:

COMMIT 1 — Shared components only (spec file 00, §4):
Create components/ledger/ with DeltaChip, StatUnit, BandHeader, Sparkline, and
SessionClock, exactly to the props and style specs in §4.1–4.5. Presentational
only — no data fetching, no screen changes in this commit. Match the codebase's
existing styling idiom (inline styles are prevalent). Use only the CSS custom
properties listed in §2 — no raw rgba() or hex literals except the two
explicitly permitted in the spec (the good-tint border and the Sparkline
white-alpha strokes).

COMMIT 2 — Home screen (spec file 01):
Rework app/page.tsx to the band-ladder layout. Honor the scope guard at the top
of the spec strictly: no changes to data derivation, hooks, handlers, navigation
targets, or information order — this is a re-skin of relationships, not a
rewrite. Work through sections 2–5 in order, then the deletions checklist in §6.

Non-negotiables:
- Every rule in 00 §1 (the doctrine) applies. In particular: no red/orange for
  declines, exactly one permanently-animated element (the week sparkline pulse),
  no element that changes size/shape/border-presence between states.
- Delete every #FF5733 / rgba(255,87,51,…) occurrence in app/page.tsx.
- Keep data-testid="pr-section" and the dev-mode 5-tap activator working.

Verification gate (must pass before you consider the task done):
- npm run build
- npm run lint
- npm run test:e2e — update text assertions that reference renamed labels
  (PROGRESS → THIS WEEK, PERSONAL RECORDS → ALL-TIME, View Details → View
  session); grep tests/ for the old strings, check tests/home-prs.spec.ts.
- Walk the acceptance criteria in 01 §7 one by one and state how each is met.

Do not touch components/workout-session.tsx or app/workout/session/page.tsx in
this session — that's a separate spec.
```

---

## Prompt 2 — Active workout (visual pass, then behavior pass)

```
Read these two files completely before writing any code:

1. docs/design/00-ledger-design-language.md — the design doctrine, tokens, and
   shared component specs (the components/ledger/ kit it describes already
   exists — use it, don't rebuild it)
2. docs/design/02-active-workout-spec.md — the active workout redesign spec

Then implement the spec as two commits on this branch:

COMMIT 1 — Visual pass (spec §A only):
Rework components/workout-session.tsx portrait UI: top bar (three StatUnit-sm
stats with SessionClock for time; FINISH becomes a fixed-form control with no
shape morph), segmented progress rail replacing the dots, exercise header
(merged meta line, clock removed from the header), fixed-geometry set rows
(delete the isCompactCompleted / isCompressedCompletedSet size morphs; state is
expressed through ink and the 2px left state-edge only), rest dock restyle, and
the radius/typography sweep. The plate calculator's chromatic plate colors are
explicitly kept verbatim. §C: landscape gets the token sweep only — no layout
changes there.

COMMIT 2 — Behavior/perf pass (spec §B only):
B1 remove the 0.3-opacity page dimming; B2 commit the exercise index on
scrollend (feature-detect "onscrollend" in window, keep the existing
settle-debounce as the fallback) with the optimistic uiExerciseIndex split;
B3 isolate the per-second clock via SessionClock and React.memo the exercise
page at module level; B4 gate the keyboard auto-focus behind explicit intent
(focusIntentRef) so swiping never pops the keyboard.

Non-negotiables:
- Every rule in 00 §1 applies. One live thing on this screen: the rest dock's
  breathing dot while resting (the ≤10s urgency pulse stays).
- Data layer, autosave, set-completion logic, rest timer logic, plate math, and
  the rating/progressive-overload flow are all untouched — this is presentation
  and render behavior only.
- No element may change size, padding, or border-presence as a result of state.

Verification gate (must pass before you consider the task done):
- npm run build && npm run lint && npm run test:e2e
- React DevTools Profiler (or a render-count probe): zero ExercisePage
  re-renders during 10 seconds of clock ticks while idle on one exercise.
- Manually walk the QA checklist in spec §B5 and report each item's result.

Do not touch app/page.tsx in this session.
```

---

## Notes

- Run at effort `xhigh` (Claude Code default for Opus 4.8). Give each prompt as
  the first message of a fresh session — don't split it across turns.
- If you'd rather ship four PRs than two, split each prompt at its commit
  boundary; the text within each COMMIT block is self-contained.
- Approved mockups for visual reference:
  - Home: https://claude.ai/code/artifact/4e24a822-ffe2-4fb6-96ff-3e7aaeac184b
  - Session: https://claude.ai/code/artifact/a2a495a2-afbd-46ef-916d-24409c0d5948
