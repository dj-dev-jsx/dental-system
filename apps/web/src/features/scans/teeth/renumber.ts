// Fixing tooth numbers in one or two taps. The automatic check's usual mistakes are a run of
// teeth each one place off, a molar counted twice, a tooth missed and the wrong arch; each tool
// here fixes one of them in a single step, keeping the numbers in arch order with no duplicates.
import { type FdiCode, parseFdi } from '../../dental-chart/model/fdi'
import { jawOf } from '../../dental-chart/three/archLayout'
import { toothSpec } from '../../dental-chart/three/toothShape'
import { ARCH_ORDER, type ViewPin } from '../viewer/pinMath'

/** One number changed by a fix, for the preview ("24 → 23"). */
export type Change = { from: FdiCode; to: FdiCode | null }

/** A fix ready to apply: the new pins and what changes. Null when it can't be done (a number would run off the arch). */
export type Fix = { pins: ViewPin[]; changes: Change[] }

const orderOf = (tooth: FdiCode) => (tooth[0] === '1' || tooth[0] === '2' ? ARCH_ORDER.upper : ARCH_ORDER.lower)

/** Moving away from the midline: down the arch order on the patient's right (1x, 4x), up it on the left. */
const distalStep = (tooth: FdiCode) => (tooth[0] === '1' || tooth[0] === '4' ? -1 : 1)

const sameSide = (a: FdiCode, b: FdiCode) => a[0] === b[0]

/** The teeth on the same side further from the midline than `tooth`. */
function distalOf(pins: ViewPin[], tooth: FdiCode) {
  return pins.filter((p) => p.tooth !== tooth && sameSide(p.tooth, tooth) && Number(p.tooth[1]) > Number(tooth[1]))
}

/**
 * Moves some pins along the arch by `shift` places (in arch order), and pushes any other pin in
 * the way further along in the same direction, so the order is kept and no number is used twice.
 */
function moveAlong(pins: ViewPin[], moving: Set<ViewPin>, shift: number): Fix | null {
  if (shift === 0) return { pins, changes: [] }
  const order = orderOf(pins.find((p) => moving.has(p))?.tooth ?? pins[0].tooth)
  // Only this jaw's teeth take part (a scan of both jaws keeps the other's numbers).
  const at = new Map<ViewPin, number>(pins.filter((p) => orderOf(p.tooth) === order).map((p) => [p, order.indexOf(p.tooth)]))
  for (const p of moving) at.set(p, at.get(p)! + shift)
  const direction = Math.sign(shift)
  // Settle the rest in the direction of the move, nearest first.
  const others = pins.filter((p) => !moving.has(p) && orderOf(p.tooth) === order).sort((a, b) => direction * (at.get(a)! - at.get(b)!))
  const taken = new Set([...moving].map((p) => at.get(p)!))
  for (const p of others) {
    let i = at.get(p)!
    while (taken.has(i)) i += direction
    at.set(p, i)
    taken.add(i)
  }
  if ([...at.values()].some((i) => i < 0 || i >= order.length)) return null
  // A tooth pushed along must stay on its side: pushing a whole arch across the midline is never meant.
  if (others.some((p) => order[at.get(p)!][0] !== p.tooth[0])) return null
  const changes: Change[] = []
  const next = pins.map((p) => {
    const tooth = orderOf(p.tooth) === order ? order[at.get(p)!] : p.tooth
    if (tooth !== p.tooth) changes.push({ from: p.tooth, to: tooth })
    return tooth === p.tooth ? p : { ...p, tooth }
  })
  return { pins: next, changes }
}

/**
 * Gives `tooth` the number `to`, and moves the teeth beyond it on its side (away from the
 * midline) the same number of places: when one tooth of a run is one place off, the rest of the
 * run usually is too. Teeth in the way are pushed along. Between the jaws it's a plain swap.
 */
export function renumber(pins: ViewPin[], tooth: FdiCode, to: FdiCode): Fix | null {
  if (tooth === to) return { pins, changes: [] }
  const order = orderOf(tooth)
  if (orderOf(to) !== order) {
    const next = pins.map((p) => (p.tooth === tooth ? { ...p, tooth: to } : p.tooth === to ? { ...p, tooth } : p))
    return { pins: next, changes: [{ from: tooth, to }, ...(pins.some((p) => p.tooth === to) ? [{ from: to, to: tooth }] : [])] }
  }
  const self = pins.find((p) => p.tooth === tooth)
  if (!self) return null
  const shift = order.indexOf(to) - order.indexOf(tooth)
  // Moving toward the midline or away, the run beyond this tooth (away from the midline) comes along.
  return moveAlong(pins, new Set([self, ...distalOf(pins, tooth)]), shift)
}

/** "Missing here": the tooth with this number is missing, so this one and those beyond it are each one further along. */
export function missingHere(pins: ViewPin[], tooth: FdiCode): Fix | null {
  const self = pins.find((p) => p.tooth === tooth)
  if (!self) return null
  return moveAlong(pins, new Set([self, ...distalOf(pins, tooth)]), distalStep(tooth))
}

