# Design audit — the logging loop

**Date:** 2026-10-02 · **Scope:** everything between "I'm at the gym" and "the session is on the record": Home → Start → session (log set, rest, next exercise) → Finish → summary.
**Lens:** speed (fewest actions per set), accuracy (the record says what happened), access (every control reachable with one thumb, a bar in the other hand, at arm's length), and the "feels native" delight the iOS pass started.
**Method:** code read of `components/workout-session.tsx`, `app/page.tsx`, `app/workout/session/page.tsx`, `app/workout-summary/page.tsx`, `lib/session-feedback.ts`, `lib/set-validation.ts`; Playwright at iPhone 15 Pro size (393 × 852 standalone, 393 × 659 in a Safari tab) with seeded history, 19 screens captured; DOM sweep for sub-44pt targets and sub-11px text; pixel sampling of the device screenshot.

Fixed in the same PR as this audit: **B1** (the status-bar smear) and **B2** (the zero-delta chip). Fixed in the follow-up (`fix/logging-loop-p0s`): **A1** and **A6** (END HERE / SKIP EXERCISE / UNDO / + SET under the set list), and **A2** (the overload rewrite is removed). Fixed in `fix/keyboard-accessory-bar`: **C1 + C2** (the keyboard accessory bar). Everything else is a recommendation, ranked.

---

## What already works, and should be protected

- **Two taps from launch to a logged set.** Home pins *Start workout*; the session opens on exercise 1 with every set prefilled from the last performance (or the progressive-overload step); the check logs it. Nothing in this audit should add a step to that path.
- **One live set.** Fixed row geometry, the white left edge, `NOW`, and the rail mean the eye never hunts. Completing a set drops the keyboard and does not auto-focus the next field, which is right: the next move is to rest, not to type.
- **The rest capsule** is a single row, 50pt circles, one-tap skip, counts down, leaves on its own, and chimes + buzzes at zero (with the iOS switch-haptic workaround for taps).
- **Auto-advance** after the last set of an exercise.
- **Resilience:** session survives cold start, rotation, backgrounding; the carousel no longer drifts; sets autosave on every keystroke.
- **Exit is cheap and safe.** Back pauses, Home shows *Resume workout*, nothing is lost.

---

## Findings

Severity: **P0** = data goes wrong or a thing cannot be done · **P1** = costs taps/seconds every workout or hides something important · **P2** = polish and consistency.

### A. Accuracy — the record must say what happened

| # | Finding | Where | Sev |
|---|---|---|---|
| A1 | **Finish is blocked until every set of every exercise is checked.** `canFinishWorkout` requires all sets `completed`; sets are prefilled with weight and reps, so they are never "ghost" sets that the finish path would trim. There is no *skip exercise*, *remove set*, or *end here* affordance. The only way out when a machine is taken or you stop early is to check sets you did not do, which puts fake volume on the record and seeds next session's prefill with it. Contradicts `docs/index.md` ("missing data remains missing"). | `workout-session.tsx` `canExerciseBeFinished`, `finishWorkout` | **P0** |
| A2 | **`PROGRESSIVE OVERLOAD ↑` wipes the sets you just logged.** It appears once every set hits the top of the rep range, and tapping it rewrites *this session's* sets to `completed: false` at +5 lb / low reps. The toast says "+5 lbs applied". The logged exercise is gone from the session until re-checked. Progressive autofill already seeds next time from history, so the button has no safe job left. | `handleApplyProgressiveOverload` | **P0** |
| A3 | **`MATCHED` / `+5 LB` chips show on sets that have not happened.** The chip is computed whenever weight and reps are numbers, and every set is prefilled, so an untouched future set already claims "MATCHED". The spec (02 §A4) says chips render only for completed sets. Accurate reading: *LAST 90 × 8* alone until the check is tapped. | `ExercisePage` `chip` | **P1** |
| A4 | **The rating prompt is unreachable in the normal flow.** `HOW DID THIS FEEL?` mounts on the exercise page you just finished, but completing the last set auto-advances to the next exercise. It is only seen by swiping back. Ratings will be mostly empty. Options: ask inside the rest capsule for the final set's rest, or collect all ratings on the Finish step. | `ExercisePage` rating block, `completeSet` auto-advance | **P1** |
| A5 | **Rest length is a hidden notes convention.** `extractRestSeconds` parses "Rest 2m" out of the exercise notes; anything else is 90 s. Nothing in the routine editor or the session shows or edits it. The ±30 taps are not remembered. Expose rest as a per-exercise field and remember the last adjusted value per exercise. | `extractRestSeconds` | **P2** |
| A6 | **No way to add a set.** Felt good, want a fifth set: not possible without editing the routine. Add a quiet `+ SET` row at the end of the list (becomes the current set). | `ExercisePage` | **P1** |
| A7 | **Rep cap error text uses the generic grey.** "Reps cannot exceed 40" is the only hard-invalid state and reads like a hint. Use `--warn-ink`. | `ExercisePage` error line | **P2** |

### B. Chrome and surfaces

| # | Finding | Where | Sev |
|---|---|---|---|
| B1 | **Grey smear under the status bar** (the reported bug). Three screens painted `inset 0 0 200px rgba(255,255,255,0.02)` on the page; the device screenshot samples at 1–4/255 across the top 100pt and both side edges, which an OLED renders as a lit halo, and iOS 26's status-bar softening spreads it. The #116 header offset could not fix it because the glow is on the page, not the header. **Fixed:** vignette removed from Home, the session loading states, and the session screen; every captured screen now samples 0,0,0 at the top edge. | `app/page.tsx`, `app/workout/session/page.tsx`, `components/workout-session.tsx` | **P1** |
| B2 | **Completed day chip read "↓ 0 0%" on an exact match.** Arrow was `delta > 0 ? up : down`. **Fixed:** no arrow and `MATCHED` when the delta is zero. | `app/page.tsx` | **P2** |
| B3 | **The set column never scrolls.** The pager is `overflow-y: hidden` and each page is a fixed-height column. On the 852pt standalone viewport, five sets fit only with the plate panel closed; five sets + plates, six sets, a deload badge, or a coach note push the last set off-screen with no gesture that reaches it (verified: wheel and touch gestures leave `scrollTop` at 0). In a Safari tab (659pt) a four-set exercise with plates already clips set 4. Tried and reverted twice: `overflow-y: auto` on each page (nested scroller) fails the carousel wheel-swipe spec every time, and on the pager itself makes it flaky, so any vertical axis needs the pager's index logic re-examined alongside it, or the plate panel capped instead. | `workout-session.tsx` pager, `ExercisePage` | **P1** |
| B4 | **Plate math defaults on for every exercise.** Cable rows, machines and dumbbell work open with a `Per side ▾ · BAR [ ]` chrome and a "45 per side" readout that means nothing for them, costing ~250pt of the column (and feeding B3). The visibility preference is per exercise but the default is `true`. Default on only for barbell-named exercises; everything else off until the user opens it. Also: the BAR field is blank at 0 — give it a placeholder (`45`) and a per-exercise default. | `showPlateCalc` init, `isMachineExercise` | **P1** |
| B5 | **The progress rail disappears.** Non-current segments are `--ink-10` at 3pt tall on pure black: on the eight-exercise session only the current segment is visible, so "where am I in the workout" is answered by the `1 OF 8` eyebrow alone. Raise the base to `--ink-25` and completed to `--ink-50`. | rail `baseColor` | **P2** |
| B6 | **Completed-day stats are clipped on 393pt phones.** At initial scroll the VOLUME / EXERCISES / DURATION / BEATEN numerals sit exactly under the pinned *View session* ground (visible on the 440pt Pro Max of the report screenshot, hidden on a 15/16/17 Pro). Shrink the calendar row pitch or let the pinned ground fade start lower; the stats are the point of a completed day. | `app/page.tsx` day band | **P1** |

### C. Speed — taps per set

| # | Finding | Where | Sev |
|---|---|---|---|
| C1 | **iOS has no Done key on the number pad.** Both inputs use `inputMode="numeric"/"decimal"`, which on iPhone shows the bare keypad: no return key, so `enterKeyHint`, the Enter→reps hand-off, and Enter→complete-set never exist on the device this app ships to. Changing a number is: tap field, type, tap outside to drop the keyboard (or hunt for the check behind it), tap check. Add a keyboard accessory bar (fixed to `visualViewport` bottom while a set field is focused) with **−5 / +5 · −1 / +1 · NEXT · LOG SET** so the correction and the commit happen above the keypad. This is the single biggest speed win available. | `ExercisePage` inputs | **P1** |
| C2 | **Steppers were removed wholesale.** #97 added ± on every set; #105 removed them ("the set steppers are gone", no rationale). The accessory bar in C1 brings the ± back only where they matter (the focused field) without the clutter. If C1 is too big, a pair of ±5 / ±1 ghost buttons under the *current* set only is the fallback. | — | **P1** |
| C3 | **Tapping the rail pops the keyboard.** `focusIntentRef` is set for rail taps, so glancing at exercise 5 to see what's next focuses its weight field. Browsing is not logging: only set-completion advances should carry focus intent (and today those deliberately don't). Drop the ref write from the rail handler. | rail `onClick` | **P2** |
| C4 | **Notification permission is requested mid-set.** The first rest of a workout calls `Notification.requestPermission()`, so the OS sheet lands right after the first check. Ask from Settings ("Rest alerts") or on the first *Start workout* tap. | `scheduleRestNotification` | **P2** |
| C5 | **Haptic fires after the save, not on the tap.** `haptic("logged")` runs after `await saveSession(...)`; the iOS switch trick needs user activation, which can lapse past an await. Move the haptic to the top of `completeSet` (next to `primeRestChime()`), before the first await. Verify on device. | `completeSet` | **P2** |
| C6 | **Last-set-of-workout: Finish is a 17px text link.** After the final check the only thing that changes is the word *Finish* going from `--ink-30` to white in the corner. That moment deserves the pinned 56pt white action from Home ("FINISH WORKOUT") so the loop closes with the same thumb that logged it. | header `Finish` | **P1** |

