import { Badge } from 'my-v0-project'

export function Tones() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone="good">PR</Badge>
      <Badge tone="warn">Flagged</Badge>
      <Badge tone="neutral">Warmup</Badge>
    </div>
  )
}

export function OnAnExerciseRow() {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">Bench Press</span>
      <Badge tone="neutral">Warmup</Badge>
      <Badge tone="good">Volume PR</Badge>
    </div>
  )
}

export function Default() {
  return <Badge>Neutral by default</Badge>
}
