# QA Plan (Akt)

This doc turns field‑test findings into a focused regression strategy. It includes:
- A prioritized issue list (by risk and recurrence)
- A compact manual checklist
- Automated test coverage targets
- Data consistency tests
- Debug hooks (dev‑only)

---

## 1) Prioritized Issue List

Legend:
- **Impact**: how much user trust or progress is at risk
- **Recurrence**: how often it showed up in testing
- **Priority**: what to fix first to reduce regressions fastest

### P0 (Fix First: high impact + high recurrence)
1) **Set completion state regressions**
   - Symptoms: completed sets revert, last set completion not saved after leaving app, conflicts across completion pathways.
   - Risk: progress loss, user mistrust.

2) **Rest timer state stability**
   - Symptoms: timer weird on first show, unstable across exercise navigation, abrupt disappear.
   - Risk: workout flow breaks.

3) **PR/Progress feedback missing or inconsistent**
   - Symptoms: PRs not shown in active workout, “Recovery Set / PR” missing, PR logic per‑set index only.
   - Risk: perceived value loss, training feedback weak.

### P1 (Fix Next)
4) **Input validation inconsistencies**
   - Symptoms: 0 lbs not accepted; auto‑highlight inconsistencies; input focus only first set.
   - Risk: friction, incorrect data capture.

5) **Navigation / active exercise sync**
   - Symptoms: dots not synced on swipe; reset to next exercise when navigating back.
   - Risk: UI confusion.

6) **Layout density issues**
   - Symptoms: 4 sets can’t fit with rest timer; bottom area wasted; completed set too tall.
   - Risk: poor usability on small screens.

### P2 (Fix as time permits)
7) **Date assignment issues**
   - Symptoms: workouts assigned to wrong date.
   - Risk: analytics integrity.

8) **Copy / micro‑UI**
   - Symptoms: “+1 reps”; checkmark affordance; toggle duplication.
   - Risk: polish.

---

## 2) Manual Smoke Checklist (5–7 minutes)

Run on each change set before merge:

1. Start workout → enter weight/reps → **auto‑highlight** on every set.
2. Complete set → **PR/Recovery** feedback visible in set row.
3. Rest timer starts → **+30s** works → **skip** works → exit animation smooth.
4. Swipe between exercises → **dots sync** instantly.
5. Leave app → return → **completed sets still complete**.
6. Toggle plate viz → **single toggle** flips per‑side/total.
7. For 4+ sets with timer active → **all inputs visible** without clipping.

---

## 3) Automated Test Coverage

### A) E2E Flow Tests (Playwright)

**Active workout regression suite (implemented)**  
File: `tests/active-workout-regressions.spec.ts`
- Home shows **sets remaining** for active workout
- Completed set **persists after reload**
- **NEW PR** appears in active workout set row
- **Recovery Set** appears when below last performance
- Completed set renders **more compact**
- Plate toggle is a **single button** and flips label

**Flow 1 — Basic Session**
- Start workout
- Enter weight/reps for first set
- Complete set
- Verify rest timer appears

**Flow 2 — Timer Stability**
- Start timer, switch exercises, return
- Ensure remaining time is consistent

**Flow 3 — Persistence**
- Complete a set, refresh page
- Verify completion and inputs persist

**Flow 4 — PR Feedback**
- Use a fixture where last set is lower vs prior and higher vs prior
- Verify “Recovery Set” and “NEW PR!” appear

**Flow 5 — Plate Toggle**
- Toggle per‑side/total
- Ensure value and label reflect mode

### B) Visual Regression Targets

Capture snapshots in:
- Active exercise card with 4+ sets + timer
- Completed set in active exercise (compact layout)
- Plate viz on + off
- PR status row (PR, progressed, matched, recovery)

---

## 4) Data‑Consistency Unit Tests

### Set Completion
- Completing a set sets `completed: true`, persists to draft, and survives refresh.
- Toggle completion twice returns to original state.

### PR Logic
- PR is evaluated across **all sets of exercise**, not only set index.
- Adding reps at same weight triggers PR when higher than history.
- “Recovery Set” is shown when below previous performance.

### Timer State
- Timer stored in a single source of truth.
- When rest ends, timer clears and UI transitions smoothly.

### Dates
- Workout date is derived correctly in local timezone (EST).

---

## 5) Dev‑Only Debug Hooks (Optional but Useful)

These speed iteration. Add under a `DEV` flag:
- Log rest timer start/stop/remaining
- Log set completion transitions and timestamps
- Log PR evaluation input and output

---

## 6) Suggested Work Breakdown (Fast Regression Wins)

1) Unify **set completion** logic → reduce duplicate pathways
2) Single **timer source of truth** → stable across navigation
3) PR logic centralized → used by session + summary
4) Input validation consistency → allow 0, highlight all fields
5) UI sync fixes → dots/scroll state/compact layout

---

## 7) Tracking Template (for new issues)

Use this structure:
- **Title**
- **Steps to reproduce**
- **Expected / Actual**
- **Screens**
- **Severity**
- **Tags** (timer / completion / PR / navigation / layout / input / date)

---

## 8) Run Tests

Run the full suite:

```sh
npx playwright test
```

Run only the active workout regression suite:

```sh
npx playwright test tests/active-workout-regressions.spec.ts
```
