// The arithmetic behind tooth pins: the order teeth are marked in, moving points between the
// file's coordinates and the viewer's, and which pin a point on the scan belongs to.
import type { FdiCode } from '../../dental-chart/model/fdi'
import type { ScanPin } from '../types'
import type { ParsedMesh } from './parseTypes'

export type Vec3 = [number, number, number]
/** A pin while it is on screen: in the viewer's coordinates (centred and scaled). */
export type ViewPin = { tooth: FdiCode; at: Vec3 }
export type Arch = 'upper' | 'lower' | 'both'

const range = (q: number, from: number, to: number) => {
  const out: FdiCode[] = []
  for (let p = from; from > to ? p >= to : p <= to; p += from > to ? -1 : 1) out.push(`${q}${p}` as FdiCode)
  return out
}

/** Upper: 18 to 11 then 21 to 28. Lower: 48 to 41 then 31 to 38. Across the mouth, right to left. */
export const ARCH_ORDER: Record<'upper' | 'lower', FdiCode[]> = {
  upper: [...range(1, 8, 1), ...range(2, 1, 8)],
  lower: [...range(4, 8, 1), ...range(3, 1, 8)],
}

export function orderFor(arch: Arch): FdiCode[] {
  return arch === 'both' ? [...ARCH_ORDER.upper, ...ARCH_ORDER.lower] : ARCH_ORDER[arch]
}

/** A guess from the scan's title, so "Lower arch" starts on the lower teeth. */
export function guessArch(title: string, pins: ViewPin[]): Arch {
  const upper = pins.some((p) => Number(p.tooth[0]) <= 2)
  const lower = pins.some((p) => Number(p.tooth[0]) >= 3)
  if (upper && lower) return 'both'
  if (upper) return 'upper'
  if (lower) return 'lower'
  const text = title.toLowerCase()
  if (/both|full|bite/.test(text)) return 'both'
  if (/lower|mandib/.test(text)) return 'lower'
  return 'upper'
}

export type Transform = ParsedMesh['transform']

export function toView(pin: ScanPin, t: Transform): Vec3 {
  return [(pin.x - t.centre[0]) * t.scale, (pin.y - t.centre[1]) * t.scale, (pin.z - t.centre[2]) * t.scale]
}

export function toFile(pin: ViewPin, t: Transform): ScanPin {
  const [x, y, z] = pin.at
  return { tooth: pin.tooth, x: x / t.scale + t.centre[0], y: y / t.scale + t.centre[1], z: z / t.scale + t.centre[2] }
}

const dist2 = (a: ArrayLike<number>, b: ArrayLike<number>) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/**
 * How far from a pin a point may be and still count as that tooth: 1.25 times the median
 * distance between neighbouring pins (a pin sits on the biting surface, and the tooth's sides
 * reach about one tooth-width from it; between two pins the nearer one wins anyway). With one pin there are no neighbours, so a fixed
 * distance (about a molar's width on a typical arch) stands in.
 */
export function reachOf(pins: ViewPin[]) {
  if (pins.length < 2) return 0.18
  const nearest = pins.map((p) => Math.min(...pins.filter((q) => q !== p).map((q) => Math.sqrt(dist2(p.at, q.at)))))
  nearest.sort((a, b) => a - b)
  const mid = nearest.length >> 1
  const median = nearest.length % 2 ? nearest[mid] : (nearest[mid - 1] + nearest[mid]) / 2
  return 1.25 * median
}

/** The pin a point on the scan belongs to, or null when it is too far from every pin. */
export function nearestPin(point: Vec3, pins: ViewPin[], reach = reachOf(pins)): ViewPin | null {
  let best: ViewPin | null = null
  let bestD = reach * reach
  for (const pin of pins) {
    const d = dist2(point, pin.at)
    if (d <= bestD) {
      best = pin
      bestD = d
    }
  }
  return best
}

/** Above this many triangles the scan isn't shaded by tooth: working it out would stall the page. */
export const REGION_TRIANGLE_LIMIT = 1_500_000

/**
 * For every vertex, the index of its nearest pin (within reach), or -1. A Voronoi split of the
 * surface: good enough to light up "this tooth" without any detection.
 */
export function regionsOf(positions: Float32Array, pins: ViewPin[]): Int8Array {
  const count = positions.length / 3
  const out = new Int8Array(count).fill(-1)
  if (pins.length === 0) return out
  const reach2 = reachOf(pins) ** 2
  const flat = new Float32Array(pins.length * 3)
  pins.forEach((p, i) => flat.set(p.at, i * 3))
  for (let v = 0; v < count; v++) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    let best = -1
    let bestD = reach2
    for (let i = 0; i < pins.length; i++) {
      const dx = x - flat[i * 3]
      const dy = y - flat[i * 3 + 1]
      const dz = z - flat[i * 3 + 2]
      const d = dx * dx + dy * dy + dz * dz
      if (d <= bestD) {
        best = i
        bestD = d
      }
    }
    out[v] = best
  }
  return out
}