/**
 * "This side ±1": every tooth on this tooth's side (its quadrant) one number up (+1, away from
 * the midline) or down (-1, toward it), for a run counted one place off from the start. Teeth
 * in the way are pushed along, as with renumber.
 */
export function shiftSide(pins: ViewPin[], tooth: FdiCode, step: 1 | -1): Fix | null {
  const side = pins.filter((p) => sameSide(p.tooth, tooth))
  if (side.length === 0) return null
  return moveAlong(pins, new Set(side), step * distalStep(tooth))
}

/** "Not a tooth": this pin goes; the other numbers stay. */
export function notATooth(pins: ViewPin[], tooth: FdiCode): Fix {
  return { pins: pins.filter((p) => p.tooth !== tooth), changes: [{ from: tooth, to: null }] }
}

/**
 * "One tooth": two pins on one tooth (a molar counted twice) become one, in the middle of the
 * two, keeping the number of the one chosen (`a`). When the other was further from the midline,
 * the teeth beyond it come one place back.
 */
export function merge(pins: ViewPin[], a: FdiCode, b: FdiCode): Fix | null {
  const keep = pins.find((p) => p.tooth === a)
  const drop = pins.find((p) => p.tooth === b)
  if (!keep || !drop) return null
  const middle = { ...keep, at: keep.at.map((v, i) => (v + drop.at[i]) / 2) as ViewPin['at'] }
  const rest = pins.filter((p) => p !== keep && p !== drop)
  const joined = [...rest, middle]
  // The teeth beyond the dropped one come back a place, when they can (only when it was the
  // further of the two from the midline).
  const dropFurther = sameSide(keep.tooth, drop.tooth) && Number(drop.tooth[1]) > Number(keep.tooth[1])
  const beyond = dropFurther ? distalOf(joined, drop.tooth).filter((p) => p !== middle) : []
  const moved = beyond.length > 0 ? moveAlong(joined, new Set(beyond), -distalStep(drop.tooth)) : { pins: joined, changes: [] }
  const result = moved ?? { pins: joined, changes: [] }
  return { pins: result.pins, changes: [{ from: drop.tooth, to: null }, ...result.changes] }
}

/**
 * The numbers most likely meant for a tooth: one and two places either way along the arch, those
 * on its own side first (a number across the midline moves half the arch).
 */
export function likelyNumbers(tooth: FdiCode): FdiCode[] {
  const order = orderOf(tooth)
  const i = order.indexOf(tooth)
  const near = [i - 1, i + 1, i - 2, i + 2].filter((j) => j >= 0 && j < order.length).map((j) => order[j])
  return [...near.filter((t) => sameSide(t, tooth)), ...near.filter((t) => !sameSide(t, tooth))]
}

/** "24 → 23, 25 → 24", "26 removed". */
export function describe(changes: Change[]) {
  return changes.map((c) => (c.to ? `${c.from} → ${c.to}` : `${c.from} removed`)).join(', ')
}

/** How far apart the middles of two neighbouring standard teeth are, mm. */
function spacingMm(a: FdiCode, b: FdiCode) {
  return (toothSpec(jawOf(a), parseFdi(a).position).width + toothSpec(jawOf(b), parseFdi(b).position).width) / 2
}

/** Numbered neighbours along the arch: next to each other on one side, or the two central incisors. */
function neighbours(a: FdiCode, b: FdiCode) {
  if (a[0] === b[0]) return Math.abs(Number(a[1]) - Number(b[1])) === 1
  return orderOf(a) === orderOf(b) && a[1] === '1' && b[1] === '1'
}

/**
 * A neighbouring pin so much closer to this one than their tooth sizes allow that the two are
 * probably one tooth counted twice (a molar split in two). The scan's scale is read from the
 * other neighbouring pairs (the median of distance over standard spacing), so it works on any
 * scan; null when there are too few pairs to tell.
 */
export function twinOf(pins: ViewPin[], tooth: FdiCode): FdiCode | null {
  const self = pins.find((p) => p.tooth === tooth)
  if (!self) return null
  const gap = (a: ViewPin, b: ViewPin) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1], a.at[2] - b.at[2])
  const ratios: number[] = []
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      if (neighbours(pins[i].tooth, pins[j].tooth)) ratios.push(gap(pins[i], pins[j]) / spacingMm(pins[i].tooth, pins[j].tooth))
    }
  }
  if (ratios.length < 3) return null
  ratios.sort((x, y) => x - y)
  const usual = ratios[ratios.length >> 1]
  let best: { tooth: FdiCode; r: number } | null = null
  for (const p of pins) {
    if (p === self || !neighbours(p.tooth, tooth)) continue
    const r = gap(p, self) / spacingMm(p.tooth, tooth) / usual
    if (r < TWIN_SHARE && (!best || r < best.r)) best = { tooth: p.tooth, r }
  }
  return best?.tooth ?? null
}

/** Two neighbours closer than this share of their usual spacing are offered as one tooth. */
const TWIN_SHARE = 0.65
