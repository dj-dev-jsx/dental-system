// The chart's standard model (faint skull, standard teeth and gums), built for the scan viewer
// and bent to meet the patient's scan (see placement.ts). The scan stays at its true size and
// shape; only this model is moved, scaled and bent.
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshPhysicalMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { FDI_CODES, type FdiCode } from '../../dental-chart/model/fdi'
import { buildPlacedTooth, JAW_OPEN_RADIANS, jawOf } from '../../dental-chart/three/archLayout'
import { createGhostMaterial, SKULL_URL } from '../../dental-chart/three/ghostMaterial'
import { buildGumGeometry } from '../../dental-chart/three/gumGeometry'
import type { Jaw } from '../../dental-chart/three/toothShape'
import { apply, type Fit, fitSimilarity, type Vec3 } from './fitMath'
import { hinge, type Placement, type ScanJaws, standardTooth } from './placement'
import type { Transform } from './pinMath'
import { type Warp, warpPositions, warpPoint } from './warp'

export type { ScanJaws }

let skull: Promise<{ cranium: Mesh; mandible: Mesh }> | null = null

/** Loads the skull once per page visit (the browser caches the file too). */
function loadSkull() {
  skull ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(SKULL_URL)
    .then((gltf) => {
      gltf.scene.updateMatrixWorld(true)
      const cranium = gltf.scene.getObjectByName('cranium') as Mesh | undefined
      const mandible = gltf.scene.getObjectByName('mandible') as Mesh | undefined
      if (!cranium?.isMesh || !mandible?.isMesh) throw new Error('skull model incomplete')
      return { cranium, mandible }
    })
    .catch((error: unknown) => {
      skull = null
      throw error
    })
  return skull
}

/**
 * How far the lower jaw is open. A scan of one jaw sits in the chart's usual pose (slightly
 * open, so the biting surfaces show); a scan of both jaws was taken biting, so it is closed.
 */
export const jawOpenFor = (jaws: ScanJaws) => (jaws === 'both' ? 0 : JAW_OPEN_RADIANS)

/**
 * Chart coordinates to viewer coordinates for a fit (chart = s R file + t; view = (file - c) k):
 * view = (k / s) R^T (chart - t) - k c. The scan is untouched; only the model is scaled.
 */
export function chartToView(fit: Fit, transform: Transform): Matrix4 {
  const r = fit.rotation
  const k = transform.scale
  const f = k / fit.scale
  // R^T, row by row
  const m = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]]
  const [tx, ty, tz] = fit.translation
  const shift = [0, 1, 2].map((row) => -f * (m[row * 3] * tx + m[row * 3 + 1] * ty + m[row * 3 + 2] * tz) - k * transform.centre[row])
  return new Matrix4().set(
    f * m[0], f * m[1], f * m[2], shift[0],
    f * m[3], f * m[4], f * m[5], shift[1],
    f * m[6], f * m[7], f * m[8], shift[2],
    0, 0, 0, 1,
  )
}

/**
 * Moves points (flat x,y,z, in place) as a whole the way the bend would move them: the best
 * turn and shift for the bend, so a tooth follows the arch without being squeezed or sheared
 * (a bend about a tooth wide could otherwise dent a crown).
 */
function bendRigidly(positions: Float32Array, warp: Warp) {
  const moved = positions.slice()
  warpPositions(warp, moved)
  const from: Vec3[] = []
  const to: Vec3[] = []
  const step = Math.max(1, Math.floor(positions.length / 3 / 400))
  for (let i = 0; i < positions.length / 3; i += step) {
    from.push([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]])
    to.push([moved[i * 3], moved[i * 3 + 1], moved[i * 3 + 2]])
  }
  const fit = fitSimilarity(from, to, { scalePrior: 1, scaleStrength: 1e9 })
  if (!fit) return positions.set(moved)
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = apply({ ...fit, scale: 1 }, [positions[i], positions[i + 1], positions[i + 2]])
    positions[i] = x
    positions[i + 1] = y
    positions[i + 2] = z
  }
}

