// Upper or lower: an upper scan usually carries the palate, a surface filling the inside of the
// arch; a lower one has the tongue's space there, empty.
import type { ArchCurve } from './arch'
import type { HeightMap } from './heightMap'

/**
 * The share (0..1) of points 10 to 18 mm inside the arch curve, away from any teeth, where the
 * scan has a surface. Null when the curve hardly bends, so there is no "inside" to test.
 */
export function palateFill(map: HeightMap, curve: ArchCurve): number | null {
  const n = curve.u.length
  if (n < 20) return null
  // Which side the arch bends towards (the inside).
  let turn = 0
  for (let k = 2; k < n - 2; k++) {
    const au = curve.u[k] - curve.u[k - 2], av = curve.v[k] - curve.v[k - 2]
    const bu = curve.u[k + 2] - curve.u[k], bv = curve.v[k + 2] - curve.v[k]
    turn += Math.atan2(au * bv - av * bu, au * bu + av * bv)
  }
  if (Math.abs(turn) < 0.6) return null
  const side = Math.sign(turn)
  let tested = 0, filled = 0
  const { w, h, cell, u0, v0, top } = map
  for (let k = Math.round(n * 0.1); k < Math.round(n * 0.9); k += 2) {
    const a = Math.max(0, k - 3), b = Math.min(n - 1, k + 3)
    let tu = curve.u[b] - curve.u[a], tv = curve.v[b] - curve.v[a]
    const l = Math.hypot(tu, tv) || 1
    tu /= l
    tv /= l
    // Left normal of the direction of travel; the inside is on the left when the arch turns left.
    const nu = -tv * side, nv = tu * side
    for (let d = 10; d <= 18; d += 2) {
      const pu = curve.u[k] + nu * d, pv = curve.v[k] + nv * d
      let near = false
      for (let j = 0; j < n && !near; j += 2) if ((curve.u[j] - pu) ** 2 + (curve.v[j] - pv) ** 2 < 81) near = true
      if (near) continue
      const x = Math.round((pu - u0) / cell), y = Math.round((pv - v0) / cell)
      tested++
      if (x >= 0 && y >= 0 && x < w && y < h && !Number.isNaN(top[y * w + x])) filled++
    }
  }
  return tested >= 10 ? filled / tested : null
}
