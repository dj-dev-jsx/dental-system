// Placing a scan in the chart's standard skull, in two steps:
//
// 1. A rigid fit (turn, shift and one uniform scale) of the scan's tooth pins onto the same
//    teeth of the standard model. The scan is never changed: the model is moved and scaled to
//    meet it. Two priors keep it steady when the pins are few or all on one side of the arch:
//    the scan's own gum-to-biting direction must line up with the model's, and the scale is
//    drawn toward 1 (both are in millimetres; a whole arch can still pull it a little).
// 2. A smooth bend of the standard model (see warp.ts) so each pinned tooth's biting point lands
//    exactly on the pin and its gum line lands where the scanned crown meets the gum. The other
//    jaw's teeth follow the same arch shape across, and the bend fades out with distance from
//    the teeth, so the cranium is untouched.
//
// All in the chart's frame (millimetres; see archLayout), with the lower jaw swung open.
import { Matrix4, Vector3 } from 'three'
import { FDI_CODES, type FdiCode } from '../../dental-chart/model/fdi'
import { ARCH_ORDER } from './pinMath'
import { archPoint as standardArchPoint, JAW_HINGE, jawOf, toothBitePoint, toothMatrix, toothNeckPoint } from '../../dental-chart/three/archLayout'
import { parseFdi } from '../../dental-chart/model/fdi'
import { CERVICAL_DEPTH_SCALE, toothSpec } from '../../dental-chart/three/toothShape'
import { apply, type Fit, fitSimilarity, type Jaw, jawsOf, OUTLINE_FIELDS, type Similarity, type Vec3 } from './fitMath'
import type { Transform } from './pinMath'
import { type ArchCurve, type ArchForm, arcOf, archPoint, solveWarp, type Warp, warpPoint } from './warp'

export type ScanJaws = 'upper' | 'lower' | 'both'

/** A pin in the scan file's own millimetres. */
/** `neck`: where the crown meets the gum on the cheek side, when known, in the same coordinates. */
export type FilePin = { tooth: FdiCode; at: Vec3; neck?: Vec3 | null }

/** The standard model's size: the chart is built in millimetres from average adult teeth. */
export const STANDARD_UNITS_PER_MM = 1

/** How far along the gum-to-biting direction the prior's extra points sit, mm. */
const AXIS_LENGTH = 8
/** How much the direction prior counts against one pin. */
const AXIS_WEIGHT = 0.6
/**
 * How strongly the scale is drawn to true size (mm²). A short segment on one side says little
 * about size: held near true size. Pins on both sides of the arch measure it: nearly free.
 */
const SCALE_STRENGTH = 1500
const SCALE_STRENGTH_ARCH = 30
/** The arch form's width and depth are drawn toward the standard's this strongly (mm²), and kept within these. */
const ARCH_STRENGTH = 400
const ARCH_LIMITS: [number, number] = [0.8, 1.25]
/** The arch form is full strength within this distance of the teeth (mm) and gone by the second. */
const ARCH_REACH: [number, number] = [25, 70]
/** The local bend: a field about a tooth wide, full within 14 mm of a pinned tooth, gone by 36 mm. */
const BEND = { sigma: 4, near: 14, far: 36 }
/** Past the last pin the arch curve carries on at this share of the last two pins' trend, for at most CURVE_REACH mm. */
const CURVE_SLOPE = 0.5
/**
 * The most a gum line read from the scan's shape may move the standard one toward the biting
 * surface, or away from it (GUM_OFFSET_DOWN), mm. Beyond it the reading is taken for a miss.
 */
const GUM_OFFSET_UP = 5
/** The same for the automatic check's neck point (front teeth, back teeth). */
const NECK_UP: [number, number] = [2.5, 4]
/** For a short tooth (its tip SHORT_TOOTH_MM or more short of its neighbours'), whose neck point finds the margin of a prepared or worn crown. */
const NECK_OFFSET_UP = 8.5
const SHORT_TOOTH_MM = 2
const GUM_OFFSET_DOWN = 2
/** A neck point more than this above or below the median of its neighbours' (two either side) is taken for a miss, mm. */
const NECK_AGREE = 1.5
/** A gum line read from the scan's shape is trusted while within this of the automatic check's neck point, mm. */
const NECK_TRUST = 1.75
/** A front tooth without its own reading takes this share of its neighbours' gum line. */
const FRONT_SHARE = 0.4
const CURVE_REACH = 25
/** The gum margin sits this far above a tooth's neck in the chart's gum model (gumGeometry). */
const MARGIN_ABOVE_NECK = 0.5

