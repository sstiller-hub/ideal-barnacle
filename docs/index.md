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
