// The arithmetic for placing a scan in the chart's standard skull (see placement.ts) and for hiding its gums.
// Plain arrays and typed arrays only (no three.js), so it runs in a worker and in a test script.

export type Vec3 = [number, number, number]
/** A 3x3 matrix, row by row. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

/** chart = scale * rotation * scan + translation. */
export type Similarity = { rotation: Mat3; scale: number; translation: Vec3 }

export type Fit = Similarity & {
  /** Average distance between each pin and its tooth after fitting, in the scan's own millimetres. */
  meanError: number
  maxError: number
  /** Which pin (by its place in the list) is furthest from its tooth. */
  worst: number
}

export const mulVec = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
]

export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]

export const apply = (f: Similarity, v: Vec3): Vec3 => {
  const r = mulVec(f.rotation, v)
  return [f.scale * r[0] + f.translation[0], f.scale * r[1] + f.translation[1], f.scale * r[2] + f.translation[2]]
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function centroid(points: Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0]
  for (const p of points) {
    c[0] += p[0]
    c[1] += p[1]
    c[2] += p[2]
  }
  return [c[0] / points.length, c[1] / points.length, c[2] / points.length]
}

/**
 * Eigenvalues and eigenvectors of a small symmetric matrix (Jacobi rotations). `a` is n x n,
 * row by row. Returns the values and the vectors as columns of `v`, both unsorted.
 */
export function symmetricEigen(input: number[], n: number): { values: number[]; vectors: number[] } {
  const a = input.slice()
  const v: number[] = Array.from({ length: n * n }, (_, i) => (i % (n + 1) === 0 ? 1 : 0))
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2
    if (off < 1e-22) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]
        if (Math.abs(apq) < 1e-300) continue
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq)
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p]
          const akq = a[k * n + q]
          a[k * n + p] = c * akp - s * akq
          a[k * n + q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k]
          const aqk = a[q * n + k]
          a[p * n + k] = c * apk - s * aqk
          a[q * n + k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p]
          const vkq = v[k * n + q]
          v[k * n + p] = c * vkp - s * vkq
          v[k * n + q] = s * vkp + c * vkq
        }
      }
    }
  }
  return { values: Array.from({ length: n }, (_, i) => a[i * n + i]), vectors: v }
}

/** The spread of points along their weakest two directions (to spot a row of pins in a line). */
function spread(points: Vec3[]) {
  const c = centroid(points)
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const p of points) {
    const d = sub(p, c)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += d[i] * d[j]
  }
  const { values, vectors } = symmetricEigen(m, 3)
  const order = [0, 1, 2].sort((x, y) => values[x] - values[y])
  return { values: order.map((i) => values[i] / points.length), smallest: [vectors[order[0]], vectors[3 + order[0]], vectors[6 + order[0]]] as Vec3 }
}

export type FitOptions = {
  /** How much each pair counts (1 each when left out). */
  weights?: number[]
  /**
   * The size the scale is drawn toward, and how strongly (in mm², compared with the pairs'
   * weighted spread about their middle). A few pins on one side of the arch say little about
   * size; a whole arch outweighs the prior.
   */
  scalePrior?: number
  scaleStrength?: number
}

/**
 * The best rotation, uniform scale and shift taking `from` onto `to` (weighted least squares),
 * in closed form: Horn's quaternion method for the rotation (always a proper rotation, never a
 * mirror), then the best scale for that rotation (the same answer as Umeyama's), drawn toward
 * `scalePrior` when asked. Null when there are fewer than 3 pairs, or the points lie on one
 * line, so the turn about that line is unknown. The errors are measured on every pair given.
 */
