import { SessionClock, StatUnit } from 'my-v0-project'

// The clock owns its own interval, so the rendered time advances from
// `startedAt` to now. Fixed offsets keep the cards readable.
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export function Elapsed() {
  return <SessionClock startedAt={minutesAgo(48)} />
}

export function OverAnHour() {
  return <SessionClock startedAt={minutesAgo(83)} />
}

// `render` lets a caller place the ticking value in its own typography.
export function CustomRender() {
  return (
    <SessionClock
      startedAt={minutesAgo(48)}
      render={(formatted) => <StatUnit value={formatted} label="SESSION" />}
    />
  )
}
