import { BufferAttribute, BufferGeometry, Color, MathUtils } from 'three'
import type { Position } from '../model/fdi'

// Generates one tooth from average adult measurements (millimetres).
//
// Local axes: +y points toward the biting surface, y = 0 is the neck of the tooth,
// +x points away from the midline (distal), +z points toward the lips/cheek (buccal).
//
// These are generated stand-ins, close enough to read as real teeth. A licensed
// sculpted set can replace them later: the app only depends on `tooth_XX` meshes.

export type Jaw = 'upper' | 'lower'
type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar'
type Cusp = [x: number, z: number, height: number]

export type ToothSpec = {
  kind: ToothKind
  width: number // along the arch
  depth: number // cheek to tongue
  crown: number
  cusps?: Cusp[]
}

const UPPER: Record<Position, ToothSpec> = {
  1: { kind: 'incisor', width: 8.6, depth: 7, crown: 10.6 },
  2: { kind: 'incisor', width: 6.6, depth: 6, crown: 9 },
  3: { kind: 'canine', width: 7.6, depth: 8, crown: 10.2 },
  4: { kind: 'premolar', width: 7, depth: 9, crown: 8.4, cusps: [[0, 0.5, 1], [0, -0.5, 0.82]] },
  5: { kind: 'premolar', width: 6.9, depth: 9, crown: 7.8, cusps: [[0, 0.5, 1], [0, -0.5, 0.9]] },
  6: { kind: 'molar', width: 10.2, depth: 11, crown: 7.5, cusps: [[-0.48, 0.5, 1], [0.48, 0.5, 0.9], [-0.42, -0.5, 1], [0.5, -0.55, 0.62]] },
  7: { kind: 'molar', width: 9.6, depth: 11, crown: 7.2, cusps: [[-0.48, 0.5, 1], [0.48, 0.48, 0.78], [-0.4, -0.5, 0.95], [0.5, -0.5, 0.45]] },
  8: { kind: 'molar', width: 8.6, depth: 10.4, crown: 6.6, cusps: [[-0.45, 0.45, 1], [0.45, 0.45, 0.65], [-0.2, -0.5, 0.85]] },
}

const LOWER: Record<Position, ToothSpec> = {
  1: { kind: 'incisor', width: 5.2, depth: 6, crown: 9 },
  2: { kind: 'incisor', width: 5.8, depth: 6.4, crown: 9.4 },
  3: { kind: 'canine', width: 6.9, depth: 7.6, crown: 10.6 },
  4: { kind: 'premolar', width: 7, depth: 7.6, crown: 8.6, cusps: [[0, 0.42, 1], [0, -0.52, 0.5]] },
  5: { kind: 'premolar', width: 7.1, depth: 8.2, crown: 8, cusps: [[0, 0.42, 1], [-0.42, -0.5, 0.72], [0.42, -0.5, 0.6]] },
  6: { kind: 'molar', width: 11.2, depth: 10.4, crown: 7.4, cusps: [[-0.58, 0.48, 0.88], [0, 0.55, 0.84], [0.62, 0.38, 0.68], [-0.5, -0.5, 1], [0.5, -0.5, 0.94]] },
  7: { kind: 'molar', width: 10.6, depth: 10, crown: 7, cusps: [[-0.48, 0.48, 0.9], [0.48, 0.48, 0.82], [-0.48, -0.5, 1], [0.48, -0.5, 0.92]] },
  8: { kind: 'molar', width: 10.2, depth: 9.8, crown: 6.6, cusps: [[-0.48, 0.45, 0.9], [0.46, 0.45, 0.72], [-0.46, -0.5, 1], [0.42, -0.48, 0.8]] },
}

export function toothSpec(jaw: Jaw, position: Position): ToothSpec {
  return jaw === 'upper' ? UPPER[position] : LOWER[position]
}

const SEGMENTS = 40
const ROOT_RINGS = 3
// Roots are only stubs, always hidden under the gum: fully drawn roots looked like spikes.
const ROOT_STUB = 3
const WALL_RINGS = 10
const CAP_RINGS = 20

const { lerp, smoothstep } = MathUtils

// How far up the crown the side walls go before the biting surface starts.
const WALL_FRACTION: Record<ToothKind, number> = { incisor: 0.84, canine: 0.66, premolar: 0.62, molar: 0.6 }

