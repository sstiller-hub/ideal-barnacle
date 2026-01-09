# Kova Fit Docs

## Product Philosophy: System of Record
- Explicit data entry only. No inference.
- High data integrity and trustworthiness.
- Missing data remains missing and is shown as missing or Not logged.
- All data mutations are user initiated and auditable.
- Historical records are immutable unless explicitly edited.
- Edit first UX. Avoid accidental set creation or deletion.
- Sessions and history are the authoritative record.

## Known Gaps
- Some existing features use smart defaults and progressive autofill. These should be reviewed to ensure they remain explicit and user initiated.

## Working with Codex
- Codex standing instructions: /docs/codex-standing-instructions.md

## Next Session Notes
- Purpose: Explicit user authored notes for the next routine or exercise session.
- UI: Routine note appears at the top of the session. Exercise note appears inside each exercise section.
- Storage: localStorage key `next_session_notes_v1` with routine and exercise entries keyed by ID when available and name fallback only when IDs are missing.
- Integrity: Notes are created, edited, or cleared only by explicit user actions. No auto clearing or inference.