/** A pin that misses its tooth by this much more (mm) than its neighbours do is taken for a wrong number. */
const OUTLIER_MM = 5
/** Fewer pins than this can't place the scan (two will do when the biting direction is known). */
export const MIN_PINS = 2
/** Below this many pins on an arch the placement is shaky: say so. */
export const PINS_FOR_GOOD_FIT = 4

/** The lower jaw's swing about its hinge. */
export function hinge(open: number) {
  const [x, y, z] = JAW_HINGE
  return new Matrix4().makeTranslation(x, y, z).multiply(new Matrix4().makeRotationX(open)).multiply(new Matrix4().makeTranslation(-x, -y, -z))
}

type StandardTooth = { bite: Vector3; neck: Vector3 }
let standard: Map<FdiCode, StandardTooth> | null = null

/** Each standard tooth's biting point and neck, jaw closed. Worked out once. */
function standardTeeth() {
  standard ??= new Map(FDI_CODES.map((code) => [code, { bite: toothBitePoint(code), neck: toothNeckPoint(code) }]))
  return standard
}

const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** One standard tooth in the chart's frame with the jaw swung `open`: biting point, gum-line point and gum-to-biting direction. */
export function standardTooth(code: FdiCode, open: number) {
  const { bite, neck } = standardTeeth().get(code)!
  const lower = jawOf(code) === 'lower'
  const swing = hinge(lower ? open : 0)
  const axis: Vec3 = lower ? v3(new Vector3(0, 1, 0).transformDirection(swing)) : [0, -1, 0]
  const b = v3(bite.clone().applyMatrix4(swing))
  const n = v3(neck.clone().applyMatrix4(swing))
  const margin = add(n, scale(axis, MARGIN_ABOVE_NECK))
  return { bite: b, margin, axis, crown: dot(sub(b, margin), axis) }
}

/** The tooth in the same place on the other jaw: 16 ↔ 46, 21 ↔ 31. */
export const opposite = (code: FdiCode) => `${({ 1: 4, 2: 3, 3: 2, 4: 1 } as Record<string, number>)[code[0]]}${code[1]}` as FdiCode

export type Placement = {
  jaws: ScanJaws
  /** How far the lower jaw is open (radians). */
  open: number
  /** The rigid step, file → chart. Its errors are over the pins only. */
  fit: Fit
  /**
   * The bend of the standard model (chart → chart, the arch form included), one per jaw: each
   * jaw's teeth, gum and bone follow only their own control points, so the upper teeth's bend
   * never pulls at the lower teeth just below them (the jaws are close at the back). Null when
   * there was nothing to bend.
   */
  warp: Record<Jaw, Warp | null>
  /** The whole-arch step: how much wider and deeper the patient's arch is than the standard one. */
  arch: ArchForm
  /** The pins in the chart's frame (after the rigid step). */
  targets: Map<FdiCode, Vec3>
  /**
   * How far each tooth's real gum line (its neck point) sits from the standard one, toward the
   * biting surface, in the chart's mm; the standard gum is moved there and the scan cut there.
   */
  gumOffsets: Map<FdiCode, number>
  /** How much further out toward the cheek each scanned tooth's neck is than the standard one's (mm). */
  bulges: Map<FdiCode, number>
  /** Pins left out of the fit and the bend: far from where their number belongs (probably the wrong number). */
  outliers: FdiCode[]
  /** How far the bent model's teeth still are from the pins used, on average, in the scan's mm (near 0). */
  miss: number
}

/**
 * The pin whose miss (after the fit) differs most from its neighbours' along the arch, and by
 * how much in the scan's millimetres. Null with fewer than three pins on every jaw.
 */
