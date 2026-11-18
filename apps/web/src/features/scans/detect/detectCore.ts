// Automatic tooth detection on an intraoral scan, start to finish. Geometry only (no learned
// model): find which way the teeth face, look straight down on them as a height image, trace
// the arch through the crowns, cut it into teeth where the crowns dip between neighbours, and
// number them with standard tooth widths and the standard arch shape. Pure typed-array code, so
// it runs in a worker and in a node test script.
import { type ArchCurve, archCurve, crownWeight, fitOcclusalPlane, type Plane } from './arch'
import { guessAxis } from './axis'
import type { Arch, DetectedTooth, DetectInput, DetectResult } from './detectTypes'
import { buildHeightMap, frameFor, type Frame, type HeightMap, toViewer } from './heightMap'
import { dot, meshInfo, triangleCount, unit, type Vec3 } from './meshStats'
import { type Cut, fdiOf, type Hypothesis, numberTeeth, type Segment, speeDip } from './numbering'
import { palateFill } from './palate'
import { checkNumbering } from './plausibility'
import { buildProfile, type Profile } from './profile'
import { positionOf, SLOTS, widthOf } from './template'

const CELL = 0.4

export type DetectDebug = {
  frame: Frame
  map: HeightMap
  plane: Plane
  curve: ArchCurve | null
  profile: Profile | null
  cuts: Cut[]
  hypotheses: Hypothesis[]
  palate: number | null
  axisHow: string
  timings: Record<string, number>
}

class Aborted extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function detectCore(input: DetectInput, signal?: AbortSignal): DetectResult {
  return detectWithDebug(input, signal).result
}

