import { SetRow } from 'my-v0-project'

const noop = () => {}

// Full-width, ≥56px tap target: used one-handed, standing up.
export function Unchecked() {
  return (
    <div style={{ width: '420px' }}>
      <SetRow
        set={{ id: 's1', weight: 185, reps: 8, flagged: false }}
        ordinal={1}
        checked={false}
        onToggle={noop}
      />
    </div>
  )
}

export function Checked() {
  return (
    <div style={{ width: '420px' }}>
      <SetRow
        set={{ id: 's1', weight: 185, reps: 8, flagged: false }}
        ordinal={1}
        checked
        onToggle={noop}
      />
    </div>
  )
}

export function Flagged() {
  return (
    <div style={{ width: '420px' }}>
      <SetRow
        set={{ id: 's3', weight: 225, reps: 3, flagged: true }}
        ordinal={3}
        checked={false}
        onToggle={noop}
      />
    </div>
  )
}

// The list as it appears mid-transcription: earlier sets logged and faded out.
export function ProgressList() {
  return (
    <div className="flex flex-col gap-2" style={{ width: '420px' }}>
      <SetRow set={{ id: 'a', weight: 135, reps: 10, flagged: false }} ordinal={1} checked onToggle={noop} />
      <SetRow set={{ id: 'b', weight: 185, reps: 8, flagged: false }} ordinal={2} checked onToggle={noop} />
      <SetRow set={{ id: 'c', weight: 205, reps: 5, flagged: false }} ordinal={3} checked={false} onToggle={noop} />
      <SetRow set={{ id: 'd', weight: 225, reps: 3, flagged: true }} ordinal={4} checked={false} onToggle={noop} />
    </div>
  )
}