function leastConsistent(pins: FilePin[], fit: Similarity, open: number): { pin: FilePin; by: number } | null {
  let best: { pin: FilePin; by: number } | null = null
  for (const jaw of ['upper', 'lower'] as const) {
    const order = ARCH_ORDER[jaw]
    const row = pins.filter((p) => jawOf(p.tooth) === jaw).sort((a, b) => order.indexOf(a.tooth) - order.indexOf(b.tooth))
    if (row.length < 3) continue
    const miss = row.map((p) => sub(apply(fit, p.at), standardTooth(p.tooth, open).bite))
    row.forEach((pin, i) => {
      const near = [miss[i - 1], miss[i + 1]].filter(Boolean)
      const expected = scale(near.reduce((sum, m) => add(sum, m), [0, 0, 0] as Vec3), 1 / near.length)
      // A tooth at an end has one neighbour, and a smooth difference in arch shape grows toward
      // the ends: allow it half as much again.
      const end = near.length === 1 ? 1.5 : 1
      const by = Math.hypot(...sub(miss[i], expected)) / fit.scale / end
      if (!best || by > best.by) best = { pin, by }
    })
  }
  return best
}

/** The rigid step for a set of pins, steadied by the jaws' directions and the size prior. */
function rigidFit(pins: FilePin[], axes: Partial<Record<Jaw, Vec3>>, open: number): Similarity | null {
  const from: Vec3[] = []
  const to: Vec3[] = []
  const weights: number[] = []
  for (const pin of pins) {
    const t = standardTooth(pin.tooth, open)
    from.push(pin.at)
    to.push(t.bite)
    weights.push(1)
    const axis = axes[jawOf(pin.tooth)]
    if (axis) {
      // "Toward the gums from this pin" must point the same way on the scan and on the model.
      from.push(sub(pin.at, scale(axis, AXIS_LENGTH)))
      to.push(sub(t.bite, scale(t.axis, AXIS_LENGTH)))
      weights.push(AXIS_WEIGHT)
    }
  }
  if (pins.length < MIN_PINS || from.length < 3) return null
  return fitSimilarity(from, to, { weights, scalePrior: STANDARD_UNITS_PER_MM, scaleStrength: spansArch(pins) ? SCALE_STRENGTH_ARCH : SCALE_STRENGTH })
}

/**
 * Places a scan from its pins. `axes` is each jaw's gum-to-biting direction in the scan's
 * coordinates, when known (from the detector, or the surface around the pins); without it three
 * pins are needed and nothing keeps the turn steady. `gumShift` moves the scanned teeth's gum
 * line toward the roots (mm; negative toward the biting surfaces), for a patient whose gums sit
 * higher or lower on the teeth than the standard model's. Null when it can't be done.
 */