/**
 * A copy of a geometry with plain float positions, moved by `matrix` and bent by `warp`
 * (the skull's file stores small integers, which can't take the bend); `rigid` moves it as a
 * whole (a tooth) instead of bending it.
 */
function bent(source: BufferGeometry, matrix: Matrix4, warp: Warp | null, rigid = false): BufferGeometry {
  const from = source.getAttribute('position')
  const positions = new Float32Array(from.count * 3)
  const v = new Vector3()
  for (let i = 0; i < from.count; i++) {
    v.fromBufferAttribute(from, i).applyMatrix4(matrix)
    positions[i * 3] = v.x
    positions[i * 3 + 1] = v.y
    positions[i * 3 + 2] = v.z
  }
  if (warp && rigid) bendRigidly(positions, warp)
  else if (warp) warpPositions(warp, positions)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const colour = source.getAttribute('color')
  if (colour) geometry.setAttribute('color', colour.clone())
  if (source.index) geometry.setIndex(source.index.clone())
  if (matrix.determinant() < 0 && geometry.index) {
    const index = geometry.index
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1)
      index.setX(i + 1, index.getX(i + 2))
      index.setX(i + 2, b)
    }
  }
  geometry.computeVertexNormals()
  return geometry
}

/** The gum's edge colour, for blending the scan's cut crowns into it (CSS hex). */
export const GUM_COLLAR = '#e79aa0'
/** Standard teeth: the chart's healthy tooth, a touch dimmer so the scanned crowns stay the brightest. */
const TOOTH_TINT = '#e4e4e4'

export type StandardToothMesh = { tooth: FdiCode; mesh: Mesh; material: MeshPhysicalMaterial; anchor: Vec3 }

export type SkullScene = {
  group: Group
  /** The standard teeth drawn (not scanned), each with its biting point in viewer coordinates. */
  teeth: StandardToothMesh[]
  /** Lights a standard tooth up (or none). */
  select: (tooth: FdiCode | null) => void
  dispose: () => void
}

export type SkullOptions = {
  placement: Placement
  /** Chart to viewer coordinates (the rigid step). */
  toView: Matrix4
  /** Teeth the scan shows: their standard teeth are left out. */
  scanned: ReadonlySet<FdiCode>
  /** Teeth the chart says are missing or extracted: left out too, so the gap shows. */
  absent: ReadonlySet<FdiCode>
}

/** Where each standard tooth's biting point ends up, in the chart's frame after the bend. */
export function bentBitePoints(placement: Placement): Map<FdiCode, Vec3> {
  return new Map(
    FDI_CODES.map((code) => {
      const bite = standardTooth(code, placement.open).bite
      const bend = placement.warp[jawOf(code)]
      return [code, bend ? warpPoint(bend, bite) : bite]
    }),
  )
}

/**
 * The faint skull, the standard gums, and a standard tooth wherever the scan has none (a
 * partial scan, the other jaw), all bent to meet the scan. The scanned teeth's standard teeth
 * are left out: a standard tooth would sit through a real one.
 */
