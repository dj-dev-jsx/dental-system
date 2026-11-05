import { BufferGeometry, Matrix4, Vector3 } from 'three'
import { parseFdi, type FdiCode, type Position } from '../model/fdi'
import { buildToothGeometry, CERVICAL_DEPTH_SCALE, toothSpec, type Jaw } from './toothShape'

// The chart's coordinate frame: 1 unit = 1 mm. The bite plane is y = 0, the origin is
// at the front of the bite, +y is up, +z points out of the mouth, and the viewer
// looks from +z, so the PATIENT's right is on the viewer's LEFT (-x).
//
// The arch constants match the skull and tools/model-pipeline/process-skull.mjs.

const POSITIONS: Position[] = [1, 2, 3, 4, 5, 6, 7, 8]

/** Where the jaw hinges (the condyles), and how far it is opened by default. */
export const JAW_HINGE: [number, number, number] = [0, 23.4, -95.6]
export const JAW_OPEN_RADIANS = (7.5 * Math.PI) / 180

// Half-parabola centre line: z = z0 - a * (x / xScale) ^ p
const ARCH: Record<Jaw, { z0: number; a: number; p: number; xScale: number }> = {
  upper: { z0: -3.1, a: 0.00607, p: 2.43, xScale: 1 },
  lower: { z0: -5.2, a: 0.00607, p: 2.43, xScale: 0.95 },
}

type ArchSample = { s: number; x: number; z: number }

function buildArchTable(jaw: Jaw): ArchSample[] {
  const { z0, a, p, xScale } = ARCH[jaw]
  const table: ArchSample[] = [{ s: 0, x: 0, z: z0 }]
  for (let x = 0.05; x <= 50; x += 0.05) {
    const z = z0 - a * (x / xScale) ** p
    const last = table[table.length - 1]
    table.push({ s: last.s + Math.hypot(x - last.x, z - last.z), x, z })
  }
  return table
}

const ARCH_TABLES: Record<Jaw, ArchSample[]> = { upper: buildArchTable('upper'), lower: buildArchTable('lower') }

/** A point on the arch. `s` is the distance along it from the midline, in mm; side -1 is the viewer's left. */
export function archPoint(jaw: Jaw, s: number, side: -1 | 1) {
  const table = ARCH_TABLES[jaw]
  let lo = 0
  let hi = table.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (table[mid].s < s) lo = mid
    else hi = mid
  }
  const a = table[lo]
  const b = table[hi]
  const t = Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s)))
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  return {
    position: new Vector3(side * (a.x + dx * t), 0, a.z + dz * t),
    tangent: new Vector3((side * dx) / length, 0, dz / length), // away from the midline
    outward: new Vector3((side * -dz) / length, 0, dx / length), // toward the lips/cheek
  }
}

// Each crown tips a little, the way real teeth sit in the bone (degrees, + = crown outward).
const CROWN_TIP: Record<Jaw, Record<Position, number>> = {
  upper: { 1: 12, 2: 11, 3: 5, 4: 3, 5: 3, 6: 4, 7: 4, 8: 3 },
  lower: { 1: 7, 2: 6, 3: 2, 4: -4, 5: -6, 6: -9, 7: -10, 8: -10 },
}

const CONTACT_OVERLAP = 0.1 // neighbouring teeth touch, as they do in a healthy arch

// Curve of Spee: the bite dips slightly toward the molars.
const biteCurve = (s: number) => -1.4 * Math.sin(Math.PI * Math.min(s / 58, 1))

export type ToothSlot = {
  position: Position
  sStart: number
  sCenter: number
  sEnd: number
  matrix: Matrix4 // with the arch mirrored for `side`
  neckOffset: number // neck's distance outward from the arch line
  neckY: number
  halfDepth: number // half the tooth's depth at the neck
}

function buildSlots(jaw: Jaw, side: -1 | 1): ToothSlot[] {
  const occlusal = new Vector3(0, jaw === 'upper' ? -1 : 1, 0)
  let cursor = 0
  return POSITIONS.map((position) => {
    const spec = toothSpec(jaw, position)
    const sStart = cursor
    const sCenter = cursor + spec.width / 2
    cursor += spec.width - CONTACT_OVERLAP

    const { position: arch, tangent, outward } = archPoint(jaw, sCenter, side)
    const overlap = position <= 3 ? 1.5 : 0.4 // the upper front teeth overlap the lower ones
    const tipY = biteCurve(sCenter) + (jaw === 'upper' ? -overlap : overlap)
    const tip = arch.clone().setY(tipY)

    // tip of the crown stays put; the tooth pivots around it
    const matrix = new Matrix4()
      .makeTranslation(tip.x, tip.y, tip.z)
      .multiply(new Matrix4().makeBasis(tangent, occlusal, outward))
      .multiply(new Matrix4().makeRotationX((CROWN_TIP[jaw][position] * Math.PI) / 180))
      .multiply(new Matrix4().makeTranslation(0, -spec.crown, 0))

    const neck = new Vector3().applyMatrix4(matrix)
    return {
      position,
      sStart,
      sCenter,
      sEnd: sStart + spec.width,
      matrix,
      neckOffset: neck.clone().sub(arch).dot(outward),
      neckY: neck.y,
      halfDepth: (spec.depth / 2) * CERVICAL_DEPTH_SCALE,
    }
  })
}

export function jawSlots(jaw: Jaw): ToothSlot[] {
  // Both sides mirror each other; offsets along the arch are the same.
  return buildSlots(jaw, 1)
}

export function jawOf(code: FdiCode): Jaw {
  const { quadrant } = parseFdi(code)
  return quadrant === 1 || quadrant === 2 ? 'upper' : 'lower'
}

/** Builds a tooth's geometry in chart coordinates (already placed in its arch). */
export function buildPlacedTooth(code: FdiCode): BufferGeometry {
  const { quadrant, position } = parseFdi(code)
  const jaw = jawOf(code)
  const side = quadrant === 1 || quadrant === 4 ? -1 : 1
  const slot = buildSlots(jaw, side)[position - 1]

  const geometry = buildToothGeometry(toothSpec(jaw, position), Number(code))
  geometry.applyMatrix4(slot.matrix)

  // Teeth on one side are mirror images. Mirroring turns triangles inside out, so flip them back.
  if (slot.matrix.determinant() < 0) {
    const index = geometry.index!
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1)
      index.setX(i + 1, index.getX(i + 2))
      index.setX(i + 2, b)
    }
  }
  geometry.computeVertexNormals()
  return geometry
}