export function placeScan(
  pins: FilePin[],
  axes: Partial<Record<Jaw, Vec3>>,
  openFor: (jaws: ScanJaws) => number,
  gumShift = 0,
  measured?: ReadonlyMap<FdiCode, number>,
  cheeks?: ReadonlyMap<FdiCode, number>,
): Placement | null {
  const jaws = jawsOf(pins.map((p) => p.tooth))
  if (!jaws) return null
  const open = openFor(jaws)
  if (pins.length < MIN_PINS) return null
  const errorsOf = (f: Similarity) => pins.map((pin) => Math.hypot(...sub(apply(f, pin.at), standardTooth(pin.tooth, open).bite)) / f.scale)

  // A robust fit. A real arch differs from the standard one smoothly (wider, narrower, flatter),
  // so neighbouring pins miss their teeth by similar amounts; a tooth with the wrong number
  // misses by about a tooth's width more than its neighbours. Drop the pin that disagrees most
  // with its neighbours while it disagrees by more than OUTLIER_MM, and refit; keep at least half.
  let used = pins
  let rigid = rigidFit(used, axes, open)
  if (!rigid) return null
  const keep = Math.max(MIN_PINS, Math.ceil(pins.length / 2))
  while (used.length > keep) {
    const worst = leastConsistent(used, rigid, open)
    if (!worst || worst.by <= OUTLIER_MM) break
    const next = used.filter((p) => p !== worst.pin)
    const refit = rigidFit(next, axes, open)
    if (!refit) break
    used = next
    rigid = refit
  }
  const inliers = new Set(used.map((p) => p.tooth))
  const outliers = pins.map((p) => p.tooth).filter((t) => !inliers.has(t))
  // Errors over every pin, in the scan's millimetres.
  const errors = errorsOf(rigid)
  const maxError = Math.max(...errors)
  const inlierErrors = errors.filter((_, i) => inliers.has(pins[i].tooth))
  const fit: Fit = { ...rigid, meanError: inlierErrors.reduce((s, e) => s + e, 0) / inlierErrors.length, maxError, worst: errors.indexOf(maxError) }

  const targets = new Map<FdiCode, Vec3>()
  for (const pin of pins) targets.set(pin.tooth, apply(fit, pin.at))

  // The whole arch first: the standard arch made as wide and as deep as the patient's, so the
  // jaws, gums, the other arch and the teeth beyond the scan follow the real arch's shape.
  const arch = archFormFor(used, targets, open)

  // Then the bend, for the last millimetres: each pinned tooth's biting point onto its pin, its
  // gum line with it (the tooth moves as a whole, so the standard gum meets the scanned crown
  // where the standard crown would; the scan's gums are hidden along the same outline, see
  // toothFrames). Only the pins that agree with the fit bend the model.
  const src: Record<Jaw, Vec3[]> = { upper: [], lower: [] }
  const dst: Record<Jaw, Vec3[]> = { upper: [], lower: [] }
  const gumOffsets = gumLineOffsets(used, targets, fit, arch, open, measured)
  const bulges = new Map<FdiCode, number>()
  for (const pin of used) {
    const t = standardTooth(pin.tooth, open)
    const target = targets.get(pin.tooth)!
    const rest = sub(target, archPoint(arch, t.bite))
    const margin = add(archPoint(arch, t.margin), rest)
    const offset = gumOffsets.get(pin.tooth) ?? 0
    // Where the real neck's cheek side is, the standard gum's goes too (so it covers the cut edge).
    const bulge = bulgeOf(pin.tooth, cheeks)
    if (bulge !== 0) bulges.set(pin.tooth, bulge)
    const own = jawOf(pin.tooth)
    src[own].push(t.bite, t.margin)
    dst[own].push(target, add(add(margin, scale(t.axis, offset - gumShift)), outwardInChart(pin.tooth, open, bulge)))
    // The other jaw is not bent tooth by tooth: it follows the arch form and its smooth curve,
    // which keep the normal bite; one scanned tooth standing out of line doesn't drag its
    // opposite out of line too.
  }
  const warp = { upper: solveWarp(src.upper, dst.upper, BEND, arch), lower: solveWarp(src.lower, dst.lower, BEND, arch) }
  let miss = 0
  for (const pin of used) {
    const bend = warp[jawOf(pin.tooth)]
    const bite = standardTooth(pin.tooth, open).bite
    miss += Math.hypot(...sub(bend ? warpPoint(bend, bite) : bite, targets.get(pin.tooth)!))
  }
  miss /= used.length * fit.scale
  return { jaws, open, fit, warp, arch, targets, outliers, gumOffsets, bulges, miss }
}

/**
 * For hiding a scan's gums tooth by tooth: each tooth's frame (viewer coordinates to the
 * standard tooth's own millimetres: neck at 0, +y toward the biting surface) and the outline of
 * its neck. The scan is matched to the standard tooth sitting where the bend put it, so a scanned
 * crown is kept down to the same gum line the standard gum is bent to, and gum outside the
 * crown's outline near that line is dropped.
 *
 * Frames are 3 x 4, row by row; outlines are [half width, half depth, crown height] in mm,
 * whether the tooth is the last of its row (1 or 0), and how far its real gum line sits above
 * the standard neck (mm, see gumOffsets).
 */