export async function buildSkullScene({ placement, toView, scanned, absent }: SkullOptions): Promise<SkullScene> {
  const { cranium, mandible } = await loadSkull()
  const { warp, open } = placement
  const swing = hinge(open)
  const scale = toView.getMaxScaleOnAxis()
  const focus = new Vector3(0, 0, -30).applyMatrix4(toView)
  const ghost = createGhostMaterial({ focus, fadeNear: 70 * scale, fadeFar: 190 * scale })
  const disposables: { dispose: () => void }[] = [ghost]

  const group = new Group()
  group.matrixAutoUpdate = false
  group.matrix.copy(toView)

  // The bone: bent near the teeth only (the bend fades out by 36 mm from them), each jaw by its own bend.
  const craniumGeometry = bent(cranium.geometry, cranium.matrixWorld, warp.upper)
  const mandibleGeometry = bent(mandible.geometry, swing.clone().multiply(mandible.matrixWorld), warp.lower)
  for (const geometry of [craniumGeometry, mandibleGeometry]) {
    const mesh = new Mesh(geometry, ghost)
    // Drawn before the gums, as on the chart: the gums' faded top must not hide the bone behind.
    mesh.renderOrder = 1
    group.add(mesh)
    disposables.push(geometry)
  }

  // The gums of both jaws, exactly as on the chart (same shape, colours, fade and material), so
  // the view reads as the chart page; drawn after the bone so their faded top hides none of it.
  const gumMaterial = new MeshPhysicalMaterial({ vertexColors: true, transparent: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 })
  disposables.push(gumMaterial)
  for (const jaw of ['upper', 'lower'] as Jaw[]) {
    const source = buildGumGeometry(jaw)
    const geometry = bent(source, jaw === 'lower' ? swing : new Matrix4(), warp[jaw])
    source.dispose()
    const mesh = new Mesh(geometry, gumMaterial)
    mesh.renderOrder = 2
    group.add(mesh)
    disposables.push(geometry)
  }

  // A standard tooth wherever the scan shows none: the chart's tooth, solid, bent with the arch.
  const teeth: StandardToothMesh[] = []
  const bites = bentBitePoints(placement)
  for (const code of FDI_CODES) {
    if (scanned.has(code) || absent.has(code)) continue
    const source = buildPlacedTooth(code)
    const geometry = bent(source, jawOf(code) === 'lower' ? swing : new Matrix4(), warp[jawOf(code)], true)
    source.dispose()
    const material = new MeshPhysicalMaterial({ vertexColors: true, color: TOOTH_TINT, roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.25 })
    const mesh = new Mesh(geometry, material)
    mesh.userData.tooth = code
    group.add(mesh)
    disposables.push(geometry, material)
    const anchor = new Vector3(...bites.get(code)!).applyMatrix4(toView)
    teeth.push({ tooth: code, mesh, material, anchor: [anchor.x, anchor.y, anchor.z] })
  }
  group.updateMatrixWorld(true)

  return {
    group,
    teeth,
    select: (tooth) => {
      // As on the chart: the picked tooth glows a little.
      for (const t of teeth) {
        t.material.emissive.set(t.tooth === tooth ? '#ffffff' : '#000000')
        t.material.emissiveIntensity = t.tooth === tooth ? 0.25 : 0
      }
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}

/**
 * Which standard teeth the scan shows without a pin: a tooth counts when enough of the scan's
 * surface lies within `radius` of its biting point and nearer to it than to any pinned tooth (so
 * the side of a neighbouring scanned tooth doesn't count). All in viewer coordinates; `perMm2` is
 * how many points per square millimetre the scan has (see pointsPerMm2), so the count means the
 * same on any scan. A large scan is sampled.
 */
/** The share of a crown-top patch that must be scanned surface for the tooth to count as scanned. */
const COVERED_SHARE = 0.15

export function coveredBy(positions: Float32Array, points: Vec3[], pinned: Vec3[], radius: number, unitsPerMm: number, perMm2: number): boolean[] {
  const counts = points.map(() => 0)
  const r2 = radius * radius
  const count = positions.length / 3
  const stride = Math.max(1, Math.floor(count / 300_000))
  for (let v = 0; v < count; v += stride) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    let best = -1
    let bestD = r2
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const d = (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2
      if (d <= bestD) {
        best = i
        bestD = d
      }
    }
    if (best < 0) continue
    let neighbour = false
    for (const p of pinned) {
      if ((x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2 < bestD) {
        neighbour = true
        break
      }
    }
    if (!neighbour) counts[best] += stride
  }
  // A crown's top is roughly a disc of that radius; a gap's gum ridge lies well below it.
  const needed = Math.PI * (radius / unitsPerMm) ** 2 * perMm2 * COVERED_SHARE
  return counts.map((n) => n >= needed)
}

/** How many of the scan's points there are per square millimetre of its surface, on average. */
export function pointsPerMm2(positions: Float32Array, index: Uint32Array | null, unitsPerMm: number): number {
  const triangles = index ? index.length / 3 : Math.floor(positions.length / 9)
  const corner = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k) * 3
  let area = 0
  const stride = Math.max(1, Math.floor(triangles / 200_000))
  for (let t = 0; t < triangles; t += stride) {
    const a = corner(t, 0)
    const b = corner(t, 1)
    const c = corner(t, 2)
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  area *= stride / (unitsPerMm * unitsPerMm)
  return area > 0 ? positions.length / 3 / area : 1
}

/** Every few vertices of a standard tooth's crown (no root), bent with the arch, in the chart's frame. */
export function standardCrownPoints(placement: Placement, code: FdiCode): Vec3[] {
  const source = buildPlacedTooth(code)
  const position = source.getAttribute('position')
  const swing = jawOf(code) === 'lower' ? hinge(placement.open) : new Matrix4()
  const v = new Vector3()
  const out: Vec3[] = []
  // The first vertices are the root stub (an apex and three rings of 40); the crown follows.
  for (let i = 121; i < position.count; i += 5) {
    v.fromBufferAttribute(position, i).applyMatrix4(swing)
    out.push([v.x, v.y, v.z])
  }
  source.dispose()
  const bend = placement.warp[jawOf(code)]
  if (bend) {
    const flat = Float32Array.from(out.flat())
    bendRigidly(flat, bend)
    for (let i = 0; i < out.length; i++) out[i] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]]
  }
  return out
}

