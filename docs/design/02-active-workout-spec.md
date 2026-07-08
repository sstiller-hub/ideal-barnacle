# Active Workout Redesign — "One lane, one live set"

**Target:** `components/workout-session.tsx` (portrait layout; see §C for landscape). Shared components from `docs/design/00-ledger-design-language.md` must exist first.
**Mockup:** https://claude.ai/code/artifact/a2a495a2-afbd-46ef-916d-24409c0d5948

**Ship as two PRs:** §A (visual system) and §B (navigation + perf). They touch overlapping lines but have different risk profiles.

**Scope guard — what does NOT change:** all data flow (autosave storage, Supabase set sync/realtime, `completeSet`, `updateSetDataForExercise`, validation + rep-cap logic, rest state/notifications, machine-seat persistence, plate math, exercise ratings, progressive-overload apply, reorder sheet, finish flow), the carousel *mechanism* (horizontal scroll-snap, one page per exercise), and the big-input ergonomics — weight/reps stay huge, centered, thumb-first.

---

## A. Visual system

### A1. Top bar (~lines 2432–2540)

Current: back arrow · VOLUME/SETS mini-stats (6px labels) · FINISH that morphs from bare text into a white 5px-radius pill when enabled · dots row · reorder icon.

New:

```
[←]        2:32      1.2K LB      1 / 24        [FINISH]
           TIME      VOLUME       SETS
[========|——————|——————|——————|——————|——————|——————|——————]  [reorder]
```

- **Three `StatUnit size="sm"`** centered, `gap: 18px`: TIME (rendered by `SessionClock` — see §B3), VOLUME (k-formatted `totalVolume`), SETS (`{done} / {total}` with `/ {total}` as the unit segment). This moves the session clock out of the exercise eyebrow — it times the session, not "exercise 1".
- **FINISH** (~2472–2491): one fixed form forever — §4.6 control style, `--font-label` 10px 600 0.12em, padding 7px 12px, `--radius-flat`. Disabled: text `--ink-30`. Enabled: text `--ink-95`, bg `--ink-06`, border `--ink-12`. **Delete the white-pill morph (background/borderRadius/padding switching on `canFinishWorkout`).** Handler unchanged.

### A2. Segmented progress rail (replaces the dots row, ~2494–2528)

One segment per exercise, replacing dots + (together with A3) the `NOW: SET x/y` line — the four progress vocabularies become one instrument.

- Container: `flex; gap: 3px; flex: 1` with the reorder button (unchanged behavior) to its right.
- Segment: `flex: 1; height: 3px; border-radius: 1px; background: var(--ink-10)`; completed exercise (every set completed & `!isSetIncomplete`) → `--ink-35`; **partial fill**: inner absolutely-positioned bar, width = `completedEligibleSets / totalSets * 100%`, background `rgba(255,255,255,.65)`.
- Current exercise (`uiExerciseIndex`): fill/base one ladder step brighter (`.85` / `--ink-15`).
- Tap target: wrap each segment in a button with `padding: 12px 0` (invisible hit area ≥ 24px tall; the 3px bar is the visual). `onClick={() => setExerciseIndex(i)}` (existing fn). `aria-label="Exercise {i+1} of {n}: {name}, {done} of {total} sets"`.
- Keep the centered 200px gradient divider below, or drop it — the rail now separates header from lane; prefer dropping.

### A3. Exercise page header (~2579–2695)

- Eyebrow: `EXERCISE {i+1} OF {n}` (§3 eyebrow type). **Remove `• {formatSeconds(elapsedSeconds)}`** (clock moved to top bar — this is also the perf keystone, §B3).
- Right tools: seat input and PLATES toggle become §4.6 controls (`--font-label` 8px 600 0.1em, padding 4px 9px, `--radius-flat`, `--ink-35` / active `--ink-85` + bg `--ink-06`). Same behaviors; PLATES active state = ink only.
- Title: Bebas 40px `--ink-95`, unchanged tap → exercise page.
- Meta line replaces the two current lines (`TARGET…` + `N SETS • NOW: SET x/y`): one line, `--font-label` 9px 500 0.14em `--ink-30`: `3 SETS · TARGET 8–10 REPS · NOW SET 2` with `NOW SET 2` at `--ink-50` 600. Omit the NOW fragment when the exercise is complete.
- Deload badge: keep, restyle to §4.6 surface + §3 label.

### A4. Set rows — fixed geometry (~2697–2998)