### D. Legibility and reach at arm's length

| # | Finding | Where | Sev |
|---|---|---|---|
| D1 | **The comparison line is the smallest text on the screen.** `LAST 90 × 8` is 8.5px; it is the number you read to decide whether to add weight. Session screen has 49 runs of 8px and 58 of 8.5px text. Raise the LAST line and chips to 11px, unit caps (LB/REPS) to 10px; keep the eyebrow at 9px. | `ExercisePage` meta line, `DeltaChip size="sm"` | **P1** |
| D2 | **Reorder handles are 26pt.** Drag handles in the sheet lack `.tap-target`; CANCEL / APPLY are 39pt tall. | `reorder-exercises-sheet.tsx` | **P2** |
| D3 | **Rating buttons are 36pt.** ROUGH / GOOD need `.tap-target` or 44pt height. | `ExercisePage` rating | **P2** |
| D4 | **Inputs have no accessible names.** Weight/reps fields announce as "number". Add `aria-label="Set 2 weight, pounds"` / `"Set 2 reps"`. | `ExercisePage` inputs | **P2** |
| D5 | **The day label is a secret button.** `FRIDAY · OCT 2 · TODAY` is a 14pt-tall `<button>` (dev-mode trigger) announced to screen readers as a button with `cursor: default`. Make it a `<div>` with the dev gesture on `onPointerDown` counting, or hide it from AT. | `app/page.tsx` | **P2** |