export function fitSimilarity(from: Vec3[], to: Vec3[], options: FitOptions = {}): Fit | null {
  if (from.length !== to.length || from.length < 3) return null
  const w = options.weights ?? from.map(() => 1)
  const total = w.reduce((s, x) => s + x, 0)
  if (!(total > 0)) return null
  const weightedCentre = (points: Vec3[]): Vec3 => {
    const c: Vec3 = [0, 0, 0]
    points.forEach((p, i) => {
      c[0] += w[i] * p[0]
      c[1] += w[i] * p[1]
      c[2] += w[i] * p[2]
    })
    return [c[0] / total, c[1] / total, c[2] / total]
  }
  const ca = weightedCentre(from)
  const cb = weightedCentre(to)
  const a = from.map((p) => sub(p, ca))
  const b = to.map((p) => sub(p, cb))
  const size = Math.sqrt(a.reduce((sum, p) => sum + dot(p, p), 0) / a.length)
  if (!(size > 0)) return null
  const { values } = spread(from)
  if (Math.sqrt(values[1]) < size * 0.02) return null // all in a line

  let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0
  for (let i = 0; i < a.length; i++) {
    const [ax, ay, az] = a[i]
    const [bx, by, bz] = b[i]
    const k = w[i]
    sxx += k * ax * bx; sxy += k * ax * by; sxz += k * ax * bz
    syx += k * ay * bx; syy += k * ay * by; syz += k * ay * bz
    szx += k * az * bx; szy += k * az * by; szz += k * az * bz
  }
  const n = [
    sxx + syy + szz, syz - szy, szx - sxz, sxy - syx,
    syz - szy, sxx - syy - szz, sxy + syx, szx + sxz,
    szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy,
    sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz,
  ]
  const { values: ev, vectors } = symmetricEigen(n, 4)
  let best = 0
  for (let i = 1; i < 4; i++) if (ev[i] > ev[best]) best = i
  const [qw, qx, qy, qz] = [vectors[best], vectors[4 + best], vectors[8 + best], vectors[12 + best]]
  const rotation: Mat3 = [
    qw * qw + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy),
    2 * (qx * qy + qw * qz), qw * qw - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - qw * qx),
    2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), qw * qw - qx * qx - qy * qy + qz * qz,
  ]

  let num = 0
  let den = 0
  for (let i = 0; i < a.length; i++) {
    num += w[i] * dot(b[i], mulVec(rotation, a[i]))
    den += w[i] * dot(a[i], a[i])
  }
  const strength = options.scalePrior !== undefined ? (options.scaleStrength ?? 0) : 0
  const scale = (num + strength * (options.scalePrior ?? 1)) / (den + strength)
  if (!(scale > 0)) return null
  const rc = mulVec(rotation, ca)
  const translation: Vec3 = [cb[0] - scale * rc[0], cb[1] - scale * rc[1], cb[2] - scale * rc[2]]
  const fit = { rotation, scale, translation }

  // Errors in the scan's own size: the chart was scaled by `scale` to meet it.
  const errors = from.map((p, i) => Math.hypot(...sub(apply(fit, p), to[i])) / scale)
  const maxError = Math.max(...errors)
  return { ...fit, meanError: errors.reduce((s, e) => s + e, 0) / errors.length, maxError, worst: errors.indexOf(maxError) }
}

/**
 * The normal of the plane through a jaw's pins (they sit on the biting surfaces), when the pins
 * spread across the arch well enough to define it; null for a few teeth or teeth in a row.
 * Its sign is arbitrary.
 */
export function pinPlaneNormal(points: Vec3[]): Vec3 | null {
  if (points.length < 4) return null
  const { values, smallest } = spread(points)
  if (!(values[1] > 0) || values[0] > values[1] * 0.05 || Math.sqrt(values[1]) < 3) return null
  const length = Math.hypot(...smallest)
  return [smallest[0] / length, smallest[1] / length, smallest[2] / length]
}

/**
 * The direction from the gums to the biting surface, read from the scan's own surface: the
 * average normal of the surface within `radius` of the pins. A pin sits in the middle of a
 * biting surface, which faces that way; the sides of the crown around it face away from each
 * other and cancel out. Works for a few teeth on one side, where the plane through the pins is
 * unknown. Null when nothing is near the pins.
 */