export function toothFrames(placement: Placement, teeth: FdiCode[], transform: Transform): { frames: Float32Array; outlines: Float32Array } {
  const frames = new Float32Array(teeth.length * 12)
  const outlines = new Float32Array(teeth.length * OUTLINE_FIELDS)
  const { fit, warp, open } = placement
  const r = fit.rotation
  // view → file → chart (before the bend)
  const k = transform.scale
  const sr = r.map((v) => v * fit.scale)
  const [tx, ty, tz] = fit.translation
  const viewToChart = new Matrix4()
    .set(sr[0], sr[1], sr[2], tx, sr[3], sr[4], sr[5], ty, sr[6], sr[7], sr[8], tz, 0, 0, 0, 1)
    .multiply(new Matrix4().makeTranslation(...transform.centre))
    .multiply(new Matrix4().makeScale(1 / k, 1 / k, 1 / k))
  teeth.forEach((code, i) => {
    const { bite } = standardTooth(code, open)
    const bend = warp[jawOf(code)]
    const moved = placement.targets.get(code) ?? (bend ? warpPoint(bend, bite) : bite)
    const unmove = new Matrix4().makeTranslation(bite[0] - moved[0], bite[1] - moved[1], bite[2] - moved[2])
    const unswing = jawOf(code) === 'lower' ? hinge(open).invert() : new Matrix4()
    const m = toothMatrix(code).invert().multiply(unswing).multiply(unmove).multiply(viewToChart)
    const e = m.elements // column-major
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) frames[i * 12 + row * 4 + col] = e[col * 4 + row]
    const { position } = parseFdi(code)
    const spec = toothSpec(jawOf(code), position)
    // No tooth next to it further from the midline: the last of its row, or a gap.
    const last = position === 8 || !teeth.includes(`${code[0]}${position + 1}` as FdiCode)
    // The next tooth toward the midline (across it for a central incisor) isn't there: a gap.
    const mesial = (position === 1 ? `${({ 1: 2, 2: 1, 3: 4, 4: 3 } as Record<string, number>)[code[0]]}1` : `${code[0]}${position - 1}`) as FdiCode
    const gapBefore = !teeth.includes(mesial)
    outlines.set(
      [(spec.width / 2) * CERVICAL_DEPTH_SCALE, (spec.depth / 2) * CERVICAL_DEPTH_SCALE, spec.crown, (last ? 1 : 0) + (gapBefore ? 2 : 0), placement.gumOffsets.get(code) ?? 0, position <= 3 ? 1.5 : 1, placement.bulges.get(code) ?? 0],
      i * OUTLINE_FIELDS,
    )
  })
  return { frames, outlines }
}


/** Whether the pins reach round the arch: teeth on both sides, at least one canine or further back. */
function spansArch(pins: FilePin[]) {
  const side = (q: string[]) => pins.some((p) => q.includes(p.tooth[0]) && Number(p.tooth[1]) >= 3)
  return side(['1', '4']) && side(['2', '3'])
}

/** Least squares for target = k * value + shift, with k drawn toward 1 by `strength`. */
function scaleAndShift(values: number[], targets: number[], strength: number): [number, number] {
  const n = values.length
  const mv = values.reduce((s, v) => s + v, 0) / n
  const mt = targets.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (values[i] - mv) * (targets[i] - mt)
    sxx += (values[i] - mv) ** 2
  }
  const k = Math.min(ARCH_LIMITS[1], Math.max(ARCH_LIMITS[0], (sxy + strength) / (sxx + strength)))
  return [k, mt - k * mv]
}

/**
 * The whole-arch step: how much wider (across the face) and deeper (front to back, about the
 * front of the arch) the patient's arch is than the standard one, from the pins after the rigid
 * fit. Teeth on one side say little about width, so both are drawn toward the standard's.
 */
