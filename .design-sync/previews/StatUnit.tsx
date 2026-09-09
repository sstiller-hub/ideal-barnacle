import { StatUnit } from 'my-v0-project'

// The completed-workout stat row from app/page.tsx — every headline number on
// a screen speaks in this one voice.
export function SessionStats() {
  return (
    <div className="flex items-baseline" style={{ gap: '28px' }}>
      <StatUnit value="21.8K" unit="LB" label="VOLUME" />
      <StatUnit value="6" label="EXERCISES" />
      <StatUnit value="48" unit="MIN" label="DURATION" />
      <StatUnit value="4" unit="OF 6" label="BEATEN" />
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex items-baseline" style={{ gap: '28px' }}>
      <StatUnit size="md" value="21.8K" unit="LB" label="VOLUME" />
      <StatUnit size="sm" value="21.8K" unit="LB" label="VOLUME" />
    </div>
  )
}

export function WeeklyReview() {
  return (
    <div className="flex items-baseline" style={{ gap: '28px' }}>
      <StatUnit value="4" label="SESSIONS" />
      <StatUnit value="72.4K" unit="LB" label="VOLUME · WK OF MAR 3" />
      <StatUnit value="3" label="PRS" />
    </div>
  )
}
