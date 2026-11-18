// Cutting the arch into teeth and numbering them. Candidate cuts are the dips in the crown
// profile; a dynamic programme picks cuts and FDI numbers together so each tooth has a plausible
// width for its type, missing teeth leave gaps of the right size, and dips are used where they
// are clear. Every way of starting the numbering (which tooth comes first, which direction,
// upper or lower) is tried, and each result is checked against the shape of a standard arch.
import type { ArchCurve } from './arch'
import { type Profile, smoothed, valleys } from './profile'
import { type Arch, DEPTHS, fit2D, type Fit2D, positionOf, SHAPE, SLOTS, templatePositions, WIDTHS } from './template'

export type Cut = { at: number; strength: number }

/** A stretch of the arch [from, to] (sample indices) given a tooth number, or a gap. */
export type Segment = { from: number; to: number; slot: number; gap?: number[] }

export type Hypothesis = {
  arch: Arch
  reversed: boolean
  scale: number
  segments: Segment[]
  dp: number
  shape: number
  spee: number
  score: number
  fit: Fit2D | null
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/**
 * How much each sample looks like it has a crown (or a prep or implant) (0..1): the top stands
 * at least ~4.5 mm above the gums beside it (a toothless ridge doesn't) or reaches near the
 * occlusal plane, and isn't far below it.
 */
export function crownPresence(p: Profile): Float64Array {
  const out = new Float64Array(p.n)
  const r = Math.round(2 / p.step)
  const peak = new Float64Array(p.n)
  for (let k = 0; k < p.n; k++) {
    let m = 0
    for (let j = Math.max(0, k - r); j <= Math.min(p.n - 1, k + r); j++) m = Math.max(m, p.prominence[j])
    peak[k] = m
  }
  const prom = smoothed(peak, 2)
  const h = smoothed(p.height, 2)
  // Either cue is enough: standing well above its gums, or reaching close to the occlusal plane
  // (upper front teeth have the palate rising right behind them, so they barely stand out from
  // their cross-section; toothless gaps on the test scans sat 5 to 11 mm below the plane).
  for (let k = 0; k < p.n; k++) out[k] = Math.max(sigmoid((prom[k] - 4.5) / 0.8), sigmoid((h[k] + 3.5) / 0.7)) * sigmoid((h[k] + 7) / 1)
  return out
}

/**
 * Candidate places between teeth: dips in the crown profile (strength from how deep the dip is
 * against the crowns beside it), the edges of toothless stretches, and the two ends.
 */
export function candidateCuts(p: Profile, presence: Float64Array): Cut[] {
  const reach = Math.round(4 / p.step)
  const out: Cut[] = [{ at: 0, strength: 1 }]
  for (const signal of [p.lmass, p.shallow]) {
    const sm = smoothed(signal, 1)
    for (const v of valleys(sm, reach)) {
      let peak = 0
      for (let k = Math.max(0, v.at - 2 * reach); k <= Math.min(p.n - 1, v.at + 2 * reach); k++) peak = Math.max(peak, sm[k])
      const strength = Math.min(1, v.depth / Math.max(1e-6, 0.6 * peak))
      if (strength > 0.06 && v.at > 2 && v.at < p.n - 3) out.push({ at: v.at, strength })
    }
  }
  // Notches in the top line (between incisal edges and marginal ridges).
  const top = smoothed(p.height, 1)
  for (const v of valleys(top, Math.round(3 / p.step))) {
    if (presence[v.at] < 0.5 || v.at <= 2 || v.at >= p.n - 3) continue
    const strength = Math.min(1, v.depth / 1.5)
    if (strength > 0.15) out.push({ at: v.at, strength: 0.8 * strength })
  }
  for (let k = 1; k < p.n; k++) {
    if ((presence[k] > 0.5) !== (presence[k - 1] > 0.5)) out.push({ at: k, strength: 0.7 })
  }
  out.push({ at: p.n - 1, strength: 1 })
  out.sort((a, b) => a.at - b.at)
  // Merge cuts closer than 1.5 mm, keeping the stronger (ends stay put).
  const merged: Cut[] = []
  for (const c of out) {
    const last = merged[merged.length - 1]
    if (last && (c.at - last.at) * p.step < 1.5) {
      if (c.at === p.n - 1) merged[merged.length - 1] = { at: c.at, strength: 1 }
      else if (last.at !== 0 && c.strength > last.strength) merged[merged.length - 1] = c
      continue
    }
    merged.push(c)
  }
  return merged
}

type Features = {
  C: number
  len: Float64Array
  crown: Float64Array
  depth: Float64Array
}

/** Per pair of cuts (i < j): length (mm), crown presence and bucco-lingual width. */
function features(p: Profile, cuts: Cut[], presence: Float64Array): Features {
  const C = cuts.length
  const len = new Float64Array(C * C), crown = new Float64Array(C * C), depth = new Float64Array(C * C)
  const pre = new Float64Array(p.n + 1)
  for (let k = 0; k < p.n; k++) pre[k + 1] = pre[k] + presence[k]
  for (let i = 0; i < C; i++) {
    for (let j = i + 1; j < C; j++) {
      const a = cuts[i].at, b = cuts[j].at
      const L = p.arc[b] - p.arc[a]
      if (L > 40) break
      len[i * C + j] = L
      crown[i * C + j] = (pre[b] - pre[a]) / Math.max(1, b - a)
      // Middle half of the segment: typical width across.
      const q0 = Math.round(a + (b - a) * 0.3), q1 = Math.round(a + (b - a) * 0.7)
      let s = 0, c = 0
      for (let k = q0; k <= q1; k++) {
        s += p.lwidth[k]
        c++
      }
      depth[i * C + j] = c ? s / c : 0
    }
  }
  return { C, len, crown, depth }
}

const SKIP = 1.5
const CUT_REWARD = 3
const CUT_COST = 1.3

function toothScore(L: number, crown: number, dep: number, mu: number, delta: number, atEnd: boolean) {
  const sigma = 0.9 + 0.08 * mu
  // A tooth at the scan's edge may be cut off by the scan, so it may be short.
  const full = -((L - mu) ** 2) / (2 * sigma * sigma)
  let s = atEnd && L < mu ? Math.max(full, -0.4 - (L < 0.45 * mu ? 2 : 0)) : full
  s += 2.5 * (crown - 0.6)
  if (dep > 0) {
    const sd = 0.8 + 0.12 * delta
    s -= Math.min(6, (dep - delta) ** 2 / (2 * sd * sd))
  }
  return s
}

function gapScore(L: number, crown: number, expected: number) {
  const sigma = 1.5 + 0.12 * expected
  return -((L - expected) ** 2) / (2 * sigma * sigma) + 6 * (0.35 - crown) - 1
}

/**
 * Best numbering for one arch, direction and size, with the first tooth's slot fixed.
 * Returns null when no numbering fits.
 */
function solve(p: Profile, f: Features, cuts: Cut[], arch: Arch, reversed: boolean, scale: number, first: number): { segments: Segment[]; dp: number } | null {
  const { C } = f
  const NEG = -1e9
  const T = 16
  // DP coordinates run along the numbering; `orig` maps a DP cut index to the real one.
  const orig = (i: number) => (reversed ? C - 1 - i : i)
  const seg = (i: number, j: number) => {
    const a = orig(i), b = orig(j)
    return a < b ? a * C + b : b * C + a
  }
  const mu = (slot: number) => scale * WIDTHS[arch][positionOf(slot) - 1]
  const delta = (slot: number) => DEPTHS[arch][positionOf(slot) - 1]
  const cutScore = (j: number) => (j === C - 1 ? 0 : CUT_REWARD * cuts[orig(j)].strength - CUT_COST)
  // best[j * (T + 1) + t]: segmentation of cuts 0..j, last slot t (t = T: nothing numbered yet).
  const W = T + 1
  const best = new Float64Array(C * W).fill(NEG)
  const from = new Int32Array(C * W).fill(-1)
  const kind = new Int8Array(C * W) // 0 tooth, 1 gap, 2 lead fragment
  best[0 * W + T] = 0
  for (let j = 1; j < C; j++) {
    const L0 = f.len[seg(0, j)]
    if (L0 > 0 && L0 < 6) {
      // Unnumbered bit at the scan's start (a tooth cut off by the scan, or gum).
      best[j * W + T] = cutScore(j) - 0.3 * L0
      from[j * W + T] = 0 * W + T
      kind[j * W + T] = 2
    }
  }
  for (let i = 0; i < C - 1; i++) {
    for (let t = 0; t <= T; t++) {
      const here = best[i * W + t]
      if (here <= NEG / 2) continue
      for (let j = i + 1; j < C; j++) {
        const key = seg(i, j)
        const L = f.len[key]
        if (!(L > 0) || L > 30) break
        // A short tooth is only excused where the scan itself stops (it may be cut off).
        const atStart = i === 0 && (reversed ? p.cutEnd : p.cutStart)
        const atFinish = j === C - 1 && (reversed ? p.cutStart : p.cutEnd)
        const atEnd = atStart || atFinish
        const crown = f.crown[key]
        const cs = cutScore(j)
        // A tooth.
        const lo = t === T ? first : t + 1
        const hi = t === T ? first : T - 1
        for (let s = lo; s <= hi; s++) {
          const m = mu(s)
          if (L > m + 6) continue
          const skip = t === T ? 0 : (s - t - 1) * SKIP
          const v = here + toothScore(L, crown, f.depth[key], m, delta(s), atEnd) + cs - skip
          const o = j * W + s
          if (v > best[o]) {
            best[o] = v
            from[o] = i * W + t
            kind[o] = 0
          }
        }
        // A toothless stretch covering slots t+1..s (only between numbered teeth).
        if (t !== T && !atEnd) {
          let expected = 0
          for (let s = t + 1; s < T; s++) {
            expected += mu(s)
            if (expected > L + 12) break
            const v = here + gapScore(L, crown, expected) + cs
            const o = j * W + s
            if (v > best[o]) {
              best[o] = v
              from[o] = i * W + t
              kind[o] = 1
            }
          }
        }
      }
    }
  }
  // Finish at the last cut, or with an unnumbered bit after the last tooth.
  let end = -1
  let endScore = NEG
  for (let t = 0; t < T; t++) {
    if (best[(C - 1) * W + t] > endScore) {
      endScore = best[(C - 1) * W + t]
      end = (C - 1) * W + t
    }
  }
  for (let i = 1; i < C - 1; i++) {
    const L = f.len[seg(i, C - 1)]
    if (!(L > 0 && L < 6)) continue
    for (let t = 0; t < T; t++) {
      const v = best[i * W + t] - 0.3 * L
      if (v > endScore) {
        endScore = v
        end = i * W + t
      }
    }
  }
  if (end < 0 || endScore <= NEG / 2) return null
  const segments: Segment[] = []
  for (let o = end; o >= 0 && from[o] >= 0; o = from[o]) {
    const j = Math.floor(o / W), s = o % W
    const prev = from[o]
    const i = Math.floor(prev / W), t = prev % W
    if (kind[o] === 2) continue
    const a = Math.min(cuts[orig(i)].at, cuts[orig(j)].at)
    const b = Math.max(cuts[orig(i)].at, cuts[orig(j)].at)
    if (kind[o] === 1) {
      const gap: number[] = []
      for (let x = t + 1; x <= s; x++) gap.push(x)
      segments.push({ from: a, to: b, slot: -1, gap })
    } else segments.push({ from: a, to: b, slot: s })
  }
  segments.sort((x, y) => x.from - y.from)
  return { segments, dp: endScore }
}

/** Where a segment's crown is, in the height map's (u, v), for the shape check. */
export function segmentPoint(curve: ArchCurve, p: Profile, s: Segment): [number, number] {
  const k = Math.round((s.from + s.to) / 2)
  const c = p.centre[k]
  return [curve.u[k] - p.tv[k] * c, curve.v[k] + p.tu[k] * c]
}

const SHAPE_SIGMA = 2.5
/** A typical distance between a real arch's teeth and the template (mm); closer fits gain. */
const SHAPE_TYPICAL = 2

/** How well numbered teeth match the standard arch: log-likelihood, and the fit. */
export function shapeScore(arch: Arch, points: [number, number][], slots: number[]): { score: number; fit: Fit2D | null } {
  if (points.length < 3) return { score: 0, fit: null }
  const template = templatePositions(arch, SHAPE[arch])
  // Lower arches are seen from the other side: mirror so both match the template's handedness.
  const pts = points.map(([u, v]) => [u, arch === 'upper' ? v : -v] as [number, number])
  const fit = fit2D(slots.map((s) => template[s]), pts, [0.85, 1.18])
  if (!fit) return { score: 0, fit: null }
  const score = (-points.length * (fit.rms * fit.rms - SHAPE_TYPICAL * SHAPE_TYPICAL)) / (2 * SHAPE_SIGMA * SHAPE_SIGMA)
  return { score: score - ((fit.scale - 1) / 0.1) ** 2 / 2, fit }
}

/**
 * Curve of Spee: on a lower arch the premolars sit 1 to 3 mm lower (toward the gums) than the
 * incisors and the back molars; an upper arch has no such dip (its molars and incisors, if
 * anything, sit lower). Measured on labelled scans: dip +0.9..+3.0 mm on lowers, -1.6..+0.8 on
 * uppers. Scores the dip a numbering implies against the arch it claims. Zero when the teeth
 * needed aren't there.
 */
export function speeScore(arch: Arch, p: Profile, teeth: Segment[]): number {
  const dip = speeDip(p, teeth)
  if (dip === null) return 0
  const expected = arch === 'lower' ? 2 : -0.6
  return -((dip - expected) ** 2) / (2 * 1.0 * 1.0) + 0.5
}

/** How far (mm) the premolars sit below the incisors and back molars; null when not measurable. */
export function speeDip(p: Profile, teeth: Segment[]): number | null {
  const top = (s: Segment) => {
    let m = -Infinity
    for (let k = s.from; k <= s.to; k++) m = Math.max(m, p.height[k])
    return m
  }
  const group = (positions: number[]) => {
    const hs = teeth.filter((s) => positions.includes(positionOf(s.slot))).map(top)
    return hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : null
  }
  const front = group([1, 2])
  const middle = group([4, 5])
  // The most distal molars present.
  const back = group([7]) ?? group([6])
  if (middle === null || (front === null && back === null)) return null
  const ends = [front, back].filter((x): x is number => x !== null)
  return ends.reduce((a, b) => a + b, 0) / ends.length - middle
}

/** All numbering hypotheses, best first. */
export function numberTeeth(p: Profile, curve: ArchCurve, arches: Arch[], archPrior: Record<Arch, number>, signal?: AbortSignal): { hypotheses: Hypothesis[]; cuts: Cut[]; presence: Float64Array } {
  const presence = crownPresence(p)
  const cuts = candidateCuts(p, presence)
  const f = features(p, cuts, presence)
  const out: Hypothesis[] = []
  for (const arch of arches) {
    for (const reversed of [false, true]) {
      for (const scale of [1.0, 1.12]) {
        if (signal?.aborted) return { hypotheses: [], cuts, presence }
        for (let first = 0; first < 16; first++) {
          const r = solve(p, f, cuts, arch, reversed, scale, first)
          if (!r) continue
          const teeth = r.segments.filter((s) => s.slot >= 0)
          if (teeth.length === 0) continue
          const shape = shapeScore(arch, teeth.map((s) => segmentPoint(curve, p, s)), teeth.map((s) => s.slot))
          const spee = speeScore(arch, p, teeth)
          out.push({ arch, reversed, scale, segments: r.segments, dp: r.dp, shape: shape.score, spee, fit: shape.fit, score: r.dp + shape.score + spee + archPrior[arch] })
        }
      }
    }
  }
  out.sort((a, b) => b.score - a.score)
  return { hypotheses: out, cuts, presence }
}

export const fdiOf = (arch: Arch, slot: number) => SLOTS[arch][slot]
