import { Button } from 'my-v0-project'

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">Log Set</Button>
      <Button variant="secondary">Skip</Button>
      <Button variant="outline">Add Exercise</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">End Workout</Button>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Start Workout</Button>
    </div>
  )
}

export function IconSizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="icon-sm" variant="secondary" aria-label="Decrease reps">
        −
      </Button>
      <Button size="icon" variant="secondary" aria-label="Increase reps">
        +
      </Button>
      <Button size="icon-lg" variant="default" aria-label="Confirm set">
        ✓
      </Button>
    </div>
  )
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Log Set</Button>
      <Button variant="secondary" disabled>
        Skip
      </Button>
      <Button variant="outline" disabled>
        Add Exercise
      </Button>
    </div>
  )
}

export function SentenceCase() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button uppercase={false}>Save and continue to next exercise</Button>
      <Button variant="ghost" uppercase={false}>
        Not now
      </Button>
    </div>
  )
}
