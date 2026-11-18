// A smooth bend of the standard model toward the patient's scan. Plain numbers and typed
// arrays only (no three.js), so it can be tested on its own.
//
// Method: a normalised Gaussian radial basis function (a partition of unity). Each control
// point c_j carries a displacement w_j; a point x moves by
//
//   d(x) = Σ_j w_j g_j(x) / Σ_k g_k(x),   g_j(x) = exp(-|x - c_j|² / 2σ²)
//
// and the w_j are solved (one small linear system, n ≤ about 100) so the control points move
// exactly where they should. Unlike a plain RBF or a thin-plate spline, the field never shrinks
// to nothing between the points, never overshoots far away (far from the points it is just the
// nearest point's displacement), and stays bounded. On top of it a falloff by distance from the
// nearest control point fades the bend out (full within `near`, none beyond `far`), so the
// cranium and anything far from the teeth stays exactly where the rigid fit put it.

export type Vec3 = [number, number, number]

/**
 * The whole-arch step, before the local bend: the standard arch made wider or narrower
 * (`ax`, across the face) and deeper or shallower (`az`, front to back, about `cz`, the front
 * of the arch), and shifted by `t`. Full strength within `near` of the teeth (`anchors`, both
 * jaws), fading to nothing by `far`, so the jaws, gums and lower face follow the patient's arch
 * while the top of the skull keeps its shape.
 */
export type ArchForm = { ax: number; az: number; cz: number; t: Vec3; anchors: Float64Array; near: number; far: number; curve: ArchCurve | null }

/**
 * What is left after the width and depth, along the arch: at each pinned tooth (by its distance
 * along the standard arch from the midline, `s`, negative on the patient's right) the remaining
 * offset, joined up in between and carried on past the last tooth along the same trend, so a
 * V-shaped or square arch doesn't leave its last tooth's offset on every tooth beyond it.
 * `path` is the standard arch seen from above on the patient's left (x, z pairs, x ≥ 0) at the
 * distances `pathS` from the midline; a point's `s` is where it is nearest that path.
 */
export type ArchCurve = { path: Float64Array; pathS: Float64Array; knots: Float64Array; offsets: Float64Array; slopes: [Vec3, Vec3]; reach: number }

/** Where along one side of the arch path a point (x ≥ 0 side) is nearest: [s, squared distance]. */
function nearestOnPath(curve: ArchCurve, x: number, z: number): [number, number] {
  const { path, pathS } = curve
  let best = Infinity
  let bestS = 0
  for (let i = 0; i + 1 < pathS.length; i++) {
    const ax = path[i * 2]
    const az = path[i * 2 + 1]
    const dx = path[i * 2 + 2] - ax
    const dz = path[i * 2 + 3] - az
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
    const d = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2
    if (d < best) {
      best = d
      bestS = pathS[i] + t * (pathS[i + 1] - pathS[i])
    }
  }
  return [bestS, best]
}

/** How softly the two sides of the arch blend where a point is about as near to both (mm). */
const SIDE_BLEND = 6

/**
 * Distance along the arch for a point seen from above, and how much it belongs to the patient's
 * left side (1) or right (0). Projecting onto the arch (not just reading the distance across the
 * face) keeps the back teeth right: there the arch runs nearly front to back.
 */
export function arcOf(curve: ArchCurve, x: number, z: number): { left: number; right: number; share: number } {
  const [left, dl] = nearestOnPath(curve, x, z)
  const [right, dr] = nearestOnPath(curve, -x, z)
  // Soft choice of side: near the arch one side wins outright; on the midline (the palate) both count.
  const k = 1 / (2 * SIDE_BLEND * SIDE_BLEND)
  const share = 1 / (1 + Math.exp(Math.max(-60, Math.min(60, (dl - dr) * k))))
  return { left, right: -right, share }
}

/** The remaining offset at a point, the two sides of the arch blended. */
function offsetAt(curve: ArchCurve, x: number, z: number): Vec3 {
  const { left, right, share } = arcOf(curve, x, z)
  const a = share > 1e-4 ? curveOffset(curve, left) : ([0, 0, 0] as Vec3)
  const b = share < 1 - 1e-4 ? curveOffset(curve, right) : ([0, 0, 0] as Vec3)
  return [a[0] * share + b[0] * (1 - share), a[1] * share + b[1] * (1 - share), a[2] * share + b[2] * (1 - share)]
}

