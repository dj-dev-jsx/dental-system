// Turns the raw CC0 skull into the small, split asset the web app loads.
//
//   node process-skull.mjs <input.glb> <output.glb>
//
// What it does, in order:
//   1. Moves the skull into the app's frame: 1 unit = 1 mm, bite plane level,
//      origin at the front of the bite.
//   2. Cuts out the teeth sculpted into the skull, because the app draws its own.
//   3. Cuts the jaw joints, which leaves the jaw as a separate connected piece.
//   4. Simplifies, recomputes normals and compresses (meshopt, no external decoder).
//
// Keep the frame and arch constants in sync with apps/web/.../three/archLayout.ts.

import { readFileSync } from 'node:fs'
import { Document, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { meshopt, simplify, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('usage: node process-skull.mjs <input.glb> <output.glb>')
  process.exit(1)
}

// --- Frame: source skull units -> app millimetres -------------------------------
const UNITS_PER_MM = 0.00128 // from matching the skull's central incisor to 8.5 mm
const BITE_TILT = (13.5 * Math.PI) / 180 // the source skull's bite plane rises toward the front
const ORIGIN = { y: 0.0715, z: 0.148 } // front of the bite, in source units
const cosT = Math.cos(BITE_TILT)
const sinT = Math.sin(BITE_TILT)

function toAppFrame(x, y, z) {
  const qy = y - ORIGIN.y
  const qz = z - ORIGIN.z
  return [x / UNITS_PER_MM, (qy * cosT - qz * sinT) / UNITS_PER_MM, (qy * sinT + qz * cosT) / UNITS_PER_MM]
}

// --- Sculpted teeth: everything this close to the dental arch gets removed ------
const ARCH = { z0: -3.1, a: 0.00607, p: 2.43 }
const TOOTH_BAND_RADIUS = 8.5 // mm from the arch centre line
const TOOTH_BAND_HEIGHT = 12 // mm above and below the bite plane
const archSamples = []
for (let x = 0; x <= 43; x += 0.25) archSamples.push([x, ARCH.z0 - ARCH.a * x ** ARCH.p])

function distanceToArch(x, z) {
  const ax = Math.abs(x)
  let best = Infinity
  for (const [cx, cz] of archSamples) best = Math.min(best, (ax - cx) ** 2 + (z - cz) ** 2)
  return Math.sqrt(best)
}

// --- Jaw joints: where the jaw is fused to the skull, in source units -----------
const JOINT = { absX: [0.05, 0.095], y: [0.06, 0.085], z: [0.008, 0.036] }

function inJoint(x, y, z) {
  const ax = Math.abs(x)
  return ax >= JOINT.absX[0] && ax <= JOINT.absX[1] && y >= JOINT.y[0] && y <= JOINT.y[1] && z >= JOINT.z[0] && z <= JOINT.z[1]
}

// --- Read the GLB's positions and indices directly ------------------------------
// The source carries material extensions we discard, so the raw buffers are all we need.
const glb = readFileSync(inputPath)
const jsonLength = glb.readUInt32LE(12)
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'))
const bin = glb.subarray(20 + jsonLength + 8)

const primitive = gltf.meshes[0].primitives[0]
const translation = gltf.nodes[0].translation ?? [0, 0, 0]

function accessorInfo(index) {
  const accessor = gltf.accessors[index]
  const view = gltf.bufferViews[accessor.bufferView]
  return { accessor, offset: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride: view.byteStride ?? 0 }
}

const pos = accessorInfo(primitive.attributes.POSITION)
const idx = accessorInfo(primitive.indices)
const vertexCount = pos.accessor.count
const stride = pos.stride || 12

const source = new Float64Array(vertexCount * 3)
for (let i = 0; i < vertexCount; i++) {
  for (let k = 0; k < 3; k++) source[i * 3 + k] = bin.readFloatLE(pos.offset + i * stride + k * 4) + translation[k]
}

const indices = new Uint32Array(idx.accessor.count)
for (let i = 0; i < indices.length; i++) {
  indices[i] = idx.accessor.componentType === 5125 ? bin.readUInt32LE(idx.offset + i * 4) : bin.readUInt16LE(idx.offset + i * 2)
}

// --- Filter triangles -------------------------------------------------------------
const triangleCount = indices.length / 3
const keep = new Uint8Array(triangleCount)
for (let t = 0; t < triangleCount; t++) {
  let cx = 0
  let cy = 0
  let cz = 0
  for (let q = 0; q < 3; q++) {
    const v = indices[t * 3 + q]
    cx += source[v * 3]
    cy += source[v * 3 + 1]
    cz += source[v * 3 + 2]
  }
  cx /= 3
  cy /= 3
  cz /= 3
  const [mx, my, mz] = toAppFrame(cx, cy, cz)
  const inToothBand = Math.abs(my) < TOOTH_BAND_HEIGHT && distanceToArch(mx, mz) < TOOTH_BAND_RADIUS
  keep[t] = inToothBand || inJoint(cx, cy, cz) ? 0 : 1
}

// --- Split into connected pieces ---------------------------------------------------
// Vertices at the same position count as one, so texture seams don't split pieces.
const weldMap = new Map()
const representative = new Int32Array(vertexCount)
for (let i = 0; i < vertexCount; i++) {
  const key = `${Math.round(source[i * 3] * 1e5)},${Math.round(source[i * 3 + 1] * 1e5)},${Math.round(source[i * 3 + 2] * 1e5)}`
  if (!weldMap.has(key)) weldMap.set(key, i)
  representative[i] = weldMap.get(key)
}

const parent = Int32Array.from({ length: vertexCount }, (_, i) => i)
function find(x) {
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]]
    x = parent[x]
  }
  return x
}
for (let t = 0; t < triangleCount; t++) {
  if (!keep[t]) continue
  const a = find(representative[indices[t * 3]])
  parent[find(representative[indices[t * 3 + 1]])] = a
  parent[find(representative[indices[t * 3 + 2]])] = a
}