**The rule: a set row is born at its final geometry and only its ink changes.** Delete the per-state size logic: `isCompactCompleted`, `isCompressedCompletedSet`, and every ternary they feed (padding 18→12→5, font 28→22→16, checkbox 36→30, label margins). Density may vary **per exercise** (by set count) but never per set state.

Row anatomy (per set):

```
| SET 01                                    NOW?
| [  195  ]   [   6   ]   [ ✓ ]
|    LB          REPS
| LAST 195 × 6   [chip]
```

- **State edge:** 2px left border on the row (`padding-left: 14px`): current set → `rgba(255,255,255,.8)`; all others → `--ink-06`. This replaces size-as-state.
- **Label row:** `SET 01` (`--font-label` 8.5px 600 0.18em, `--ink-30`; current set `--ink-60`); current set also gets right-aligned `NOW` tag (7.5px 600 0.18em `--ink-50`).
- **Grid:** `grid-template-columns: 1fr 1fr 44px; gap: 12px`.
- **Inputs:** keep `<input type=number>` with all existing handlers/refs/focus logic. Fixed style: padding 15px 8px (12px 8px when exercise has ≥4 sets — the one density switch), font 26px (22px ≥4 sets) 600, tabular, `--radius-flat`, `text-align: center`. Ink by state: current/pending-editable value `--ink-95`; completed `--ink-40` on bg `--ink-02`; future sets (index > active, prefilled from last time, not yet logged) `--ink-50` on `--ink-02` — *proposed, not logged*. Current set inputs get `border: 1px solid var(--ink-12)` (others transparent border of same width — border is always present so geometry never shifts). Focus: border `--ink-20`, bg `--ink-06`. Validation-error border: `--ink-40` (unchanged semantics).
- **Units:** `LB` / `REPS` caps under each input, one size (7.5px 600 0.14em `--ink-25`), focus tint to `--ink-50` as today.
- **Check button:** fixed 44px × (input height) — full-height column, easier to hit than today's 36px square. Completed: bg `--ink-06`, check icon `--ink-85`. Incomplete: bg `--ink-02`, border `--ink-08`, 12px empty square inside. Disabled affordance stays opacity-based but never resizes. Handlers unchanged.
- **Meta line (fixed slot):** always rendered with `min-height: 18px` so appearing content doesn't reflow. Content: `LAST 195 × 6` (`--font-label` 8.5px 500 0.1em `--ink-25` tabular, from existing `lastSet`) + `DeltaChip size="sm"` mapped from existing `getSetComparison(...).status`:

| comparison.status | Chip |
|---|---|
| `pr` | `tone=good value="PR · {w} × {r}"` |
| `progressed` | `tone=good arrow=up value="+{Δw} LB"` (or `+{Δr} REPS` when weight equal) |
| `matched` | `tone=neutral value="MATCHED"` |
| `recovery` | `tone=neutral value="RECOVERY"` |
| `no-history` | no chip |