export function detectWithDebug(input: DetectInput, signal?: AbortSignal): { result: DetectResult; debug: DetectDebug | null } {
  const t0 = now()
  const timings: Record<string, number> = {}
  const check = () => {
    if (signal?.aborted) throw new Aborted()
  }
  const upm = input.unitsPerMm
  const empty = (notes: string[], occlusal: Vec3 = [0, 1, 0]): { result: DetectResult; debug: null } => ({
    result: { arch: input.arch ?? 'upper', archConfidence: input.arch ? 1 : 0, occlusal, teeth: [], confidence: 0, notes, coverage: { kind: 'partial', teeth: [] } },
    debug: null,
  })
  if (triangleCount(input.positions, input.index) < 100 || !(upm > 0)) return empty(['The scan is too small to find teeth on.'])

  const info = meshInfo(input.positions, input.index, upm)
  check()
  const guess = guessAxis(info, input.positions, input.index, upm, signal)
  timings.axis = now() - t0
  check()

  // Look down the axis, fit the occlusal plane to the crown tops, and look again square to it.
  let frame = frameFor(guess.axis, info.fineCentre, upm)
  let map = buildHeightMap(info.samples, frame, CELL)
  let plane = fitOcclusalPlane(map)
  const refined = unit([0, 1, 2].map((i) => -plane.a * frame.e1[i] - plane.b * frame.e2[i] + frame.d[i]))
  if (dot(refined, guess.axis) > Math.cos((25 * Math.PI) / 180)) {
    frame = frameFor(refined, info.fineCentre, upm, frame.e1)
    map = buildHeightMap(info.samples, frame, CELL)
    plane = fitOcclusalPlane(map)
  }
  const occlusal = unit([0, 1, 2].map((i) => -plane.a * frame.e1[i] - plane.b * frame.e2[i] + frame.d[i]))
  timings.map = now() - t0
  check()

  const weight = crownWeight(map, plane, 6)
  const curve = archCurve(map, weight)
  check()
  if (!curve || curve.length < 5) return empty(['No teeth found on this scan.'], occlusal)
  const profile = buildProfile(map, plane, curve)
  timings.profile = now() - t0
  check()

  const palate = palateFill(map, curve)
  // Palate present: upper, strongly. Inside empty: a little toward lower (uppers are often
  // trimmed of the palate too).
  const upperPrior = palate === null ? 0 : Math.max(-1, Math.min(6, (palate - 0.22) * 25))
  const arches: Arch[] = input.arch ? [input.arch] : ['upper', 'lower']
  const { hypotheses, cuts, presence } = numberTeeth(profile, curve, arches, { upper: upperPrior, lower: 0 }, signal)
  timings.numbering = now() - t0
  check()
  const debug: DetectDebug = { frame, map, plane, curve, profile, cuts, hypotheses, palate, axisHow: guess.how, timings }
  if (hypotheses.length === 0) return { result: empty(['No teeth found on this scan.'], occlusal).result, debug }

  const best = hypotheses[0]
  const arch = best.arch
  // Weights of the hypotheses: how believable each is next to the best.
  const TEMPERATURE = 1.5
  const weights = hypotheses.map((h) => Math.exp((h.score - best.score) / TEMPERATURE))
  const total = weights.reduce((s, w) => s + w, 0)
  let archConfidence = input.arch ? 1 : hypotheses.reduce((s, h, i) => s + (h.arch === arch ? weights[i] : 0), 0) / total
  // Independent upper/lower cues on the chosen teeth. Any cue against the guess, or fewer than
  // two for it (unless one is the palate), keeps the arch out of the sure band (0.9), so the
  // dentist is asked.
  const archCues = archVotes(best, profile, palate)
  let archMixed = false
  if (!input.arch) {
    const against = archCues.filter((c) => c.arch !== arch)
    const forIt = archCues.filter((c) => c.arch === arch)
    if (against.length > 0) {
      archConfidence = Math.min(archConfidence, 0.6)
      archMixed = true
    } else if (forIt.length === 0 || (forIt.length === 1 && !forIt.some((c) => c.why === 'a palate'))) {
      // One cue alone (no palate) isn't enough to be sure.
      archConfidence = Math.min(archConfidence, 0.85)
    }
  }

  // What each hypothesis calls the tooth at a sample.
  const labelAt = (h: Hypothesis, k: number) => {
    for (const s of h.segments) if (s.slot >= 0 && s.from <= k && k <= s.to) return fdiOf(h.arch, s.slot)
    return null
  }
  const cutStrength = (at: number) => cuts.find((c) => c.at === at)?.strength ?? 0.5

  const toothSegments = best.segments.filter((s) => s.slot >= 0)
  const teeth: (DetectedTooth & { slot: number; alt: string | null; agree: number })[] = []
  for (const s of toothSegments) {
    const tooth = fdiOf(arch, s.slot)
    const mid = Math.round((s.from + s.to) / 2)
    const votes = new Map<string, number>()
    hypotheses.forEach((h, i) => {
      const l = labelAt(h, mid) ?? '-'
      votes.set(l, (votes.get(l) ?? 0) + weights[i])
    })
    const agree = (votes.get(tooth) ?? 0) / total
    let alt: string | null = null
    let altW = 0
    for (const [l, w] of votes) if (l !== tooth && l !== '-' && w > altW) {
      alt = l
      altW = w
    }
    const clarity = Math.min(cutStrength(s.from), cutStrength(s.to))
    const L = profile.arc[s.to] - profile.arc[s.from]
    const mu = widthOf(arch, s.slot)
    const widthFit = Math.exp(-((L - mu) ** 2) / (2 * 2.5 * 2.5))
    const crown = presence[mid]
    const confidence = agree * (0.6 + 0.25 * clarity + 0.15 * widthFit) * (0.7 + 0.3 * crown)
    const neck = gumLine(map, profile, frame, s, arch)
    teeth.push({ tooth, at: crownTop(map, profile, frame, plane, s), ...(neck ? { neck } : {}), confidence: round2(confidence), slot: s.slot, alt: altW / total > 0.15 ? alt : null, agree })
  }
  // Second opinion: anything that doesn't look like its number caps that tooth's confidence.
  const doubts = checkNumbering(arch, best, profile, curve)
  for (const t of teeth) if (doubts.teeth.has(t.tooth)) t.confidence = Math.min(t.confidence, 0.45)
  // Never two pins on one tooth: a pin closer than 3 mm to a surer one is dropped.
  const kept: typeof teeth = []
  const dropped: string[] = []
  for (const t of [...teeth].sort((a, b) => b.confidence - a.confidence)) {
    const near = kept.some((k) => Math.hypot(k.at[0] - t.at[0], k.at[1] - t.at[1], k.at[2] - t.at[2]) < 3 * upm)
    if (near) dropped.push(t.tooth)
    else kept.push(t)
  }
  teeth.length = 0
  teeth.push(...kept)
  teeth.sort((a, b) => a.slot - b.slot)

  // Overall: how much weight agrees with the whole numbering, and how clear the teeth are.
  let sameNumbering = 0
  hypotheses.forEach((h, i) => {
    let same = 0
    for (const s of toothSegments) if (labelAt(h, Math.round((s.from + s.to) / 2)) === fdiOf(arch, s.slot)) same++
    if (same >= 0.8 * toothSegments.length) sameNumbering += weights[i]
  })
  const meanTooth = teeth.reduce((s, t) => s + t.confidence, 0) / Math.max(1, teeth.length)
  const fitQuality = best.fit ? Math.exp(-((best.fit.rms / 4) ** 2)) : 0.5
  let confidence = round2((sameNumbering / total) * (0.5 + 0.5 * meanTooth) * (0.6 + 0.4 * fitQuality) * (teeth.length >= 3 ? 1 : 0.6))
  // Any doubt keeps the scan out of "Looks right?" (below 0.6).
  if (doubts.teeth.size > 0 || doubts.overall.length > 0) confidence = Math.min(confidence, 0.55)
  // So does any tooth the detector itself is unsure of.
  if (teeth.some((t) => t.confidence < 0.7)) confidence = Math.min(confidence, 0.55)

  const slots = teeth.map((t) => t.slot)
  const firstSlot = Math.min(...slots), lastSlot = Math.max(...slots)
  const span: string[] = []
  for (let s = firstSlot; s <= lastSlot; s++) span.push(SLOTS[arch][s])
  const full = firstSlot <= 2 && lastSlot >= 13
  // Front teeth only, or very few teeth: up/down, side and numbers all rest on little.
  const frontOnly = !full && teeth.length > 0 && teeth.every((t) => positionOf(t.slot) <= 3)
  if (!full && (teeth.length <= 4 || frontOnly)) {
    confidence = Math.min(confidence, 0.45)
    if (!input.arch) archConfidence = Math.min(archConfidence, 0.8)
  }
  const notes = buildNotes(arch, archConfidence, input.arch !== undefined, teeth, best.segments, full, firstSlot, lastSlot, confidence, palate)
  for (const t of dropped) notes.push(`Tooth ${t} was too close to another tooth's pin to place; please check.`)
  const doubtful = teeth.filter((t) => doubts.teeth.has(t.tooth))
  if (doubtful.length > 0) {
    const shown = doubtful.slice(0, 6).map((t) => `${t.tooth} (${doubts.teeth.get(t.tooth)!.join(', ')})`)
    notes.push(`Please check ${doubtful.length === 1 ? 'tooth' : 'teeth'} ${shown.join('; ')}${doubtful.length > 6 ? `; and ${doubtful.length - 6} more` : ''}.`)
  }
  for (const why of doubts.overall) notes.push(`Please check the numbering: ${why}.`)
  if (frontOnly) notes.push('Only front teeth are on the scan, so upper or lower and the numbers are a guess; please check.')
  else if (!full && teeth.length <= 4) notes.push('Only a few teeth are on the scan, so the numbers are a guess; please check.')
  if (archMixed) notes.push(`Upper or lower? The scan gives mixed signs (${archCues.map((c) => `${c.why} suggests ${c.arch}`).join('; ')}).`)
  timings.total = now() - t0
  return {
    result: {
      arch,
      archConfidence: round2(archConfidence),
      occlusal,
      teeth: teeth.map(({ tooth, at, neck, confidence }) => (neck ? { tooth, at, neck, confidence } : { tooth, at, confidence })),
      confidence,
      notes,
      coverage: { kind: full ? 'full' : 'partial', teeth: span },
    },
    debug,
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100

/**
 * The middle of a tooth's biting surface: the centre of its highest part (within 2.5 mm of its
 * top), moved onto the nearest cell of the crown, at that cell's surface height.
 */
function crownTop(map: HeightMap, p: Profile, frame: Frame, plane: Plane, s: Segment): [number, number, number] {
  const { w, h, cell, u0, v0, top } = map
  let peak = -Infinity
  const mid = Math.round((s.from + s.to) / 2)
  const centre = p.centre[mid]
  const inside = (o: number) => {
    const k = p.nearest[o]
    return k >= s.from && k <= s.to && Math.abs(p.across[o] - centre) <= 6
  }
  for (let o = 0; o < w * h; o++) if (inside(o) && p.rel[o] > peak) peak = p.rel[o]
  let su = 0, sv = 0, sw = 0
  for (let o = 0; o < w * h; o++) {
    if (!inside(o)) continue
    const r = p.rel[o] - (peak - 2.5)
    if (r <= 0) continue
    su += (u0 + (o % w) * cell) * r
    sv += (v0 + Math.floor(o / w) * cell) * r
    sw += r
  }
  let cu: number, cv: number
  if (sw > 0) {
    cu = su / sw
    cv = sv / sw
  } else {
    // No crown cells: the arch curve's point.
    cu = u0
    cv = v0
  }
  let bestO = -1
  let bd = Infinity
  for (let o = 0; o < w * h; o++) {
    if (!inside(o) || p.rel[o] < peak - 4) continue
    const d = (u0 + (o % w) * cell - cu) ** 2 + (v0 + Math.floor(o / w) * cell - cv) ** 2
    if (d < bd) {
      bd = d
      bestO = o
    }
  }
  if (bestO < 0) return toViewer(frame, cu, cv, plane.a * cu + plane.b * cv + plane.c)
  const u = u0 + (bestO % w) * cell, v = v0 + Math.floor(bestO / w) * cell
  return toViewer(frame, u, v, top[bestO])
}

function buildNotes(
  arch: Arch,
  archConfidence: number,
  archGiven: boolean,
  teeth: { tooth: string; slot: number; confidence: number; alt: string | null; agree: number }[],
  segments: Segment[],
  full: boolean,
  firstSlot: number,
  lastSlot: number,
  confidence: number,
  palate: number | null,
): string[] {
  const notes: string[] = []
  const name = arch === 'upper' ? 'upper' : 'lower'
  if (!archGiven) {
    if (archConfidence < 0.75) notes.push(`Not sure this is the ${name} arch; please check, and switch if it's the other one.`)
    else if (palate !== null && palate > 0.6 && arch === 'upper') notes.push('Upper arch (the palate is on the scan).')
  }
  const found = new Set(teeth.map((t) => t.tooth))
  if (full) notes.push(`Full arch: ${teeth.length} teeth found.`)
  else notes.push(`Partial scan: about ${lastSlot - firstSlot + 1} teeth' width (${SLOTS[arch][firstSlot]} to ${SLOTS[arch][lastSlot]}); ${teeth.length} found.`)
  // Places inside the scanned span with no tooth.
  for (const s of segments) {
    if (!s.gap || s.gap.length === 0) continue
    const list = s.gap.map((g) => SLOTS[arch][g])
    notes.push(list.length === 1 ? `Tooth ${list[0]} not found (may be missing).` : `Teeth ${joinList(list)} not found (may be missing).`)
  }
  const skipped: string[] = []
  for (let s = firstSlot; s <= lastSlot; s++) {
    const t = SLOTS[arch][s]
    if (!found.has(t) && !segments.some((g) => g.gap?.includes(s))) skipped.push(t)
  }
  if (skipped.length) notes.push(skipped.length === 1 ? `Tooth ${skipped[0]} not found (may be missing).` : `Teeth ${joinList(skipped)} not found (may be missing).`)
  if (full) {
    const wisdom = [arch === 'upper' ? '18' : '48', arch === 'upper' ? '28' : '38'].filter((t) => !found.has(t))
    if (wisdom.length === 2) notes.push('No wisdom teeth found.')
  }
  const unsure = teeth.filter((t) => t.agree < 0.6 && t.alt)
  if (unsure.length > 0 && unsure.length <= 3) {
    for (const t of unsure) notes.push(`Couldn't tell ${t.tooth} from ${t.alt} for sure; please check.`)
  } else if (unsure.length > 3) {
    notes.push(`Couldn't tell the numbers of ${unsure.length} teeth for sure (${joinList(unsure.map((t) => t.tooth))}); please check them.`)
  }
  if (confidence < 0.5 && !notes.some((n) => n.startsWith("Couldn't"))) notes.push('The numbering is a rough guess on this scan; please check every tooth.')
  if (positionOf(firstSlot) >= 4 && positionOf(lastSlot) >= 4 && Math.sign(firstSlot - 7.5) === Math.sign(lastSlot - 7.5) && !full)
    notes.push('Only back teeth are on the scan, so the side (left or right) is a guess; please check.')
  return notes
}

function joinList(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

type ArchVote = { arch: Arch; why: string }

/**
 * Upper/lower evidence that doesn't depend on which numbering won: the palate on the scan, how
 * wide the two front-most teeth are (upper central incisors about 8.5 mm, lower about 5 mm),
 * and the curve of Spee (lower premolars sit 1-3 mm below the incisors and molars).
 */
function archVotes(best: Hypothesis, p: Profile, palate: number | null): ArchVote[] {
  const votes: ArchVote[] = []
  if (palate !== null && palate > 0.3) votes.push({ arch: 'upper', why: 'a palate' })
  const teeth = best.segments.filter((s) => s.slot >= 0)
  const centrals = teeth.filter((s) => positionOf(s.slot) === 1)
  if (centrals.length > 0) {
    const w = centrals.reduce((a, s) => a + (p.arc[s.to] - p.arc[s.from]), 0) / centrals.length
    if (w > 7.3) votes.push({ arch: 'upper', why: `front teeth ${w.toFixed(1)} mm wide` })
    else if (w < 6.3) votes.push({ arch: 'lower', why: `front teeth ${w.toFixed(1)} mm wide` })
  }
  const dip = speeDip(p, teeth)
  if (dip !== null) {
    if (dip > 1.2) votes.push({ arch: 'lower', why: 'premolars lower than the front and back teeth' })
    else if (dip < 0.2) votes.push({ arch: 'upper', why: 'no dip at the premolars' })
  }
  return votes
}

/** Typical clinical crown height (mm), central incisor (1) to third molar (8). */
const CROWN_HEIGHT: Record<Arch, number[]> = {
  upper: [10.5, 9, 10, 8.5, 7.5, 7, 6.5, 6],
  lower: [9, 9.5, 11, 8.5, 8, 7.5, 7, 6.5],
}

/**
 * The gum line on a tooth's cheek side: the crown's top minus a typical crown height for its
 * type, but never below the gums actually there (the lower quarter of the heights beside the
 * tooth), placed on the surface cell on the cheek side nearest that height.
 */
function gumLine(map: HeightMap, p: Profile, frame: Frame, s: Segment, arch: Arch): [number, number, number] | null {
  const { w, h, cell, u0, v0, top } = map
  const mid = Math.round((s.from + s.to) / 2)
  const centre = p.centre[mid]
  let peak = -Infinity
  const rels: number[] = []
  for (let o = 0; o < w * h; o++) {
    const k = p.nearest[o]
    if (k < s.from || k > s.to || Math.abs(p.across[o] - centre) > 7) continue
    rels.push(p.rel[o])
    if (p.rel[o] > peak) peak = p.rel[o]
  }
  if (rels.length < 10) return null
  rels.sort((a, b) => a - b)
  const floor = rels[Math.floor(rels.length * 0.25)]
  const neck = Math.max(peak - CROWN_HEIGHT[arch][positionOf(s.slot) - 1], floor)
  // Cheek side: away from the inside of the arch.
  let best = -1
  let bd = Infinity
  for (let o = 0; o < w * h; o++) {
    const k = p.nearest[o]
    if (k < s.from || k > s.to) continue
    const a = (p.across[o] - centre) * p.inside
    if (a > -1 || a < -8) continue
    const along = Math.abs(k - mid) * p.step
    const d = Math.abs(p.rel[o] - neck) + 0.3 * along
    if (d < bd) {
      bd = d
      best = o
    }
  }
  if (best < 0) return null
  return toViewer(frame, u0 + (best % w) * cell, v0 + Math.floor(best / w) * cell, top[best])
}