/** The remaining offset at a distance along the arch. */
export function curveOffset(curve: ArchCurve, s: number): Vec3 {
  const { knots, offsets, slopes, reach } = curve
  const n = knots.length
  const at = (i: number): Vec3 => [offsets[i * 3], offsets[i * 3 + 1], offsets[i * 3 + 2]]
  const beyond = (i: number, slope: Vec3, d: number): Vec3 => {
    const e = Math.min(Math.abs(d), reach) * Math.sign(d)
    const base = at(i)
    return [base[0] + slope[0] * e, base[1] + slope[1] * e, base[2] + slope[2] * e]
  }
  if (s <= knots[0]) return beyond(0, slopes[0], s - knots[0])
  if (s >= knots[n - 1]) return beyond(n - 1, slopes[1], s - knots[n - 1])
  let i = 0
  while (i < n - 2 && knots[i + 1] < s) i++
  const t = (s - knots[i]) / (knots[i + 1] - knots[i] || 1)
  const a = at(i)
  const b = at(i + 1)
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export type Warp = {
  /** Applied first; the control points below are where it put them. */
  arch: ArchForm | null
  centres: Float64Array
  weights: Float64Array
  count: number
  /** 1 / (2σ²) */
  inv2s2: number
  near: number
  far: number
}

export type WarpOptions = {
  /** Width of each control point's influence, mm. About one tooth. */
  sigma?: number
  /** Full bend within this distance of a control point, mm. */
  near?: number
  /** No bend beyond this distance, mm. */
  far?: number
  /**
   * Smoothing: 0 makes every control point land exactly; more lets them miss a little in
   * exchange for a gentler bend. Raised automatically if the solution swings wildly.
   */
  smoothing?: number
}

export const WARP_DEFAULTS = { sigma: 4, near: 10, far: 30, smoothing: 1e-3 }

/** Solves A x = b for several right-hand sides at once (Gaussian elimination, partial pivoting). Null when singular. */
function solve(a: Float64Array, b: Float64Array, n: number, columns: number): Float64Array | null {
  const m = Float64Array.from(a)
  const x = Float64Array.from(b)
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r * n + col]) > Math.abs(m[pivot * n + col])) pivot = r
    if (Math.abs(m[pivot * n + col]) < 1e-12) return null
    if (pivot !== col) {
      for (let c = 0; c < n; c++) [m[col * n + c], m[pivot * n + c]] = [m[pivot * n + c], m[col * n + c]]
      for (let c = 0; c < columns; c++) [x[col * columns + c], x[pivot * columns + c]] = [x[pivot * columns + c], x[col * columns + c]]
    }
    for (let r = col + 1; r < n; r++) {
      const f = m[r * n + col] / m[col * n + col]
      if (f === 0) continue
      for (let c = col; c < n; c++) m[r * n + c] -= f * m[col * n + c]
      for (let c = 0; c < columns; c++) x[r * columns + c] -= f * x[col * columns + c]
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    for (let c = 0; c < columns; c++) {
      let v = x[r * columns + c]
      for (let k = r + 1; k < n; k++) v -= m[r * n + k] * x[k * columns + c]
      x[r * columns + c] = v / m[r * n + r]
    }
  }
  return x
}

/** Each basis function's share at x (they add up to 1). Writes into `out`. */
function shares(centres: Float64Array, count: number, inv2s2: number, x: number, y: number, z: number, out: Float64Array) {
  // Subtract the nearest distance before exponentiating, so far points don't underflow to 0/0.
  let nearest = Infinity
  for (let j = 0; j < count; j++) {
    const d = (x - centres[j * 3]) ** 2 + (y - centres[j * 3 + 1]) ** 2 + (z - centres[j * 3 + 2]) ** 2
    out[j] = d
    if (d < nearest) nearest = d
  }
  let sum = 0
  for (let j = 0; j < count; j++) {
    const g = Math.exp(-(out[j] - nearest) * inv2s2)
    out[j] = g
    sum += g
  }
  for (let j = 0; j < count; j++) out[j] /= sum
  return Math.sqrt(nearest)
}

/**
 * The bend taking each `from` point to its `to` point. Null when there is nothing to do (no
 * points and no arch form). The solution is checked: if the weights swing far beyond the displacements asked
 * for (points too close together with different targets), it is smoothed until they don't.
 */