function archFormFor(pins: FilePin[], targets: Map<FdiCode, Vec3>, open: number): ArchForm {
  const bites = pins.map((p) => standardTooth(p.tooth, open).bite)
  const goals = pins.map((p) => targets.get(p.tooth)!)
  const jaw = jawOf(pins[0].tooth)
  const front = (jaw === 'upper' ? (['11', '21'] as FdiCode[]) : (['41', '31'] as FdiCode[])).map((c) => standardTooth(c, open).bite[2])
  const cz = (front[0] + front[1]) / 2
  const [ax, tx] = scaleAndShift(bites.map((b) => b[0]), goals.map((g) => g[0]), ARCH_STRENGTH)
  const [az, tz0] = scaleAndShift(bites.map((b) => b[2] - cz), goals.map((g) => g[2] - cz), ARCH_STRENGTH)
  const ty = goals.reduce((s, g, i) => s + g[1] - bites[i][1], 0) / goals.length
  const anchors = new Float64Array(FDI_CODES.flatMap((c) => standardTooth(c, open).bite))
  const form: ArchForm = { ax, az, cz, t: [tx, ty, tz0], anchors, near: ARCH_REACH[0], far: ARCH_REACH[1], curve: null }
  form.curve = archCurveFor(jaw, pins, bites, goals, form)
  return form
}

/** The standard arch seen from above on the patient's left, every millimetre, for one jaw. */
function archPath(jaw: Jaw) {
  const xz: number[] = []
  const ss: number[] = []
  for (let s = 0; s <= 72; s += 1) {
    const { position } = standardArchPoint(jaw, s, 1)
    xz.push(position.x, position.z)
    ss.push(s)
  }
  return { path: Float64Array.from(xz), pathS: Float64Array.from(ss) }
}

/** How far along the arch the curve looks for its trend at each tooth (mm, a Gaussian's width): about a molar and a half. */
const CURVE_WIDTH = 9
/** A tooth whose offset differs from the trend of its neighbours by more than this (mm) counts less, down to nothing at twice it. */
const CURVE_ODD = 2.5

/**
 * The arch curve's offset at each tooth, smoothed along the arch: a straight-line trend through
 * its neighbours, weighted by distance along the arch (local linear regression), then once more
 * with any tooth far off that trend counting less. A real arch bends smoothly; one tooth out of
 * line (crowded, or numbered wrongly) is left to the local bend, so the standard teeth beyond and
 * on the other jaw follow the arch, not that tooth.
 */
function smoothAlong(rows: { s: number; offset: Vec3; n: number }[]): Vec3[] {
  const fitAt = (i: number, trust: number[]): Vec3 => {
    const out: Vec3 = [0, 0, 0]
    let sw = 0
    let ss = 0
    let sss = 0
    const w = rows.map((r, j) => r.n * trust[j] * Math.exp(-(((r.s - rows[i].s) / CURVE_WIDTH) ** 2) / 2))
    rows.forEach((r, j) => {
      sw += w[j]
      ss += w[j] * (r.s - rows[i].s)
      sss += w[j] * (r.s - rows[i].s) ** 2
    })
    if (sw <= 1e-9) return rows[i].offset
    // A little ridge on the slope so a lone tooth (or two close ones) gives a flat trend, not a wild one.
    const det = sw * (sss + 4) - ss * ss
    for (let k = 0; k < 3; k++) {
      let sy = 0
      let sxy = 0
      rows.forEach((r, j) => {
        sy += w[j] * r.offset[k]
        sxy += w[j] * (r.s - rows[i].s) * r.offset[k]
      })
      // Intercept at this tooth (x = 0 here).
      out[k] = ((sss + 4) * sy - ss * sxy) / det
    }
    return out
  }
  if (rows.length < 3) return rows.map((r) => r.offset)
  const once = rows.map((_, i) => fitAt(i, rows.map(() => 1)))
  // How far each tooth is from the trend of the others (left out).
  const trust = rows.map((r, i) => {
    const others = rows.map((_, j) => (j === i ? 0 : 1))
    const odd = Math.hypot(...sub(r.offset, fitAt(i, others)))
    const t = Math.min(1, Math.max(0, (odd - CURVE_ODD) / CURVE_ODD))
    return 1 - t * t * (3 - 2 * t)
  })
  return trust.every((t) => t === 1) ? once : rows.map((_, i) => fitAt(i, trust))
}

