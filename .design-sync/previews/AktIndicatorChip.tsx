import { AktIndicatorChip } from 'my-v0-project'

// Ported from app/workout-summary/page.tsx — earned badges on an exercise row.
export function EarnedBadges() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AktIndicatorChip indicatorId="demo:pr" tone="good" label="PR" />
      <AktIndicatorChip indicatorId="demo:vol" tone="good" label="VOL" />
      <AktIndicatorChip indicatorId="demo:overflow" tone="good" label="+2" />
    </div>
  )
}

export function Tones() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AktIndicatorChip indicatorId="demo:tone-good" tone="good" label="PR" />
      <AktIndicatorChip indicatorId="demo:tone-warn" tone="warn" label="!" />
    </div>
  )
}

export function WithGlyph() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AktIndicatorChip indicatorId="demo:glyph-up" tone="good" glyph="↑" />
      <AktIndicatorChip indicatorId="demo:glyph-star" tone="good" glyph="★" label="PR" />
    </div>
  )
}

// `present={false}` reserves the slot's space empty so a row never reflows
// when a chip lights up. Both rows below are the same height.
export function ReservedSlot() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AktIndicatorChip indicatorId="demo:present" tone="good" label="PR" present />
      </div>
      <div className="flex items-center gap-2">
        <AktIndicatorChip indicatorId="demo:absent" tone="good" label="PR" present={false} />
      </div>
    </div>
  )
}
