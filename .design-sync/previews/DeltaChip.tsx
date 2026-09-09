import { DeltaChip } from 'my-v0-project'

// Tone rule from the component's own docs: "good" only when the athlete beat
// something. Declines are "neutral" — the app records, it does not judge.
export function Tones() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DeltaChip tone="good" arrow="up" value="+2.4K" pct="12%" context="WK/WK" />
      <DeltaChip tone="neutral" arrow="down" value="-1.1K" pct="6%" context="WK/WK" />
      <DeltaChip tone="neutral" value="18.2K" context="PREV 7D" />
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DeltaChip size="md" tone="good" arrow="up" value="+2.4K" pct="12%" context="WK/WK" />
      <DeltaChip size="sm" tone="good" arrow="up" value="+2.4K" pct="12%" context="WK/WK" />
    </div>
  )
}

export function InSessionContext() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DeltaChip
        tone="neutral"
        value="21.8K"
        context="LAST UPPER · TO BEAT · TUE"
      />
      <DeltaChip
        tone="good"
        arrow="up"
        value="+3.6K"
        pct="17%"
        context="VS LAST UPPER · TUE"
      />
    </div>
  )
}
