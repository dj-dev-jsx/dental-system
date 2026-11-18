// What the crowns look like along the arch: for each step along the arch curve, how much crown
// stands above the gums across it. The gaps between teeth are dips in this profile.
import { type ArchCurve, type Plane, planeAt } from './arch'
import type { HeightMap } from './heightMap'

export type Profile = {
  n: number
  step: number
  /** Per height-map cell: the arch sample it belongs to, or -1 when too far from the arch. */
  nearest: Int32Array
  /** Per cell: signed distance across the arch (mm), + to the left of the curve's direction. */
  across: Float32Array
  /** Per cell: height above the occlusal plane (mm; negative below). */
  rel: Float32Array
  /** Highest point across the arch at each sample (mm above the plane). */
  height: Float64Array
  /** Cross-section area of crown above the level `floor` mm below the plane (sq mm). */
  mass: Float64Array
  /** Width across the arch of the part within 3 mm of the plane (mm). */
  width: Float64Array
  /** Middle of that part across the arch (mm). */
  centre: Float64Array
  /** Cross-section area above 3 mm below the plane (sq mm). */
  mass3: Float64Array
  /** Highest point on each side of the curve (cusp rows), lower of the two (mm). */
  sides: Float64Array
  /** Cross-section area above a level 3 mm under the local top (sq mm). */
  lmass: Float64Array
  /** Length (mm) from the curve's start. */
  arc: Float64Array
  /** +1 when the arch bends to the left of the curve's direction, -1 to the right. */
  inside: number
  /** Top of the cross-section above its low parts (mm). */
  prominence: Float64Array
  /** Width across the arch of the part within 3 mm of the local top (mm): a tooth-type cue. */
  lwidth: Float64Array
  /** The same above 1.5 mm under the local top. */
  shallow: Float64Array
  /** True when the scan stops right at that end of the arch (the last tooth may be cut off). */
  cutStart: boolean
  cutEnd: boolean
  /** Unit tangent per sample. */
  tu: Float64Array
  tv: Float64Array
}

const FLOOR = 5
const HALF_WIDTH = 7.5

