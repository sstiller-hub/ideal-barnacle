import { Input } from 'my-v0-project'

export function Default() {
  return (
    <div style={{ width: '320px' }}>
      <Input placeholder="Search exercises" />
    </div>
  )
}

export function WithValue() {
  return (
    <div style={{ width: '320px' }}>
      <Input defaultValue="Barbell Bench Press" />
    </div>
  )
}

// Set logging is numeric and one-handed — the app uses a decimal keypad.
export function Numeric() {
  return (
    <div className="flex gap-3" style={{ width: '320px' }}>
      <Input inputMode="decimal" defaultValue="185" aria-label="Weight" />
      <Input inputMode="numeric" defaultValue="8" aria-label="Reps" />
    </div>
  )
}

export function Disabled() {
  return (
    <div style={{ width: '320px' }}>
      <Input disabled defaultValue="Synced from Whoop" />
    </div>
  )
}