export function surfaceOcclusal(positions: Float32Array, normals: Float32Array, pins: Vec3[], radius: number): Vec3 | null {
  const r2 = radius * radius
  const sum: Vec3 = [0, 0, 0]
  const count = positions.length / 3
  // A large scan is sampled: the average needs only a few hundred thousand points.
  const stride = Math.max(1, Math.floor(count / 400_000))
  for (let v = 0; v < count; v += stride) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    for (const p of pins) {
      if ((x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2 <= r2) {
        sum[0] += normals[v * 3]
        sum[1] += normals[v * 3 + 1]
        sum[2] += normals[v * 3 + 2]
        break
      }
    }
  }
  const length = Math.hypot(...sum)
  return length > 0 ? [sum[0] / length, sum[1] / length, sum[2] / length] : null
}

export type Jaw = 'upper' | 'lower'

/** Which jaws a set of FDI numbers is on: 1x and 2x are upper, 3x and 4x lower. */
export function jawsOf(teeth: string[]): 'upper' | 'lower' | 'both' | null {
  const upper = teeth.some((t) => t[0] === '1' || t[0] === '2')
  const lower = teeth.some((t) => t[0] === '3' || t[0] === '4')
  return upper && lower ? 'both' : upper ? 'upper' : lower ? 'lower' : null
}

export const jawOfTooth = (tooth: string): Jaw => (tooth[0] === '1' || tooth[0] === '2' ? 'upper' : 'lower')

/** The middle of a set of points, flat x,y,z. */
export function meanPoint(points: Float32Array): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  const count = points.length / 3
  for (let i = 0; i < points.length; i += 3) {
    x += points[i]
    y += points[i + 1]
    z += points[i + 2]
  }
  return [x / count, y / count, z / count]
}

/** Gum outside a crown's outline is dropped up to this share of the crown's height above its neck. */
const OUTLINE_ZONE = 0.35
/** Up to this share of the crown's height, gum far outside the crown's fullest outline is dropped too. */
const OUTLINE_UPPER = 0.65
/** The extra room allowed there, mm. */
const OUTLINE_UPPER_MM = 1
/** Behind the last tooth of a row, past this many half widths of its neck from its middle, is gum (the crown bulges to about 1.35). */
const BEHIND_LAST = 1.7
/** Toward a missing tooth (toward the midline), past this many half widths of the neck is gum. */
const BESIDE_GAP = 1.45
/** How much bigger than the standard crown's neck a real one may be (a share, plus mm). */
const OUTLINE_SLACK = 1.45
const OUTLINE_SLACK_FRONT_TONGUE = 1.05
const OUTLINE_SLACK_MM = 0.6

/**
 * Each vertex's height above its tooth's gum line, tooth by tooth, for hiding the gums of a
 * scan placed in the skull. A vertex belongs to its nearest pin (within `reach`); it is moved
 * into that tooth's own frame (the standard tooth sitting where the scan's tooth is: neck at 0,
 * +y toward the biting surface, mm) and its height there is the value. Near the neck, anything
 * outside the crown's outline (gum around the tooth) gets -Infinity, as do vertices far from
 * every pin, so they are always hidden.
 *
 * @param positions the scan's points, in viewer units
 * @param pins pin points, flat x,y,z, in viewer units
 * @param frames each pin's tooth frame, 3 x 4 row by row (viewer units to the tooth's mm)
 * @param outlines per tooth: [half width, half depth, crown height] at the neck in mm, flags (1:
 *   no tooth next to it further from the midline, the last of its row or a gap; 2: none next to
 *   it toward the midline), and the height of its
 *   real gum line above the standard neck in mm, the height of the standard gum's papilla
 *   between teeth, and how much further out toward the cheek the real neck is (OUTLINE_FIELDS each)
 * @param reach the furthest a vertex may be from its pin, in viewer units
 */
