import { AktProgramMessageLine } from 'my-v0-project'

// Ported from app/page.tsx. The slot reserves its space in all states so
// nothing reflows between them.
export function Warn() {
  return (
    <div style={{ width: '420px' }}>
      <AktProgramMessageLine
        tone="warn"
        messageKey="deload-active"
        message="Deload week active · ends Sun, Mar 9"
      />
    </div>
  )
}

export function Neutral() {
  return (
    <div style={{ width: '420px' }}>
      <AktProgramMessageLine
        tone="neutral"
        messageKey="deload-complete"
        message="Deload complete — back to full training"
      />
    </div>
  )
}

export function Dismissible() {
  return (
    <div style={{ width: '420px' }}>
      <AktProgramMessageLine
        tone="neutral"
        messageKey="deload-complete-dismissible"
        message="Deload complete — back to full training"
        onDismiss={() => {}}
      />
    </div>
  )
}
