import { BandHeader, DeltaChip, StatUnit } from 'my-v0-project'

// Identical anatomy for every section: label + hairline + right slot
// (usually a DeltaChip). Ported from app/page.tsx.
export function WithDelta() {
  return (
    <div style={{ width: '360px' }}>
      <BandHeader label="THIS WEEK">
        <DeltaChip tone="good" arrow="up" value="+2.4K" pct="12%" context="WK/WK" />
      </BandHeader>
    </div>
  )
}

export function LabelOnly() {
  return (
    <div style={{ width: '360px' }}>
      <BandHeader label="UP NEXT · UPPER B" />
    </div>
  )
}

export function OverContent() {
  return (
    <div style={{ width: '360px' }}>
      <BandHeader label="TODAY">
        <DeltaChip tone="neutral" value="21.8K" context="LAST UPPER · TO BEAT" />
      </BandHeader>
      <div className="flex items-baseline" style={{ gap: '28px' }}>
        <StatUnit value="21.8K" unit="LB" label="VOLUME" />
        <StatUnit value="6" label="EXERCISES" />
      </div>
    </div>
  )
}
