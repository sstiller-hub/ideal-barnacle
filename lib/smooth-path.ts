// Catmull-Rom → cubic bezier smooth path through an array of [x, y] points.
//
// Each segment's control points are clamped to that segment's own y-span, so
// the curve never swings above or below the points it connects. Unclamped
// Catmull-Rom overshoots after a sharp change — a volume line could dip below
// its own baseline and draw a value that was never logged.
export function buildSmoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return ""
  if (pts.length === 1) return `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const pm1 = pts[Math.max(i - 2, 0)]
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const p2 = pts[Math.min(i + 1, pts.length - 1)]
    const lo = Math.min(p0[1], p1[1])
    const hi = Math.max(p0[1], p1[1])
    const clampY = (y: number) => Math.min(hi, Math.max(lo, y))
    const cp1x = p0[0] + (p1[0] - pm1[0]) / 6
    const cp1y = clampY(p0[1] + (p1[1] - pm1[1]) / 6)
    const cp2x = p1[0] - (p2[0] - p0[0]) / 6
    const cp2y = clampY(p1[1] - (p2[1] - p0[1]) / 6)
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`
  }
  return d
}