// Width, depth and forward lean of the crown at height t (0 = neck, 1 = wall top).
function wallProfile(kind: ToothKind, t: number) {
  switch (kind) {
    case 'incisor':
      return {
        wx: lerp(0.72, 1, smoothstep(t, 0, 0.72)),
        wz: t < 0.25 ? lerp(0.84, 1, t / 0.25) : lerp(1, 0.24, ((t - 0.25) / 0.75) ** 1.15),
        lean: 0.24 * t ** 1.3,
      }
    case 'canine':
      return {
        wx: t < 0.55 ? lerp(0.74, 1, smoothstep(t, 0, 0.55)) : lerp(1, 0.86, (t - 0.55) / 0.45),
        wz: t < 0.3 ? lerp(0.84, 1, t / 0.3) : lerp(1, 0.6, (t - 0.3) / 0.7),
        lean: 0.12 * t,
      }
    case 'premolar':
      return {
        wx: t < 0.55 ? lerp(0.76, 1, smoothstep(t, 0, 0.55)) : lerp(1, 0.88, (t - 0.55) / 0.45),
        wz: t < 0.45 ? lerp(0.78, 1, smoothstep(t, 0, 0.45)) : lerp(1, 0.82, (t - 0.45) / 0.55),
        lean: 0,
      }
    case 'molar':
      return {
        wx: t < 0.5 ? lerp(0.8, 1, smoothstep(t, 0, 0.5)) : lerp(1, 0.9, (t - 0.5) / 0.5),
        wz: t < 0.4 ? lerp(0.8, 1, smoothstep(t, 0, 0.4)) : lerp(1, 0.84, (t - 0.4) / 0.6),
        lean: 0,
      }
  }
}

/** Fraction (0-1) of a cervical half-depth; the gums use this to hug each neck. */
export const CERVICAL_DEPTH_SCALE = 0.8

// Sculpts the biting surface. Returns its height (0-1) and how deep in a fissure it is.
function occlusalSurface(spec: ToothSpec, nx: number, nz: number, rho: number) {
  if (spec.kind === 'incisor') {
    const corner = nx ** 4 * (nx > 0 ? 0.55 : 0.25)
    const mamelons = 0.05 * Math.cos(nx * Math.PI * 3)
    return { height: (1 - rho ** 6) * (1 - corner + mamelons), fissure: 0 }
  }
  if (spec.kind === 'canine') {
    // A rounded point, not a fang. Starting steep blends it smoothly into the crown's sides.
    return { height: 0.75 * (1 - rho * rho) ** 0.6 + 0.25 * (1 - rho), fissure: 0 }
  }

  let height = 0.2
  for (const [cx, cz, h] of spec.cusps ?? []) {
    height += 0.78 * h * Math.exp(-((nx - cx) ** 2 + (nz - cz) ** 2) / 0.28)
  }
  height += 0.12 * Math.exp(-(((rho - 0.78) / 0.1) ** 2)) // marginal ridge

  let fissure = 0.3 * Math.exp(-(nz ** 2) / 0.012) * (1 - nx ** 4)
  if (spec.kind === 'molar') fissure += 0.2 * Math.exp(-(nx ** 2) / 0.012) * (1 - nz ** 4)

  // Starts steep at the rim, so the crown's sides roll into the biting surface with no crease.
  const taper = (1 - rho ** 4) ** 0.6
  return { height: taper * Math.max(0.05, height - fissure), fissure: Math.min(1, fissure * 2.4) }
}

const ROOT_COLOR = new Color('#d6c294')
const NECK_COLOR = new Color('#e8d6ae')
const BODY_COLOR = new Color('#f4edda')
const EDGE_COLOR = new Color('#f4f5ef')
const FISSURE_COLOR = new Color('#9c8a60')
const scratch = new Color()