export function heightsInTeeth(positions: Float32Array, pins: Float32Array, frames: Float32Array, outlines: Float32Array, reach: number): Float32Array {
  const count = positions.length / 3
  const pinCount = pins.length / 3
  const out = new Float32Array(count)
  const reach2 = reach * reach
  for (let v = 0; v < count; v++) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    let best = -1
    let bestD = reach2
    for (let i = 0; i < pinCount; i++) {
      const d = (x - pins[i * 3]) ** 2 + (y - pins[i * 3 + 1]) ** 2 + (z - pins[i * 3 + 2]) ** 2
      if (d <= bestD) {
        best = i
        bestD = d
      }
    }
    if (best < 0) {
      out[v] = -Infinity
      continue
    }
    const f = best * 12
    const lx = frames[f] * x + frames[f + 1] * y + frames[f + 2] * z + frames[f + 3]
    const rawY = frames[f + 4] * x + frames[f + 5] * y + frames[f + 6] * z + frames[f + 7]
    const o = best * OUTLINE_FIELDS
    const halfW = outlines[o]
    const halfD = outlines[o + 1]
    const crown = outlines[o + 2]
    const flags = Math.round(outlines[o + 3])
    const lastInRow = (flags & 1) !== 0
    const gapBefore = (flags & 2) !== 0
    // Heights from the patient's own gum line where it is known, else from the standard neck.
    const ly = rawY - outlines[o + 4]
    const lz = frames[f + 8] * x + frames[f + 9] * y + frames[f + 10] * z + frames[f + 11]
    // Behind the last tooth of a row nothing is tooth, at any height: the scan often runs on
    // over the gum behind the last molar (a thin strip of it would stand out as a flap).
    // The same on the side of a gap (a missing tooth toward the midline): its gum ridge would
    // stand as a ragged strip beside the crown.
    if ((lastInRow && lx > halfW * BEHIND_LAST + OUTLINE_SLACK_MM) || (gapBefore && lx < -(halfW * BESIDE_GAP + OUTLINE_SLACK_MM))) {
      out[v] = -Infinity
      continue
    }
    // Toward a gap, past the neck's width, only the crown's own depth is tooth: the ridge and the
    // palate's or tongue side's gum beside it go at any height.
    const gapSide = (lastInRow && lx > halfW) || (gapBefore && lx < -halfW)
    if (gapSide && Math.abs(lz) > halfD * 1.25 * OUTLINE_SLACK + OUTLINE_SLACK_MM) {
      out[v] = -Infinity
      continue
    }
    if (ly < crown * OUTLINE_ZONE) {
      // The crown widens from its neck to its full depth about halfway up; around it, toward
      // the cheek and the tongue (or palate), anything further out is gum.
      const widen = 1 + 0.25 * Math.min(1, Math.max(0, ly) / (crown * 0.45))
      // Between teeth the scan's own gum stays, since the standard gum's points between teeth
      // needn't line up with the patient's; behind the last tooth of a row it goes.
      // A front tooth's tongue side is hollow (shovel-shaped): the palate's gum sits close behind it.
      const front = outlines[o + 5] > 1.2 // the papilla height marks front teeth (see toothFrames)
      const b = halfD * widen * (lz < 0 && front ? OUTLINE_SLACK_FRONT_TONGUE : OUTLINE_SLACK) + OUTLINE_SLACK_MM + (lz > 0 ? Math.max(0, outlines[o + 6]) : 0)
      const outside = Math.abs(lz) > b * Math.sqrt(Math.max(0, 1 - (lx / (halfW * 2 + OUTLINE_SLACK_MM)) ** 2))
      const behind = (lastInRow && lx > halfW * widen * OUTLINE_SLACK + OUTLINE_SLACK_MM) || (gapBefore && lx < -(halfW * widen * OUTLINE_SLACK + OUTLINE_SLACK_MM))
      if (outside || behind) {
        out[v] = -Infinity
        continue
      }
    } else if (ly < crown * OUTLINE_UPPER) {
      // Higher up the crown is at its fullest; gum standing out further toward the cheek or the
      // tongue still goes (a flap of the fold above a short or prepared tooth), with room to spare.
      const front = outlines[o + 5] > 1.2
      const b = halfD * 1.25 * (lz < 0 && front ? OUTLINE_SLACK_FRONT_TONGUE : OUTLINE_SLACK) + OUTLINE_SLACK_MM + OUTLINE_UPPER_MM + (lz > 0 ? Math.max(0, outlines[o + 6]) : 0)
      if (Math.abs(lz) > b * Math.sqrt(Math.max(0, 1 - (lx / (halfW * 2 + OUTLINE_SLACK_MM)) ** 2))) {
        out[v] = -Infinity
        continue
      }
    }
    // Between teeth the standard gum rises into a papilla; the scan's own gum there goes under it.
    const papilla = outlines[o + 5] * Math.min(1, Math.max(0, (Math.abs(lx) / halfW - 0.85) / 0.25)) ** 2
    out[v] = ly - papilla
  }
  return out
}

