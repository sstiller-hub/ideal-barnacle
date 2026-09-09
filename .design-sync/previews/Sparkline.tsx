import { Sparkline, StatUnit } from 'my-v0-project'

// Weekly volume, the call site in app/page.tsx (height 56, live, padding 5000).
const weeklyVolume = [48200, 52400, 51100, 57800, 55300, 61200, 64900, 72400]

export function WeeklyVolume() {
  return (
    <div style={{ width: '360px' }}>
      <Sparkline data={weeklyVolume} height={56} domainPadding={5000} />
    </div>
  )
}

// `live` overlays a pulse ring on the endpoint — a screen's single
// permanently-animated element.
export function Live() {
  return (
    <div style={{ width: '360px' }}>
      <Sparkline data={weeklyVolume} height={56} live domainPadding={5000} />
    </div>
  )
}

// PR weight progression keeps its own padding (15).
export function PrProgression() {
  return (
    <div style={{ width: '360px' }}>
      <Sparkline data={[185, 190, 190, 195, 205, 210]} height={44} domainPadding={15} />
    </div>
  )
}

export function UnderAStat() {
  return (
    <div style={{ width: '360px' }}>
      <div style={{ marginBottom: '10px' }}>
        <StatUnit value="72.4K" unit="LB" label="VOLUME · WK OF MAR 3" />
      </div>
      <Sparkline data={weeklyVolume} height={56} live domainPadding={5000} />
    </div>
  )
}