export function solveWarp(source: Vec3[], to: Vec3[], options: WarpOptions = {}, arch: ArchForm | null = null): Warp | null {
  const n = source.length
  if (to.length !== n) return null
  // Nothing to bend: only the arch form, when there is one.
  if (n === 0) return arch ? { arch, centres: new Float64Array(), weights: new Float64Array(), count: 0, inv2s2: 1, near: 0, far: 0 } : null
  // The bend works on the arch-formed model: its control points start where the arch form put them.
  const from = arch ? source.map((p) => archPoint(arch, p)) : source
  const { sigma, near, far } = { ...WARP_DEFAULTS, ...options }
  let smoothing = options.smoothing ?? WARP_DEFAULTS.smoothing
  const inv2s2 = 1 / (2 * sigma * sigma)
  const centres = new Float64Array(n * 3)
  const displacement = new Float64Array(n * 3)
  let largest = 0
  from.forEach((p, i) => {
    centres.set(p, i * 3)
    for (let k = 0; k < 3; k++) displacement[i * 3 + k] = to[i][k] - p[k]
    largest = Math.max(largest, Math.hypot(to[i][0] - p[0], to[i][1] - p[1], to[i][2] - p[2]))
  })
  const a = new Float64Array(n * n)
  const row = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    shares(centres, n, inv2s2, centres[i * 3], centres[i * 3 + 1], centres[i * 3 + 2], row)
    a.set(row, i * n)
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const m = Float64Array.from(a)
    for (let i = 0; i < n; i++) m[i * n + i] += smoothing
    const weights = solve(m, displacement, n, 3)
    let swing = 0
    if (weights) for (let i = 0; i < n; i++) swing = Math.max(swing, Math.hypot(weights[i * 3], weights[i * 3 + 1], weights[i * 3 + 2]))
    if (weights && swing <= 3 * largest + 2) return { arch, centres, weights, count: n, inv2s2, near, far }
    smoothing = Math.max(smoothing * 10, 1e-2)
  }
  // Too tangled to bend smoothly: move each point by its own displacement (still bounded).
  return { arch, centres, weights: displacement, count: n, inv2s2, near, far }
}

/** How much of the bend applies at a distance from the nearest control point: 1, easing to 0. */
function falloff(distance: number, near: number, far: number) {
  if (distance <= near) return 1
  if (distance >= far) return 0
  const t = (distance - near) / (far - near)
  return 1 - t * t * (3 - 2 * t)
}

/** Where one point goes. */
export function warpPoint(warp: Warp, p: Vec3): Vec3 {
  const out = new Float32Array(p)
  warpPositions(warp, out)
  return [out[0], out[1], out[2]]
}

/**
 * Bends points in place (flat x,y,z). `strength` scales the bend per call (1 = full), for parts
 * that should only follow partly.
 */
export function warpPositions(warp: Warp, positions: Float32Array, strength = 1) {
  if (warp.arch) archPositions(warp.arch, positions)
  const { centres, weights, count, inv2s2, near, far } = warp
  const share = new Float64Array(count)
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v]
    const y = positions[v + 1]
    const z = positions[v + 2]
    // Quick rejection: anything beyond `far` of every control point stays put.
    let nearest = Infinity
    for (let j = 0; j < count; j++) {
      const d = (x - centres[j * 3]) ** 2 + (y - centres[j * 3 + 1]) ** 2 + (z - centres[j * 3 + 2]) ** 2
      if (d < nearest) nearest = d
    }
    const f = falloff(Math.sqrt(nearest), near, far) * strength
    if (f === 0) continue
    shares(centres, count, inv2s2, x, y, z, share)
    let dx = 0
    let dy = 0
    let dz = 0
    for (let j = 0; j < count; j++) {
      dx += share[j] * weights[j * 3]
      dy += share[j] * weights[j * 3 + 1]
      dz += share[j] * weights[j * 3 + 2]
    }
    positions[v] = x + f * dx
    positions[v + 1] = y + f * dy
    positions[v + 2] = z + f * dz
  }
}

/** How strongly the arch form applies at a point: by its distance from the nearest tooth. */
function archWeight(arch: ArchForm, x: number, y: number, z: number) {
  const a = arch.anchors
  let nearest = Infinity
  for (let i = 0; i < a.length; i += 3) {
    const d = (x - a[i]) ** 2 + (y - a[i + 1]) ** 2 + (z - a[i + 2]) ** 2
    if (d < nearest) nearest = d
  }
  return falloff(Math.sqrt(nearest), arch.near, arch.far)
}

/** Where the arch form takes one point. */
export function archPoint(arch: ArchForm, [x, y, z]: Vec3): Vec3 {
  const w = archWeight(arch, x, y, z)
  if (w === 0) return [x, y, z]
  const r = arch.curve ? offsetAt(arch.curve, x, z) : ([0, 0, 0] as Vec3)
  return [
    x + w * ((arch.ax - 1) * x + arch.t[0] + r[0]),
    y + w * (arch.t[1] + r[1]),
    z + w * ((arch.az - 1) * (z - arch.cz) + arch.t[2] + r[2]),
  ]
}

/** The arch form on points in place (flat x,y,z). */
function archPositions(arch: ArchForm, positions: Float32Array) {
  for (let v = 0; v < positions.length; v += 3) {
    const [x, y, z] = archPoint(arch, [positions[v], positions[v + 1], positions[v + 2]])
    positions[v] = x
    positions[v + 1] = y
    positions[v + 2] = z
  }
}