/** The height profile the gum line is read from: from GUM_FROM mm below the standard neck, in GUM_STEP mm steps. */
const GUM_FROM = -4
const GUM_STEP = 0.5
const GUM_BINS = 30

/**
 * Where each scanned tooth's gum line is, in mm above its standard tooth's neck (in that tooth's
 * frame), read from the scan's own shape; NaN where it can't be read. On the cheek side, going
 * from the root toward the biting surface, the gum flares in steeply toward the tooth and then
 * the crown's side runs nearly straight: the gum line is where the steep slope ends. Front teeth
 * often have no clear bend; they are left to their neighbours (and the detector's neck point).
 * Also, per pin, how far out toward the cheek the crown's surface is there (mm, its frame): two
 * numbers per pin, [gum line, cheek side].
 */
export function gumLines(positions: Float32Array, pins: Float32Array, frames: Float32Array, outlines: Float32Array, reach: number): Float32Array {
  const pinCount = pins.length / 3
  const buckets = Array.from({ length: pinCount * GUM_BINS }, () => [] as number[])
  const reach2 = reach * reach
  const count = positions.length / 3
  const stride = Math.max(1, Math.floor(count / 600_000))
  for (let v = 0; v < count; v += stride) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    let best = -1
    let bestD = reach2
    for (let i = 0; i < pinCount; i++) {
      const d = (x - pins[i * 3]) ** 2 + (y - pins[i * 3 + 1]) ** 2 + (z - pins[i * 3 + 2]) ** 2
      if (d <= bestD) {
        best = i
        bestD = d
      }
    }
    if (best < 0) continue
    const f = best * 12
    const lx = frames[f] * x + frames[f + 1] * y + frames[f + 2] * z + frames[f + 3]
    const lz = frames[f + 8] * x + frames[f + 9] * y + frames[f + 10] * z + frames[f + 11]
    if (lz < 0 || Math.abs(lx) > outlines[best * OUTLINE_FIELDS] * 0.6) continue
    const ly = frames[f + 4] * x + frames[f + 5] * y + frames[f + 6] * z + frames[f + 7]
    const b = Math.floor((ly - GUM_FROM) / GUM_STEP)
    if (b >= 0 && b < GUM_BINS) buckets[best * GUM_BINS + b].push(lz)
  }
  const out = new Float32Array(pinCount * 2).fill(Number.NaN)
  for (let i = 0; i < pinCount; i++) {
    // The outer edge of the surface at each height (90th percentile, steady against stray points).
    const edge = Array.from({ length: GUM_BINS }, (_, b) => {
      const list = buckets[i * GUM_BINS + b]
      if (list.length < 5) return Number.NaN
      list.sort((p, q) => p - q)
      return list[Math.floor(list.length * 0.9)]
    })
    const crown = outlines[i * OUTLINE_FIELDS + 2]
    // A run of the edge moving in (at least one steep step, 0.5 mm in all), ended by a flat step.
    let steep = 0
    let drop = 0
    for (let b = 0; b < GUM_BINS - 1; b++) {
      const ly = GUM_FROM + (b + 1) * GUM_STEP
      if (ly > crown * 0.8) break
      const m = (edge[b + 1] - edge[b]) / GUM_STEP
      if (!Number.isFinite(m)) {
        steep = 0
        drop = 0
        continue
      }
      if (m <= -0.3) {
        if (m <= -0.5) steep++
        drop -= m * GUM_STEP
        continue
      }
      if (steep >= 1 && drop >= 0.5 && ly > -2.5) {
        out[i * 2] = GUM_FROM + b * GUM_STEP
        break
      }
      steep = 0
      drop = 0
    }
    // The cheek side just above the gum line (or the standard neck, when the line wasn't read).
    const at = Number.isFinite(out[i * 2]) ? out[i * 2] : 0
    const b = Math.round((at + 0.5 - GUM_FROM) / GUM_STEP)
    const sides = [edge[b], edge[b + 1]].filter(Number.isFinite)
    if (sides.length > 0) out[i * 2 + 1] = Math.min(...sides)
  }
  return out
}

