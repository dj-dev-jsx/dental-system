// A standard arch: where each tooth's biting surface sits, seen from above, for an average
// adult. Used to check that a numbering is the shape of a real arch, and on which side.

export type Arch = 'upper' | 'lower'

/** Average mesio-distal crown widths (mm), central incisor (1) to third molar (8). */
export const WIDTHS: Record<Arch, number[]> = {
  upper: [8.5, 6.5, 7.5, 7.0, 6.5, 10.0, 9.0, 8.5],
  lower: [5.0, 5.5, 7.0, 7.0, 7.0, 11.0, 10.5, 10.0],
}

/**
 * How wide across the arch each tooth type's top 3 mm is (mm), as the profile measures it:
 * incisors are thin edges, canines a point, premolars and molars broad tables. Medians over
 * the labelled scans (Teeth3DS sample) - a tooth-type cue for partial scans.
 */
export const DEPTHS: Record<Arch, number[]> = {
  upper: [2.9, 3.3, 4.1, 6.5, 5.8, 6.7, 8.2, 8.0],
  lower: [2.6, 2.7, 3.6, 5.8, 6.6, 7.1, 5.5, 5.5],
}

/** FDI numbers in arch order: patient's right distal to left distal. */
export const SLOTS: Record<Arch, string[]> = {
  upper: ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'],
  lower: ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'],
}

/** Position from the midline (1..8) of a slot 0..15. */
export const positionOf = (slot: number) => (slot < 8 ? 8 - slot : slot - 7)
/** -1 for the patient's right, +1 for the left. */
export const sideOf = (slot: number) => (slot < 8 ? -1 : 1)
export const widthOf = (arch: Arch, slot: number) => WIDTHS[arch][positionOf(slot) - 1]

/**
 * Shape of the arch through the teeth's biting-surface centres: a beta function (Braun et al.),
 * y = 3.0314 D ((1/2 + x/W)(1/2 - x/W))^0.8, with W the width between the second molars and D
 * the depth from the incisors to them; past the ends it carries straight on. Teeth sit along it
 * at their cumulative widths times `k` (the centre line is a little shorter than the contacts').
 * Calibrated on labelled scans (see the evaluation notes).
 */
export const SHAPE: Record<Arch, { W: number; D: number; k: number }> = {
  upper: { W: 46, D: 32, k: 1.05 },
  lower: { W: 52, D: 40, k: 1.05 },
}

/**
 * Template positions (mm) of the 16 slots in the patient's frame: x to the patient's left,
 * y forward (anterior), origin between the second molars.
 */
export function templatePositions(arch: Arch, shape = SHAPE[arch]): [number, number][] {
  const { W, D, k } = shape
  // Arc length table along the right half of the beta curve, from the midline outwards.
  const steps = 400
  const xs: number[] = [], ys: number[] = [], ss: number[] = []
  const f = (x: number) => 3.0314 * D * Math.pow(Math.max(0, (0.5 + x / W) * (0.5 - x / W)), 0.8)
  let s = 0
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * (W / 2)
    const y = f(x)
    if (i > 0) s += Math.hypot(x - xs[i - 1], y - ys[i - 1])
    xs.push(x)
    ys.push(y)
    ss.push(s)
  }
  const at = (len: number): [number, number] => {
    if (len >= s) return [W / 2, -(len - s)]
    let i = 1
    while (ss[i] < len) i++
    const t = (len - ss[i - 1]) / (ss[i] - ss[i - 1] || 1)
    return [xs[i - 1] + (xs[i] - xs[i - 1]) * t, ys[i - 1] + (ys[i] - ys[i - 1]) * t]
  }
  const widths = WIDTHS[arch]
  const out: [number, number][] = new Array(16)
  let acc = 0
  for (let p = 1; p <= 8; p++) {
    const len = (acc + widths[p - 1] / 2) * k
    acc += widths[p - 1]
    const [x, y] = at(len)
    out[8 - p] = [-x, y] // right side: slots 7 (11) down to 0 (18)
    out[7 + p] = [x, y] // left side: slots 8 (21) up to 15 (28)
  }
  return out
}

export type Fit2D = { cos: number; sin: number; scale: number; tx: number; ty: number; rms: number }

/**
 * Best rotation (no mirror), scale and shift taking `from` (2D) onto `to`, least squares.
 * `scaleRange` clamps the scale (an arch can't be half or twice the average size).
 */
export function fit2D(from: [number, number][], to: [number, number][], scaleRange: [number, number] = [0.8, 1.25]): Fit2D | null {
  const n = from.length
  if (n < 2) return null
  let fx = 0, fy = 0, tx = 0, ty = 0
  for (let i = 0; i < n; i++) {
    fx += from[i][0]
    fy += from[i][1]
    tx += to[i][0]
    ty += to[i][1]
  }
  fx /= n
  fy /= n
  tx /= n
  ty /= n
  let a = 0, b = 0, ff = 0
  for (let i = 0; i < n; i++) {
    const px = from[i][0] - fx, py = from[i][1] - fy
    const qx = to[i][0] - tx, qy = to[i][1] - ty
    a += px * qx + py * qy
    b += px * qy - py * qx
    ff += px * px + py * py
  }
  const r = Math.hypot(a, b)
  if (!(r > 0) || !(ff > 0)) return null
  const cos = a / r, sin = b / r
  const scale = Math.min(scaleRange[1], Math.max(scaleRange[0], r / ff))
  const ox = tx - scale * (cos * fx - sin * fy)
  const oy = ty - scale * (sin * fx + cos * fy)
  let e = 0
  for (let i = 0; i < n; i++) {
    const x = scale * (cos * from[i][0] - sin * from[i][1]) + ox
    const y = scale * (sin * from[i][0] + cos * from[i][1]) + oy
    e += (x - to[i][0]) ** 2 + (y - to[i][1]) ** 2
  }
  return { cos, sin, scale, tx: ox, ty: oy, rms: Math.sqrt(e / n) }
}