/** @param seed makes each tooth slightly different, so no two look stamped out. */
export function buildToothGeometry(spec: ToothSpec, seed: number): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const halfW = spec.width / 2
  const halfD = spec.depth / 2
  const squareness = spec.kind === 'molar' ? 2.9 : spec.kind === 'premolar' ? 2.5 : 2.3
  const wallFraction = WALL_FRACTION[spec.kind]
  const wallHeight = spec.crown * wallFraction
  const capHeight = spec.crown - wallHeight
  const phaseA = seed * 1.7
  const phaseB = seed * 2.9

  // Directions around the tooth: a rounded square, with a little natural wobble.
  const directions = Array.from({ length: SEGMENTS }, (_, i) => {
    const theta = (i / SEGMENTS) * Math.PI * 2
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const wobble = 1 + 0.014 * Math.sin(2 * theta + phaseA) + 0.009 * Math.sin(3 * theta + phaseB)
    return {
      x: Math.sign(c) * Math.abs(c) ** (2 / squareness) * wobble,
      z: Math.sign(s) * Math.abs(s) ** (2 / squareness) * wobble,
    }
  })

  const push = (x: number, y: number, z: number, color: Color) => {
    positions.push(x, y, z)
    colors.push(color.r, color.g, color.b)
  }

  const neck = wallProfile(spec.kind, 0)

  // Root stub apex (index 0), then rings up to the neck.
  push(0, -ROOT_STUB, 0, ROOT_COLOR)
  for (let j = 1; j <= ROOT_RINGS; j++) {
    const t = j / ROOT_RINGS
    const r = t ** 0.6
    const y = -ROOT_STUB * (1 - t)
    for (const d of directions) push(d.x * halfW * neck.wx * r, y, d.z * halfD * neck.wz * r, ROOT_COLOR)
  }

  // Side walls of the crown.
  for (let j = 1; j <= WALL_RINGS; j++) {
    const t = j / WALL_RINGS
    const p = wallProfile(spec.kind, t)
    scratch.copy(NECK_COLOR).lerp(BODY_COLOR, smoothstep(t, 0, 0.45))
    if (spec.kind === 'incisor') scratch.lerp(EDGE_COLOR, smoothstep(t, 0.6, 1))
    for (const d of directions) {
      let z = d.z * halfD * p.wz
      // Incisors and canines are hollowed on the tongue side (shovel shape).
      if (d.z < 0 && (spec.kind === 'incisor' || spec.kind === 'canine')) {
        z *= 1 - 0.32 * Math.sin(Math.PI * t) * (1 - d.x * d.x)
      }
      push(d.x * halfW * p.wx, wallHeight * t, z + spec.depth * p.lean, scratch)
    }
  }

  // Biting surface: rings shrinking toward the centre.
  const top = wallProfile(spec.kind, 1)
  const surfaceAt = (nx: number, nz: number, rho: number) => {
    const surface = occlusalSurface(spec, nx, nz, rho)
    return {
      x: nx * halfW * top.wx,
      y: wallHeight + capHeight * surface.height,
      z: nz * halfD * top.wz + spec.depth * top.lean,
      fissure: surface.fissure,
    }
  }
  const capColor = (fissure: number) =>
    scratch.copy(spec.kind === 'incisor' ? EDGE_COLOR : BODY_COLOR).lerp(FISSURE_COLOR, fissure)

  for (let j = 1; j <= CAP_RINGS; j++) {
    const rho = 1 - j / (CAP_RINGS + 1)
    for (const d of directions) {
      const s = surfaceAt(d.x * rho, d.z * rho, rho)
      push(s.x, s.y, s.z, capColor(s.fissure))
    }
  }
  const pole = surfaceAt(0, 0, 0)
  push(pole.x, pole.y, pole.z, capColor(pole.fissure))

  // Stitch the rings together.
  const ringCount = ROOT_RINGS + WALL_RINGS + CAP_RINGS
  const lastIndex = 1 + ringCount * SEGMENTS
  const index: number[] = []
  const at = (ring: number, i: number) => 1 + ring * SEGMENTS + ((i + SEGMENTS) % SEGMENTS)
  for (let i = 0; i < SEGMENTS; i++) {
    index.push(0, at(0, i), at(0, i + 1))
    for (let ring = 0; ring < ringCount - 1; ring++) {
      const a = at(ring, i)
      const b = at(ring, i + 1)
      const c = at(ring + 1, i)
      const d = at(ring + 1, i + 1)
      index.push(a, c, b, b, c, d)
    }
    index.push(lastIndex, at(ringCount - 1, i + 1), at(ringCount - 1, i))
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.setIndex(index)
  return geometry
}