/** Numbers per tooth in the `outlines` list given to heightsInTeeth and gumLines. */
export const OUTLINE_FIELDS = 7


const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)

/**
 * How red each vertex is: CIE Lab a* (green to red), from linear RGB vertex colours. Gums are
 * pink to red (a* about 20 to 45), teeth white to yellowish (a* about -2 to 8).
 */
export function rednessOf(colors: Float32Array): Float32Array {
  const count = colors.length / 3
  const out = new Float32Array(count)
  for (let v = 0; v < count; v++) {
    const r = colors[v * 3]
    const g = colors[v * 3 + 1]
    const b = colors[v * 3 + 2]
    // Linear sRGB to XYZ (D65), as fractions of the white point.
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    out[v] = 500 * (labF(x) - labF(y))
  }
  return out
}

/** The a* above which a vertex counts as gum, for a sensitivity from 0 (hide little) to 100 (hide a lot). */
export function rednessLimit(sensitivity: number) {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100
  return 28 - 22 * s
}

/**
 * The triangles to draw: those whose three corners all pass `keep(value) = value >= threshold`.
 * Works for an indexed mesh (`index`) and for one without (each three vertices are a triangle).
 * Writes the kept vertex numbers into `out` (big enough for every triangle; a new array when
 * left out) and returns that part of it.
 */
export function keptTriangles(index: Uint32Array | null, vertexCount: number, values: Float32Array, threshold: number, out?: Uint32Array): Uint32Array {
  const triangles = index ? index.length / 3 : Math.floor(vertexCount / 3)
  out ??= new Uint32Array(triangles * 3)
  let n = 0
  if (index) {
    for (let t = 0; t < triangles; t++) {
      const a = index[t * 3]
      const b = index[t * 3 + 1]
      const c = index[t * 3 + 2]
      if (values[a] >= threshold && values[b] >= threshold && values[c] >= threshold) {
        out[n++] = a
        out[n++] = b
        out[n++] = c
      }
    }
  } else {
    for (let t = 0; t < triangles; t++) {
      const a = t * 3
      if (values[a] >= threshold && values[a + 1] >= threshold && values[a + 2] >= threshold) {
        out[n++] = a
        out[n++] = a + 1
        out[n++] = a + 2
      }
    }
  }
  return out.subarray(0, n)
}

/** Pieces of the kept surface smaller than this (mm²) are dropped: loose bits of gum. */
export const MIN_PIECE_MM2 = 8
/** Passes of trimming triangles that hang by one edge (ragged flaps at the cut). */
const TRIM_PASSES = 2

/**
 * Tidies the triangles left after hiding the gums, for display: trims triangles that hang off
 * the cut by a single edge (thin flaps and jagged teeth along the border), then drops pieces no
 * longer joined to anything big (loose bits of gum). `kept` is three vertex numbers per triangle,
 * as keptTriangles gives; the result is a new, shorter list. The file is never changed.
 */