export function buildProfile(map: HeightMap, plane: Plane, curve: ArchCurve): Profile {
  const { w, h, cell, u0, v0, top } = map
  const n = curve.u.length
  const tu = new Float64Array(n), tv = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 2), b = Math.min(n - 1, k + 2)
    const du = curve.u[b] - curve.u[a], dv = curve.v[b] - curve.v[a]
    const l = Math.hypot(du, dv) || 1
    tu[k] = du / l
    tv[k] = dv / l
  }
  const nearest = new Int32Array(w * h).fill(-1)
  const across = new Float32Array(w * h)
  const rel = new Float32Array(w * h).fill(NaN)
  const height = new Float64Array(n).fill(-Infinity)
  const mass = new Float64Array(n)
  const lo = new Float64Array(n).fill(Infinity), hi = new Float64Array(n).fill(-Infinity)
  const mass3 = new Float64Array(n)
  const left = new Float64Array(n).fill(-FLOOR * 2), right = new Float64Array(n).fill(-FLOOR * 2)
  const coarse = 8
  const reach2 = (HALF_WIDTH + 2) ** 2
  for (let y = 0; y < h; y++) {
    const v = v0 + y * cell
    for (let x = 0; x < w; x++) {
      const o = y * w + x
      const t = top[o]
      if (Number.isNaN(t)) continue
      const u = u0 + x * cell
      // Nearest sample: every 8th first, then around the best.
      let best = 0, bd = Infinity
      for (let k = 0; k < n; k += coarse) {
        const d = (curve.u[k] - u) ** 2 + (curve.v[k] - v) ** 2
        if (d < bd) {
          bd = d
          best = k
        }
      }
      const from = Math.max(0, best - coarse), to = Math.min(n - 1, best + coarse)
      for (let k = from; k <= to; k++) {
        const d = (curve.u[k] - u) ** 2 + (curve.v[k] - v) ** 2
        if (d < bd) {
          bd = d
          best = k
        }
      }
      if (bd > reach2) continue
      const r = t - planeAt(plane, u, v)
      const a = (u - curve.u[best]) * -tv[best] + (v - curve.v[best]) * tu[best]
      nearest[o] = best
      across[o] = a
      rel[o] = r
      if (Math.abs(a) > HALF_WIDTH) continue
      if (r > height[best]) height[best] = r
      if (r > -FLOOR) mass[best] += (r + FLOOR) * cell * cell
      if (r > -3) mass3[best] += (r + 3) * cell * cell
      if (a > 1 && r > left[best]) left[best] = r
      if (a < -1 && r > right[best]) right[best] = r
      if (r > -3) {
        if (a < lo[best]) lo[best] = a
        if (a > hi[best]) hi[best] = a
      }
    }
  }
  const width = new Float64Array(n), centre = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    mass[k] /= curve.step
    mass3[k] /= curve.step
    width[k] = hi[k] > lo[k] ? hi[k] - lo[k] : 0
    centre[k] = hi[k] > lo[k] ? (hi[k] + lo[k]) / 2 : 0
    if (!(height[k] > -Infinity)) height[k] = -FLOOR * 2
  }
  // Crown above a level 3 mm under the local top (+/-4 mm along the arch), so a tilted plane or
  // a short tooth doesn't hide the dips between teeth.
  const local = new Float64Array(n)
  const win = Math.round(4 / curve.step)
  for (let k = 0; k < n; k++) {
    let m = -Infinity
    for (let j = Math.max(0, k - win); j <= Math.min(n - 1, k + win); j++) m = Math.max(m, height[j])
    local[k] = m - 3
  }
  // The same 1.5 mm under the top: thin front teeth touch high up, so their gaps show there.
  const lmass = new Float64Array(n)
  const shallow = new Float64Array(n)
  const llo = new Float64Array(n).fill(Infinity), lhi = new Float64Array(n).fill(-Infinity)
  for (let o = 0; o < nearest.length; o++) {
    const k = nearest[o]
    if (k < 0 || Math.abs(across[o]) > HALF_WIDTH) continue
    const r = rel[o]
    if (r > local[k]) {
      lmass[k] += (r - local[k]) * cell * cell
      if (across[o] < llo[k]) llo[k] = across[o]
      if (across[o] > lhi[k]) lhi[k] = across[o]
    }
    if (r > local[k] + 1.5) shallow[k] += (r - local[k] - 1.5) * cell * cell
  }
  const lwidth = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    lmass[k] /= curve.step
    shallow[k] /= curve.step
    lwidth[k] = lhi[k] > llo[k] ? lhi[k] - llo[k] : 0
  }
  const sides = new Float64Array(n)
  for (let k = 0; k < n; k++) sides[k] = Math.min(left[k], right[k])
  // How far the top stands above the low parts of the same cross-section (gums or ridge):
  // a crown, prep or implant stands 5 mm or more above its gums; a toothless ridge doesn't.
  const lows: number[][] = Array.from({ length: n }, () => [])
  for (let o = 0; o < nearest.length; o++) {
    const k = nearest[o]
    if (k >= 0) lows[k].push(rel[o])
  }
  const prominence = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const a = lows[k]
    if (a.length < 5) continue
    a.sort((x, y) => x - y)
    prominence[k] = height[k] - a[Math.floor(a.length * 0.1)]
  }
  // Length along the curve. (Measured on labelled scans, the centre line's length between tooth
  // centres matches the teeth's widths equally at the front and the back, about 1.08 times the
  // average widths, so no correction for the curve's bend is needed.)
  let turn = 0
  const kappa = new Float64Array(n)
  for (let k = 1; k < n - 1; k++) {
    const cross = tu[k - 1] * tv[k + 1] - tv[k - 1] * tu[k + 1]
    const dotp = tu[k - 1] * tu[k + 1] + tv[k - 1] * tv[k + 1]
    kappa[k] = Math.atan2(cross, dotp) / (2 * curve.step)
    turn += kappa[k] * curve.step
  }
  const inside = Math.sign(turn) || 1
  const arc = new Float64Array(n)
  for (let k = 1; k < n; k++) arc[k] = arc[k - 1] + curve.step
  // Is the scan cut off at each end of the arch (no surface beyond the last crown, so that
  // tooth may be partial), or does gum carry on past a whole tooth?
  const cutOff = (end: 0 | 1) => {
    const k = end === 0 ? 0 : n - 1
    const su = end === 0 ? -tu[k] : tu[k], sv = end === 0 ? -tv[k] : tv[k]
    let tested = 0, filled = 0
    for (let d = 1.5; d <= 4; d += 0.5) {
      for (let o = -2; o <= 2; o += 1) {
        const x = Math.round((curve.u[k] + su * d - sv * o - map.u0) / cell)
        const y = Math.round((curve.v[k] + sv * d + su * o - map.v0) / cell)
        tested++
        if (x >= 0 && y >= 0 && x < w && y < h && !Number.isNaN(top[y * w + x])) filled++
      }
    }
    return filled / tested < 0.5
  }
  return { n, step: curve.step, nearest, across, rel, height, mass, width, centre, mass3, sides, lmass, shallow, lwidth, prominence, arc, inside, cutStart: cutOff(0), cutEnd: cutOff(1), tu, tv }
}

/** Moving average over +/- radius samples. */
export function smoothed(values: ArrayLike<number>, radius: number): Float64Array {
  const n = values.length
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0
    for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) {
      s += values[k]
      c++
    }
    out[i] = s / c
  }
  return out
}

export type Valley = { at: number; depth: number }

/**
 * Dips in a profile: local minima, each with its prominence (how far it is below the lower of
 * the highest points within `reach` samples on either side).
 */
export function valleys(values: ArrayLike<number>, reach: number): Valley[] {
  const n = values.length
  const out: Valley[] = []
  for (let i = 1; i < n - 1; i++) {
    if (!(values[i] <= values[i - 1] && values[i] < values[i + 1])) continue
    let left = -Infinity, right = -Infinity
    for (let k = Math.max(0, i - reach); k < i; k++) left = Math.max(left, values[k])
    for (let k = i + 1; k <= Math.min(n - 1, i + reach); k++) right = Math.max(right, values[k])
    const depth = Math.min(left, right) - values[i]
    if (depth > 0) out.push({ at: i, depth })
  }
  return out
}