/**
 * The arch-curve match: what the pins still miss after the width and depth, along the arch.
 * Past the last pin on each side it carries on along the trend of the last two (half as steep,
 * at most CURVE_REACH mm further), so the teeth beyond the scan follow the patient's arch.
 */
function archCurveFor(jaw: Jaw, pins: FilePin[], bites: Vec3[], goals: Vec3[], form: ArchForm): ArchCurve | null {
  if (pins.length < 2) return null
  const table = archPath(jaw)
  const draft: ArchCurve = { ...table, knots: new Float64Array(), offsets: new Float64Array(), slopes: [[0, 0, 0], [0, 0, 0]], reach: 0 }
  const plain = { ...form, curve: null }
  const rows = bites
    .map((bite, i) => {
      const formed = archPoint(plain, bite)
      const at = arcOf(draft, bite[0], bite[2])
      return { s: at.share >= 0.5 ? at.left : at.right, offset: sub(goals[i], formed) }
    })
    .sort((a, b) => a.s - b.s)
  // Two pins at the same place along the arch (both jaws) are averaged.
  const merged: { s: number; offset: Vec3; n: number }[] = []
  for (const row of rows) {
    const last = merged.at(-1)
    if (last && Math.abs(last.s - row.s) < 1) {
      last.offset = scale(add(scale(last.offset, last.n), row.offset), 1 / (last.n + 1))
      last.n++
    } else merged.push({ ...row, n: 1 })
  }
  const smooth = smoothAlong(merged)
  const knots = Float64Array.from(merged.map((m) => m.s))
  const offsets = Float64Array.from(smooth.flat())
  const slope = (i: number, j: number): Vec3 => {
    if (merged.length < 2) return [0, 0, 0]
    const d = merged[j].s - merged[i].s
    return d === 0 ? [0, 0, 0] : scale(sub(smooth[j], smooth[i]), CURVE_SLOPE / d)
  }
  const n = merged.length
  return { ...table, knots, offsets, slopes: [slope(0, Math.min(1, n - 1)), slope(Math.max(0, n - 2), n - 1)], reach: CURVE_REACH }
}


/**
 * How far each tooth's real gum line sits from the standard one, toward the biting surface (mm,
 * chart frame), read from the scan's shape (gumLines) or from the automatic check's neck points. A neck point implausibly far
 * from the standard gum line is ignored; a tooth with neither takes its neighbours' median.
 */