Chip renders only for completed sets (today's gate `set.completed`-ish logic stays); the raw `comparison.message` strings and their four hand-tuned grays are deleted.

- **Error line** (rep cap / missing): keep, retype to 9px `--ink-40`, inside the fixed meta slot.
- **Plate calculator:** logic and **plate colors stay exactly as-is** (they encode real iron — the one place chroma is earned by physics). Restyle only the PER SIDE/TOTAL + BAR chrome to §4.6 controls.

### A5. Rest dock (~2316–2430) and post-exercise elements

- Dock keeps `fixed` bottom positioning, framer-motion enter/exit, +30s / SKIP handlers, notification scheduling, and the ≤10s pulse. Restyle: bg `rgba(13,13,15,0.92)`, border `1px solid var(--ink-12)` (`--ink-35` in the ≤10s state, as today), **`border-radius: var(--radius-xs)`** (kills the 14px), padding 10px 14px.
- Left: `REST` cap (`--font-label` 8px 600 0.18em `--ink-35`) with a 4px **breathing dot** before it (`opacity .4↔1`, 2.4s ease-in-out infinite — the screen's "one live thing" while resting; disabled under reduced-motion) + Bebas 38px clock. Keep the rest-extension trend line if present, retyped to 7.5px `--ink-25` (bump from 7px).
- Buttons: `+30S` quiet / `SKIP` loud, both §4.6 controls at `--font-label` 9.5px 600, `--radius-flat`.
- Rating prompt (`HOW DID THIS FEEL?`), rating-confirmed row, and `PROGRESSIVE OVERLOAD ↑` button: behaviors unchanged; restyle buttons to §4.6 (radius 3px → `--radius-flat`), labels to §3 sizes (min 8px), drop the glow `box-shadow` on progressive overload.

### A6. Radius/type sweep

After A1–A5, grep the file for `borderRadius: "2px|3px|5px|8px|14px"` and `fontSize: "6px|7px"` — every remaining hit becomes a token radius / ≥8px label per §3. (The shadcn AlertDialog and ReorderExercisesSheet are out of scope.)

---

## B. Navigation & performance ("swiping is not loading")

### B1. Never dim the destination (~2575)

Delete `opacity: exerciseIndex === currentExerciseIndex ? 1 : 0.3` and its transition on the page wrapper. All pages render at full ink. The current-page signal is the rail (A2) + the page's own `NOW` edge. If a distinction is wanted at all, non-current pages may sit at `opacity: 0.85` — never lower, and with no transition tied to index commit.

Note: `canEditExercise` currently allows editing only current-or-earlier exercises; keep the *logic* but express disabled state per A4 ink (future sets already read as proposed at `--ink-50`), not page-level dimming.

### B2. Commit the index on `scrollend`

Today `handleScroll` debounces via `scrollSettleTimeoutRef` and the smooth-scroll flag `isScrollingProgrammatically` blocks for a fixed 400ms — the source of the "wakes up late" feel.

- Prefer the native event: `if ("onscrollend" in window)` attach `scrollend` on the container to compute + persist the index (`Math.round(scrollLeft / offsetWidth)`); keep the existing scroll-settle debounce **as the fallback branch only** (older iOS Safari has no `scrollend`).
- Update `uiExerciseIndex` optimistically during scroll (cheap, from `handleScroll`) so the rail highlights *while* swiping; persist `currentExerciseIndex` (storage write) only on scrollend/settle. These are already two separate state values — use them as UI-fast/persist-slow.
- Keep all the orientation-change restore logic (`hasInitialScrollRef` / RAF retries) — it guards a real bug; just make sure the new listener respects `isOrientationChangingRef` the same way `handleScroll` does.

### B3. Isolate the clock; memoize the pages

- Replace the `elapsedSeconds` state + interval effect (~1017–1027) with the shared `SessionClock` component in the top bar (A1). **No other component may re-render on the second tick.** Remove `elapsedSeconds` from the exercise page render (A3 already removed its display).
- Extract the per-exercise page (the body of the `exercises.map` in the carousel) into a module-level `ExercisePage` component wrapped in `React.memo`, with an explicit props object (exercise, exerciseIndex, currentExerciseIndex, activeSetIndex, handlers…). Handlers passed in must be `useCallback`-stable. Acceptance: with React DevTools Profiler recording, letting the clock tick for 10s while idle produces **zero** `ExercisePage` renders.

### B4. Keyboard only on intent

The auto-focus effect (~1029–1049) fires on every `currentExerciseIndex` change — swiping can pop the keyboard. Gate it: focus+select only when the index change originated from an explicit action (completing a set, tapping a rail segment / Start), not from a swipe. Implementation: set a `focusIntentRef.current = true` in `completeSet`/`setExerciseIndex`(tap path) and require+consume it in the effect. Swipe-driven index commits never focus.

### B5. QA checklist (§B PR)

1. Swipe left/right: the incoming page is full-ink during the drag; rail current-segment updates during the swipe; no post-snap "pop".
2. Complete a set mid-list: nothing below the tapped row moves (compare `getBoundingClientRect` of the next row before/after — delta 0).
3. Complete all sets → auto-advance still works; rest dock appears; keyboard does not appear after a swipe, does appear after set-complete advance (existing behavior).
4. Rotate landscape↔portrait: carousel restores to the same exercise (regression: the RAF-restore path).
5. Kill/reopen mid-workout: session restores to persisted exercise (persist-on-scrollend didn't lose writes).
6. Profiler: clock tick renders only `SessionClock`.
7. `npm run test:e2e` passes (update any text assertions on `VOLUME 0 / SETS 0/24` layout or `NOW: SET` strings).

---

## C. Landscape mobile

The landscape layout (`isLandscapeMobile` branch, ~1965–2300) keeps its structure this pass. Required only: token/ink sweep where it shares styles, the FINISH fixed-form rule, `DeltaChip` for its comparison hints if trivially swappable, and it must keep compiling + passing the orientation QA above. A full landscape ledger pass is explicitly out of scope.
