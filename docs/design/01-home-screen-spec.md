# Home Screen Redesign — "One ledger, three horizons"

**Target:** `app/page.tsx` (the only file with layout changes; shared components from `docs/design/00-ledger-design-language.md` must exist first).
**Mockup:** https://claude.ai/code/artifact/4e24a822-ffe2-4fb6-96ff-3e7aaeac184b

**Scope guard — what does NOT change:** all data derivation (`loadDataForDate`, `loadHomeAnalytics`, `weeklyVolumes`, `todayPRs`, `lastSameWorkout`, `completedComparison`, `weeklyReview`, `nextWorkout`, `progression`, `prRows`), all interactions (workout picker on the title, day swipe, dev-mode 5-tap, Start/Resume/Discard, all `router.push` targets), the conflict dialog logic, deload banners' logic, and the information order: header → today → exercise list → weekly volume → PRs. This is a re-skin of relationships, not a rewrite.

---

## 1. Concept

The screen reads as a single ledger that zooms out: **TODAY → THIS WEEK → ALL-TIME**. Every band opens with the identical `BandHeader` (label + hairline + `DeltaChip`). Hierarchy comes from position on the ladder, not from font roulette.

---

## 2. Header (current code ~lines 1283–1435)

Current problems: the eyebrow always says `SCHEDULED` even when the day is completed (contradicts the "COMPLETED TODAY" card below); the weekday/date block on the right fights the marquee for width.

New structure:

```
TUESDAY  JUL 7 · TODAY                                   [gear]
UPPER ›                                        ● COMPLETE
```

- **Eyebrow row:** one line — weekday (`--ink-70`, bold weight of `--font-label`), date, and the relative label (`TODAY` / `TOMORROW` / `YESTERDAY` / `PAST` / `UPCOMING`) — 9px `--font-label` 600, 0.2em, `--ink-35` base. The existing `isToday/isTomorrow/isYesterday/isPastDay` helpers provide the label. **Delete the right-side date block entirely** (the `TODAY / Tuesday / Jul 7` column). The dev-mode 5-tap activator moves onto the eyebrow text.
- **Marquee row:** title stays Bebas 48–52px with the chevron + workout-picker behavior unchanged. Right-aligned on the same baseline: a **status mark** replacing the `SCHEDULED` word:
  - `completed` → 5px emerald dot (`--good`, `box-shadow: 0 0 6px rgba(52,211,153,.5)`) + `COMPLETE` (`--font-label` 9.5px 600 0.16em `--ink-50`).
  - `activeSession` → white dot with the existing pulse + `IN PROGRESS · {remainingSets} SETS LEFT` (from `activeSessionProgress`).
  - `scheduled` → `SCHEDULED`, no dot. `rest` → `REST DAY`, no dot.