function gumLineOffsets(
  pins: FilePin[],
  targets: Map<FdiCode, Vec3>,
  fit: Similarity,
  arch: ArchForm,
  open: number,
  measured?: ReadonlyMap<FdiCode, number>,
): Map<FdiCode, number> {
  // Read from the scan's own shape (gumLines): kept as read, unless the automatic check's neck
  // point (about a millimetre off as a rule) says otherwise by more than NECK_TRUST; a prepared
  // or worn tooth's margin or a fold of gum can pass for the gum line's bend.
  const out = new Map<FdiCode, number>()
  const necks = new Map<FdiCode, number>()
  // A neck point is used only when it sits at about the height of its neighbours' (the gum line
  // runs smoothly along the arch, even past a short, prepared tooth); the detector's rare misses
  // are several millimetres off.
  const placedNecks = pins.filter((p) => p.neck).map((p) => ({ tooth: p.tooth, at: apply(fit, p.neck!) }))
  const placedBites = pins.map((p) => ({ tooth: p.tooth, at: apply(fit, p.at) }))
  /** How far `at` sits from the median of the neighbours' points (two either side), along `axis`; null with too few. */
  const fromNeighbours = (list: { tooth: FdiCode; at: Vec3 }[], tooth: FdiCode, at: Vec3, axis: Vec3) => {
    const order = ARCH_ORDER[jawOf(tooth)]
    const i = order.indexOf(tooth)
    const near = list
      .filter((q) => q.tooth !== tooth && order.includes(q.tooth) && Math.abs(order.indexOf(q.tooth) - i) <= 2)
      .map((q) => dot(q.at, axis))
      .sort((a, b) => a - b)
    if (near.length < 2) return null
    const median = near.length % 2 ? near[near.length >> 1] : (near[near.length / 2 - 1] + near[near.length / 2]) / 2
    return dot(at, axis) - median
  }
  for (const pin of pins) {
    if (!pin.neck) continue
    const t = standardTooth(pin.tooth, open)
    const neck = apply(fit, pin.neck)
    const off = fromNeighbours(placedNecks, pin.tooth, neck, t.axis)
    if (off !== null && Math.abs(off) > NECK_AGREE) continue
    // A tooth whose tip sits well short of its neighbours' (prepared, worn or broken) may show
    // much less crown than the standard one; otherwise the usual limits hold.
    const tip = fromNeighbours(placedBites, pin.tooth, apply(fit, pin.at), t.axis)
    const short = off !== null && tip !== null && -tip >= SHORT_TOOTH_MM
    const up = short ? NECK_OFFSET_UP : Number(pin.tooth[1]) <= 3 ? NECK_UP[0] : NECK_UP[1]
    const margin = add(archPoint(arch, t.margin), sub(targets.get(pin.tooth)!, archPoint(arch, t.bite)))
    const offset = dot(sub(neck, margin), t.axis)
    if (offset <= up && offset >= -GUM_OFFSET_DOWN) necks.set(pin.tooth, offset)
  }
  for (const pin of pins) {
    const read = measured?.get(pin.tooth)
    const neck = necks.get(pin.tooth)
    const readOk = read !== undefined && read >= -GUM_OFFSET_DOWN && read <= GUM_OFFSET_UP
    if (readOk && (neck === undefined || Math.abs(read - neck) <= NECK_TRUST)) out.set(pin.tooth, read)
    else if (neck !== undefined) out.set(pin.tooth, neck)
  }
  // Else from the measured teeth up to two places either side: their median, less for a front
  // tooth (a front tooth's crown shows more of its height than a back tooth's).
  for (const jaw of ['upper', 'lower'] as const) {
    const order = ARCH_ORDER[jaw]
    const known = new Map(out)
    order.forEach((tooth, i) => {
      if (known.has(tooth) || !pins.some((p) => p.tooth === tooth)) return
      const near = order
        .slice(Math.max(0, i - 2), i + 3)
        .filter((t) => known.has(t))
        .map((t) => known.get(t)!)
        .sort((a, b) => a - b)
      if (near.length === 0) return
      const median = near.length % 2 ? near[near.length >> 1] : (near[near.length / 2 - 1] + near[near.length / 2]) / 2
      out.set(tooth, median * (Number(tooth[1]) <= 3 ? FRONT_SHARE : 1))
    })
  }
  return out
}


/** The standard neck's cheek side, as a share of half the tooth's depth (toothShape's crown at its neck). */
const NECK_CHEEK = 0.8
/** The most the standard gum is moved out (or in) to meet a real neck, mm. */
const MAX_BULGE: [number, number] = [-1.5, 3]

/** How much further out the scanned neck's cheek side is than the standard neck's, mm (0 when unknown). */
function bulgeOf(code: FdiCode, cheeks?: ReadonlyMap<FdiCode, number>) {
  const cheek = cheeks?.get(code)
  if (cheek === undefined) return 0
  const spec = toothSpec(jawOf(code), parseFdi(code).position)
  return Math.min(MAX_BULGE[1], Math.max(MAX_BULGE[0], cheek - (spec.depth / 2) * NECK_CHEEK))
}

/** `mm` toward the cheek from a tooth's neck, as a shift in the chart's frame. */
function outwardInChart(code: FdiCode, open: number, mm: number): Vec3 {
  if (mm === 0) return [0, 0, 0]
  const m = jawOf(code) === 'lower' ? hinge(open).multiply(toothMatrix(code)) : toothMatrix(code)
  const a = new Vector3(0, 0, mm).applyMatrix4(m)
  const b = new Vector3(0, 0, 0).applyMatrix4(m)
  return [a.x - b.x, a.y - b.y, a.z - b.z]
}