export function cleanTriangles(kept: Uint32Array, positions: Float32Array, unitsPerMm: number, same: Uint32Array | null = null): Uint32Array {
  const vertexCount = positions.length / 3
  // A file without shared corners (STL) repeats each corner per triangle: `same` names one of the
  // copies for each, so neighbours are found all the same.
  const c = same ? (v: number) => same[v] : (v: number) => v
  let tris = kept
  // Trim: a triangle with two or three edges on the border is an ear or a sliver.
  for (let pass = 0; pass < TRIM_PASSES; pass++) {
    const uses = new Map<number, number>()
    const edge = (p: number, q: number) => {
      const a = c(p)
      const b = c(q)
      return a < b ? a * vertexCount + b : b * vertexCount + a
    }
    for (let t = 0; t < tris.length; t += 3) {
      for (const k of [edge(tris[t], tris[t + 1]), edge(tris[t + 1], tris[t + 2]), edge(tris[t + 2], tris[t])]) uses.set(k, (uses.get(k) ?? 0) + 1)
    }
    const out = new Uint32Array(tris.length)
    let n = 0
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]
      const b = tris[t + 1]
      const d = tris[t + 2]
      const border = (uses.get(edge(a, b)) === 1 ? 1 : 0) + (uses.get(edge(b, d)) === 1 ? 1 : 0) + (uses.get(edge(d, a)) === 1 ? 1 : 0)
      if (border >= 2) continue
      out[n++] = a
      out[n++] = b
      out[n++] = d
    }
    if (n === tris.length) break
    tris = out.subarray(0, n)
  }
  // Pieces: join the corners of each triangle, then add up each piece's area.
  const parent = new Int32Array(vertexCount).fill(-1)
  const find = (v: number): number => {
    let r = v
    while (parent[r] >= 0 && parent[r] !== r) r = parent[r]
    while (parent[v] >= 0 && parent[v] !== r) {
      const next = parent[v]
      parent[v] = r
      v = next
    }
    return r
  }
  const join = (a: number, b: number) => {
    if (parent[a] < 0) parent[a] = a
    if (parent[b] < 0) parent[b] = b
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  for (let t = 0; t < tris.length; t += 3) {
    join(c(tris[t]), c(tris[t + 1]))
    join(c(tris[t]), c(tris[t + 2]))
  }
  const area = new Map<number, number>()
  const toMm2 = 1 / (unitsPerMm * unitsPerMm)
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3
    const b = tris[t + 1] * 3
    const d = tris[t + 2] * 3
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[d] - positions[a]
    const vy = positions[d + 1] - positions[a + 1]
    const vz = positions[d + 2] - positions[a + 2]
    const r = find(c(tris[t]))
    area.set(r, (area.get(r) ?? 0) + (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2) * toMm2)
  }
  const out = new Uint32Array(tris.length)
  let n = 0
  for (let t = 0; t < tris.length; t += 3) {
    if ((area.get(find(c(tris[t]))) ?? 0) < MIN_PIECE_MM2) continue
    out[n++] = tris[t]
    out[n++] = tris[t + 1]
    out[n++] = tris[t + 2]
  }
  return out.slice(0, n)
}

/** Rounds of smoothing along the cut edge (each a step in and a step back out, so it doesn't shrink). */
const EDGE_ROUNDS = 4
/** The most a point on the cut edge is moved for display, mm. */
const EDGE_MAX_MM = 0.35

/**
 * Smooths the cut edge for display: the points on the border of the kept triangles are each moved
 * a little toward the middle of their two neighbours along the border (Taubin's smoothing, which
 * keeps the edge where it is on the whole), so a cut through the triangles reads as a clean line
 * instead of a saw tooth. Returns the points moved and where to (the file never changes).
 */