const pieces = new Map()
for (let t = 0; t < triangleCount; t++) {
  if (!keep[t]) continue
  const root = find(representative[indices[t * 3]])
  if (!pieces.has(root)) pieces.set(root, [])
  pieces.get(root).push(t)
}

const ranked = [...pieces.values()].sort((a, b) => b.length - a.length)
if (ranked.length < 2 || ranked[1].length < 5000) {
  throw new Error(`Jaw did not separate: largest pieces are ${ranked.slice(0, 3).map((p) => p.length).join(', ')} triangles. Adjust JOINT.`)
}
const [craniumTriangles, jawTriangles] = ranked
console.log(`cranium ${craniumTriangles.length} tris, jaw ${jawTriangles.length} tris, dropped ${ranked.length - 2} fragments`)

// --- Build the new document ---------------------------------------------------------
const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('skull')

function addPiece(name, triangles) {
  const remap = new Map()
  const positions = []
  const pieceIndices = []
  for (const t of triangles) {
    for (let q = 0; q < 3; q++) {
      const v = representative[indices[t * 3 + q]]
      if (!remap.has(v)) {
        remap.set(v, remap.size)
        positions.push(...toAppFrame(source[v * 3], source[v * 3 + 1], source[v * 3 + 2]))
      }
      pieceIndices.push(remap.get(v))
    }
  }
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(pieceIndices)).setBuffer(buffer))
  const mesh = doc.createMesh(name).addPrimitive(prim)
  scene.addChild(doc.createNode(name).setMesh(mesh))
}

addPiece('cranium', craniumTriangles)
addPiece('mandible', jawTriangles)

await MeshoptSimplifier.ready
await MeshoptEncoder.ready

// gltf-transform's normals() gives flat shading and un-welds the mesh. The ghost
// shader needs smooth normals, so average face normals (weighted by area) instead.
function smoothNormals() {
  return (document) => {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const p = prim.getAttribute('POSITION').getArray()
        const tris = prim.getIndices().getArray()
        const out = new Float32Array(p.length)
        for (let t = 0; t < tris.length; t += 3) {
          const [a, b, c] = [tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3]
          const [ux, uy, uz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
          const [vx, vy, vz] = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
          const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
          for (const v of [a, b, c]) {
            out[v] += nx
            out[v + 1] += ny
            out[v + 2] += nz
          }
        }
        for (let v = 0; v < out.length; v += 3) {
          const length = Math.hypot(out[v], out[v + 1], out[v + 2]) || 1
          out[v] /= length
          out[v + 1] /= length
          out[v + 2] /= length
        }
        prim.setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(out).setBuffer(buffer))
      }
    }
  }
}

await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.002 }),
  smoothNormals(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)

const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
})
await io.write(outputPath, doc)

console.log(`wrote ${outputPath}`)