- The workout picker dropdown behavior is unchanged; restyle its option pills to the §4.6 control style (they're close already — just swap raw rgba for tokens and keep `--radius-flat`).

---

## 3. Band 1 — TODAY

One flat band. **Delete the card-in-card**: the outer "COMPLETED TODAY" box (`~1668`), the nested "VS LAST" box (`~1720`), and the separate "LAST … TO BEAT" card (`~1611`) all merge into this band. No background box — the band sits flat on the ground; only controls have borders.

`BandHeader label="TODAY"` with the comparison chip in the right slot. Chip by state:

| State | Chip (right slot of TODAY header) | Source |
|---|---|---|
| completed, beat last | `tone=good arrow=up value="+0.7K" pct="2%" context="VS LAST UPPER · 1W"` | `completedComparison` (delta>0) |
| completed, below last | `tone=neutral arrow=down value="1.2K" pct="4%" context="VS LAST UPPER · 1W"` | `completedComparison` (delta≤0) |
| completed, no prior same routine | no chip | `completedComparison === null` |
| scheduled / activeSession | `tone=neutral value="{vol}K" context="LAST UPPER · TO BEAT · {rel date}"` — tappable → `/history/{lastSameWorkout.id}` | `lastSameWorkout` |
| rest | no chip | |

Context strings use the existing `deriveWorkoutType` + `getRelativeDate` values. Chip `context` abbreviations: `1W`, `3D`, `TODAY`.

### 3.1 Stats row (completed state)

Three `StatUnit`s in a flex row, `gap: 28px`, baseline-aligned:

- `value=30.6K unit=LB label=VOLUME` — from `workoutForDate.stats.totalVolume`, formatted `X.XK` ≥1000 else integer. **Use this same k-formatter everywhere on the screen** (extract one helper; today there are three).
- `value=9 label=EXERCISES`
- `value=3 unit="OF 8" label="LIFTS BEATEN"` — from `completedComparison.beaten/compared`; omit when null.

For **scheduled/activeSession**: `value={exercises} label=EXERCISES`, `value={totalSets} label=SETS PLANNED`, and for activeSession `value={remaining} label=SETS LEFT`.

### 3.2 Exercise receipt (all states with a list)

Keep the existing rows, retyped: number as two digits (`01`…`09`, 8.5px 500 `--ink-30` tabular, min-width 14px), name 11px `--ink-85`, right column unchanged in content (`4 sets`, or `3 × 8-10` + `last 195×6` hint) at 8.5px `--ink-35` tabular. Row padding-y 4.5px. Keep the ≥9-exercises compact density but express it as one smaller row padding, **not** smaller fonts.

### 3.3 Controls

- completed: full-width `View session` control (§4.6 style) → `/history/{id}` (replaces "View Details").
- scheduled: `Start Workout`; activeSession: `Resume Workout` (armed ink: text `--ink-95`, bg `--ink-04`, border `--ink-12`) + `Discard Active Workout` as quiet text-only button below (no border — destructive actions aren't invited). Handlers unchanged.
- rest: the band body is the existing `weeklyReview` recap (retyped: numbers as `StatUnit`s, wow% as a `DeltaChip` — `good` when up, `neutral` when down) or the "Rest day — no workout scheduled" line; then the existing `UP NEXT · {label}` list, whose little header row becomes a `BandHeader` with label `UP NEXT · TOMORROW`.

Deload banners (`~1526–1609`): keep, restyle to §4.6 surface (`--ink-02`/`--ink-08`/`--radius-xs`) and §3 label type.

---

## 4. Band 2 — THIS WEEK (replaces "PROGRESS", ~2170–2215 + `TrainingVolumeCard`)

- `BandHeader label="THIS WEEK"`, right slot: week/week `DeltaChip` — `tone=good arrow=up` when delta>0, `tone=neutral arrow=down` otherwise; `value` = k-formatted |delta|, `pct` = %, `context="WK/WK"`. When `!canCompareWeekOverWeek` (mid-session): `tone=neutral value="{prev}K" context="PREV 7D"`. **This deletes the `#FF5733` usage at ~2511–2513.**
- Body: one `StatUnit` `value=120.9K unit=LB label="VOLUME · WK OF {Mon date}"` + `Sparkline` of `weeklyVolumesForCard` with `live` — the pulsing endpoint is the screen's one live element (§5 of the design language). Height 56–60px.
- The whole band stays a button → `/volume` as today, but with **no visible button chrome** (flat band; press feedback = ink only).
- The "26 of 30 lifts up" `progression` indicator **moves out of this band** into the ALL-TIME header (it describes lifts, not the week).
- Delete `TrainingVolumeCard` once inlined.

## 5. Band 3 — ALL-TIME (replaces "PERSONAL RECORDS", ~2217–2256 + `PRCard`)

- `BandHeader label="ALL-TIME"`, right slot: `DeltaChip` from `progression`: `tone=good arrow=up value="26 OF 30" context="LIFTS UP"` when `up ≥ down`, else `tone=neutral arrow=down`.
- PR cards keep the horizontal scroll row (`prRows` order and card width formula unchanged) but each card is rebuilt from the shared kit:
  - Name: 9.5px `--ink-50`, 2-line min-height.
  - Record: `StatUnit`-style `14 × 70 LB` — both numerals Bebas 30px `--ink-95`, `×` and `LB` as 10–11px `--ink-25` units.
  - `Sparkline` of `chartData`, height 34px, not live.
  - Meta row: relative date (8px `--ink-25`) left, `DeltaChip size="sm"` right (`good` up / `neutral` down, from `trendPct`; hide when null/0).
- Delete `PRCard` once replaced. Card tap targets (→ `/exercise/{name}`) unchanged. Keep `data-testid="pr-section"`.

---

## 6. Deletions checklist

- [ ] Right-side date column in header; `SCHEDULED` static eyebrow.
- [ ] "LAST {X} · TO BEAT" standalone card (content → TODAY header chip).
- [ ] "COMPLETED TODAY" outer box + nested "VS LAST" box (content → TODAY band).
- [ ] All `#FF5733` / `rgba(255,87,51,…)` literals.
- [ ] `PRCard` and `TrainingVolumeCard` components (superseded).
- [ ] Border radii 1px-as-literal/4px/8px on this screen → tokens; the AlertDialog stays as-is (shadcn surface, out of scope).
- [ ] Duplicate volume formatters → one helper.

## 7. Acceptance criteria

1. All four day states (use dev-mode state pills to flip): each renders the band ladder with correct chips; no state shows a contradictory label pair (e.g. SCHEDULED + completed stats).
2. Zero chromatic color on screen except `--good` on earned indicators and the plate-free emerald status dot; a down week renders gray.
3. Every headline number on the screen is the same Bebas stat voice; every section header is the same `BandHeader` anatomy.
4. Exactly one permanently-animating element (week sparkline pulse); entry stagger runs once; `prefers-reduced-motion` disables both.
5. All existing navigation targets still work: title picker, day swipe, `/history/{id}`, `/volume`, `/exercise/{name}`, `/settings`, Start/Resume/Discard.
6. `npm run build` and `npm run test:e2e` pass (update text assertions: `PROGRESS` → `THIS WEEK`, `PERSONAL RECORDS` → `ALL-TIME`, `View Details` → `View session`; check `tests/home-prs.spec.ts`).