### E. Delight and feel

| # | Finding | Sev |
|---|---|---|
| E1 | **Set completion has no visual moment.** The circle fills white instantly. A 120 ms scale-pop on the check (spring, reduced-motion aware) plus the row's left edge dimming would make the haptic and the pixel agree. | P2 |
| E2 | **PR moment is a chip.** "PR · 100 × 8" appears in the meta line at 8.5px. A personal record mid-workout is the app's best moment; give it a short full-width band under the row (`--good-tint`, 12px, 1.5 s, then settle to the chip). | P2 |
| E3 | **Rest capsule could carry the next set.** #105 removed the up-next panel because it mirrored the row behind it. A single line `NEXT · 95 × 8` in the capsule's label slot (no controls) keeps the glance without the duplication, especially once B3 lets the row scroll out of view. | P2 |
| E4 | **Session summary opens flat.** Four stats and a list. Lead with the one line that matters (`+1.0K vs last Upper · 6/8 beat`) as the title-row meta, the way Home does. | P2 |

---

## Recommended order

1. **A1 + A6** — *End exercise here* / *remove set* / *add set* (one PR; unblocks honest finishes).
2. **A2** — remove `PROGRESSIVE OVERLOAD ↑` (or make it write a next-time target only).
3. **C1** — keyboard accessory bar with ± and LOG SET.
4. **B3 + B4** — scrollable set column, plate panel off by default for non-barbell work.
5. **A3, A4, C6, D1** — truthful chips, reachable rating, pinned Finish, legible LAST line.
6. **B5, B6, C3, C4, C5, D2–D5** — polish pass.
7. **E1–E4** when the above has settled.

## Measurements

| Screen (393 × 852) | Sub-44pt targets without `.tap-target` | 8–8.5px text runs |
|---|---|---|
| Home, completed day | 1 (day label button) | 12 |
| Home, scheduled | 1 | 14 |
| Session, 4 sets, plates open | 2 (Per side chip 30pt, BAR 40pt) | 107 |
| Session, rating prompt | 2 (ROUGH, GOOD 36pt) | 30 |
| Reorder sheet | 10 (8 handles 26pt, 2 buttons 39pt) | — |
| Summary | 1 (Copy 42 × 44) | 1 |

Top-edge pixel sample after the fix, every screen: `0,0,0` at y = 2, 20, 60, 120, 200 (before: 1–4 across the top 200 px of the device capture).
