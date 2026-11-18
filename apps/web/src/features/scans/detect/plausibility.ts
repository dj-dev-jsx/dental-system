// Second opinion on a numbering: does each tooth look like what its number says? Every check
// that fails names the tooth and why, so confidence drops and the dentist is told what to look
// at. The aim is that a scan only gets "Looks right?" when nothing here is doubtful.
import type { ArchCurve } from './arch'
import { type Hypothesis, segmentPoint, type Segment } from './numbering'
import type { Profile } from './profile'
import { type Arch, DEPTHS, positionOf, SHAPE, SLOTS, templatePositions, WIDTHS } from './template'

const TYPE_NAMES = ['central incisor', 'lateral incisor', 'canine', 'premolar', 'premolar', 'molar', 'molar', 'wisdom tooth']

export type Doubts = {
  /** Reasons per FDI number. */
  teeth: Map<string, string[]>
  /** Reasons about the whole numbering. */
  overall: string[]
}

export function checkNumbering(arch: Arch, best: Hypothesis, p: Profile, curve: ArchCurve): Doubts {
  const teeth = new Map<string, string[]>()
  const overall: string[] = []
  const doubt = (slot: number, why: string) => {
    const t = SLOTS[arch][slot]
    const list = teeth.get(t) ?? []
    if (!list.includes(why)) list.push(why)
    teeth.set(t, list)
  }
  const segs = best.segments
  const tooth = segs.filter((s) => s.slot >= 0)
  const len = (s: Segment) => p.arc[s.to] - p.arc[s.from]
  const mu = (slot: number) => best.scale * WIDTHS[arch][positionOf(slot) - 1]
  const firstSeg = segs[0], lastSeg = segs[segs.length - 1]
  const cutOffEnd = (s: Segment) => (s === firstSeg && p.cutStart) || (s === lastSeg && p.cutEnd)
  const typeOf = (slot: number) => TYPE_NAMES[positionOf(slot) - 1]

  // 1. Width for its type (mesio-distal).
  for (const s of tooth) {
    const r = len(s) / mu(s.slot)
    if (r < 0.65 && !cutOffEnd(s)) doubt(s.slot, `narrow for a ${typeOf(s.slot)}`)
    if (r > 1.45) doubt(s.slot, `wide for a ${typeOf(s.slot)}`)
  }
  // 2. Two short neighbours that together make one tooth (a molar split along its fissure).
  for (let i = 0; i + 1 < tooth.length; i++) {
    const a = tooth[i], b = tooth[i + 1]
    if (a.to !== b.from) continue
    const ra = len(a) / mu(a.slot), rb = len(b) / mu(b.slot)
    const joined = (len(a) + len(b)) / Math.max(mu(a.slot), mu(b.slot))
    if (ra < 0.85 && rb < 0.85 && joined > 0.8 && joined < 1.3) {
      doubt(a.slot, 'may be one tooth with its neighbour')
      doubt(b.slot, 'may be one tooth with its neighbour')
    }
  }
  // 3. Shape across the arch for its type (incisors are thin edges, back teeth broad tables).
  for (const s of tooth) {
    const q0 = Math.round(s.from + (s.to - s.from) * 0.3), q1 = Math.round(s.from + (s.to - s.from) * 0.7)
    let sum = 0, c = 0
    for (let k = q0; k <= q1; k++) {
      sum += p.lwidth[k]
      c++
    }
    const dep = c ? sum / c : 0
    const delta = DEPTHS[arch][positionOf(s.slot) - 1]
    if (dep > 0 && Math.abs(dep - delta) > Math.max(2.5, 0.5 * delta)) doubt(s.slot, `shape doesn't look like a ${typeOf(s.slot)}`)
  }
  // 4. Out of line with the standard arch.
  if (best.fit && tooth.length >= 4) {
    const template = templatePositions(arch, SHAPE[arch])
    const f = best.fit
    for (const s of tooth) {
      const [u, v0] = segmentPoint(curve, p, s)
      const v = arch === 'upper' ? v0 : -v0
      const [x, y] = template[s.slot]
      const tx = f.scale * (f.cos * x - f.sin * y) + f.tx
      const ty = f.scale * (f.sin * x + f.cos * y) + f.ty
      if (Math.hypot(tx - u, ty - v) > 4.5) doubt(s.slot, 'out of line with the arch')
    }
  }
  // 5. Next to a missing tooth inside the scan: the count after a gap is less certain.
  for (let i = 0; i + 1 < tooth.length; i++) {
    const a = tooth[i], b = tooth[i + 1]
    if (Math.abs(b.slot - a.slot) > 1) {
      doubt(a.slot, 'next to a missing tooth')
      doubt(b.slot, 'next to a missing tooth')
    }
  }
  // 6. Left/right symmetry of matching teeth.
  for (const s of tooth) {
    if (s.slot >= 8) continue
    const mate = tooth.find((t) => t.slot === 15 - s.slot)
    if (!mate) continue
    const ratio = len(s) / len(mate)
    if (ratio > 1.6 || ratio < 1 / 1.6) {
      doubt(s.slot, 'differs from the same tooth on the other side')
      doubt(mate.slot, 'differs from the same tooth on the other side')
    }
  }
  // 7. Tooth count against the arch's length.
  // (Measured between the middles of the end teeth: the end segments carry gum tails.)
  if (tooth.length >= 4) {
    const a = tooth[0], b = tooth[tooth.length - 1]
    const lo = Math.min(a.slot, b.slot), hi = Math.max(a.slot, b.slot)
    let expected = mu(lo) / 2 + mu(hi) / 2
    for (let s = lo + 1; s < hi; s++) expected += mu(s)
    const measured = Math.abs(p.arc[Math.round((b.from + b.to) / 2)] - p.arc[Math.round((a.from + a.to) / 2)])
    const ratio = measured / expected
    if (ratio < 0.9 || ratio > 1.15) overall.push(ratio < 1 ? 'the teeth found fill less of the arch than their numbers need' : 'the arch is longer than the teeth numbered on it')
  }
  // 8. The tooth at each end of the scan: clearly lower than its neighbour means gum, a tooth
  //    only partly scanned, or one not fully erupted.
  const top = (s: Segment) => {
    let m = -Infinity
    for (let k = s.from; k <= s.to; k++) m = Math.max(m, p.height[k])
    return m
  }
  if (tooth.length >= 2) {
    for (const [end, next] of [[tooth[0], tooth[1]], [tooth[tooth.length - 1], tooth[tooth.length - 2]]]) {
      if (top(next) - top(end) > 1.5) doubt(end.slot, 'lower than its neighbour (gum or only partly scanned?)')
    }
  }
  return { teeth, overall }
}