/**
 * For each standard crown (points in viewer coordinates), the share of its points that have
 * some of the scan's surface within `radius`: how much of the space the standard tooth would
 * take is already filled by the scan. A large scan is sampled into a grid of `radius` cells.
 */
export function occupiedShare(positions: Float32Array, crowns: Vec3[][], radius: number): number[] {
  const count = positions.length / 3
  const stride = Math.max(1, Math.floor(count / 600_000))
  const cell = radius
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  // Only the scan near the crowns matters: keep cells within reach of a crown point.
  const wanted = new Set<string>()
  for (const crown of crowns) for (const [x, y, z] of crown) wanted.add(key(x, y, z))
  const grid = new Map<string, number[]>()
  for (let v = 0; v < count; v += stride) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    const cz = Math.floor(z / cell)
    let near = false
    for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1 && !near; dy++) for (let dz = -1; dz <= 1 && !near; dz++) near = wanted.has(`${cx + dx},${cy + dy},${cz + dz}`)
    if (!near) continue
    const k = `${cx},${cy},${cz}`
    const list = grid.get(k)
    if (list) list.push(x, y, z)
    else grid.set(k, [x, y, z])
  }
  const r2 = radius * radius
  return crowns.map((crown) => {
    let hit = 0
    for (const [x, y, z] of crown) {
      const cx = Math.floor(x / cell)
      const cy = Math.floor(y / cell)
      const cz = Math.floor(z / cell)
      let found = false
      for (let dx = -1; dx <= 1 && !found; dx++)
        for (let dy = -1; dy <= 1 && !found; dy++)
          for (let dz = -1; dz <= 1 && !found; dz++) {
            const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
            if (!list) continue
            for (let i = 0; i < list.length; i += 3) {
              if ((list[i] - x) ** 2 + (list[i + 1] - y) ** 2 + (list[i + 2] - z) ** 2 <= r2) {
                found = true
                break
              }
            }
          }
      if (found) hit++
    }
    return crown.length > 0 ? hit / crown.length : 0
  })
}