export function smoothEdge(tris: Uint32Array, positions: Float32Array, unitsPerMm: number, same: Uint32Array | null = null): { indices: Uint32Array; positions: Float32Array } {
  const vertexCount = positions.length / 3
  const c = same ? (v: number) => same[v] : (v: number) => v
  const uses = new Map<number, number>()
  const key = (p: number, q: number) => {
    const a = c(p)
    const b = c(q)
    return a < b ? a * vertexCount + b : b * vertexCount + a
  }
  for (let t = 0; t < tris.length; t += 3) {
    for (const k of [key(tris[t], tris[t + 1]), key(tris[t + 1], tris[t + 2]), key(tris[t + 2], tris[t])]) uses.set(k, (uses.get(k) ?? 0) + 1)
  }
  const neighbours = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    const list = neighbours.get(a)
    if (list) list.push(b)
    else neighbours.set(a, [b])
  }
  for (const [k, n] of uses) {
    if (n !== 1) continue
    const a = Math.floor(k / vertexCount)
    const b = k % vertexCount
    link(a, b)
    link(b, a)
  }
  // Only points on a plain border (two neighbours along it) move; corners where borders meet stay.
  const moving = [...neighbours].filter(([, list]) => list.length === 2)
  const at = new Map<number, Vec3>()
  const read = (v: number): Vec3 => at.get(v) ?? [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]
  for (let round = 0; round < EDGE_ROUNDS * 2; round++) {
    const factor = round % 2 === 0 ? 0.5 : -0.53
    const next = new Map<number, Vec3>()
    for (const [v, [a, b]] of moving) {
      const p = read(v)
      const pa = read(a)
      const pb = read(b)
      next.set(v, [0, 1, 2].map((k) => p[k] + factor * ((pa[k] + pb[k]) / 2 - p[k])) as Vec3)
    }
    next.forEach((p, v) => at.set(v, p))
  }
  const limit = EDGE_MAX_MM * unitsPerMm
  const moved = new Map<number, Vec3>()
  for (const [v] of moving) {
    const p = at.get(v)!
    const d = [0, 1, 2].map((k) => p[k] - positions[v * 3 + k])
    const length = Math.hypot(d[0], d[1], d[2])
    const scale = length > limit ? limit / length : 1
    moved.set(v, [0, 1, 2].map((k) => positions[v * 3 + k] + d[k] * scale) as Vec3)
  }
  // Every copy of a moved corner moves with it.
  const copies: number[] = []
  if (same) {
    for (let v = 0; v < vertexCount; v++) if (moved.has(same[v])) copies.push(v)
  } else copies.push(...moved.keys())
  const indices = Uint32Array.from(copies)
  const out = new Float32Array(copies.length * 3)
  copies.forEach((v, i) => out.set(moved.get(c(v))!, i * 3))
  return { indices, positions: out }
}

/**
 * For each vertex, the first vertex at exactly the same place (a spatial hash on the coordinates'
 * bits; -0 counts as 0), so neighbouring triangles can be found on a surface whose corners are
 * repeated: an STL repeats each corner per triangle, some OBJ and PLY files split them by normal.
 */
export function sameCorners(positions: Float32Array): Uint32Array {
  const count = positions.length / 3
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, positions.length)
  let size = 1
  while (size < count * 2) size <<= 1
  const mask = size - 1
  const table = new Int32Array(size).fill(-1)
  const out = new Uint32Array(count)
  const same = (w: number, k: number, b: number) => (bits[w * 3 + k] === 0x80000000 ? 0 : bits[w * 3 + k]) === b
  for (let v = 0; v < count; v++) {
    const x = bits[v * 3] === 0x80000000 ? 0 : bits[v * 3]
    const y = bits[v * 3 + 1] === 0x80000000 ? 0 : bits[v * 3 + 1]
    const z = bits[v * 3 + 2] === 0x80000000 ? 0 : bits[v * 3 + 2]
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask
    for (;;) {
      const w = table[h]
      if (w < 0) {
        table[h] = v
        out[v] = v
        break
      }
      if (same(w, 0, x) && same(w, 1, y) && same(w, 2, z)) {
        out[v] = w
        break
      }
      h = (h + 1) & mask
    }
  }
  return out
}
