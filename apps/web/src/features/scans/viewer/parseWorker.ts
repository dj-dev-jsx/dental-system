/// <reference lib="webworker" />
// Turns the bytes of a scan file into arrays the GPU can use. It runs off the page's thread,
// so a large scan doesn't freeze the screen while it's read.
import { BufferAttribute, BufferGeometry } from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ParsedMesh, ParseRequest, ParseResponse } from './parseTypes'

/** Above this many vertices, welding shared corners (for smooth shading) costs too much. */
const WELD_LIMIT = 900_000

function toFloat3(attribute: BufferAttribute): Float32Array {
  if (attribute.array instanceof Float32Array && attribute.itemSize === 3 && !attribute.normalized) return attribute.array
  const out = new Float32Array(attribute.count * 3)
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i)
    out[i * 3 + 1] = attribute.getY(i)
    out[i * 3 + 2] = attribute.getZ(i)
  }
  return out
}

function parseObj(buffer: ArrayBuffer): BufferGeometry {
  const group = new OBJLoader().parse(new TextDecoder().decode(buffer))
  const geometries: BufferGeometry[] = []
  group.traverse((object) => {
    const mesh = object as { isMesh?: boolean; geometry?: BufferGeometry }
    if (mesh.isMesh && mesh.geometry) geometries.push(mesh.geometry)
  })
  if (geometries.length === 0) throw new Error('no surface')
  const allColoured = geometries.every((g) => g.getAttribute('color'))
  for (const g of geometries) {
    g.deleteAttribute('uv')
    g.deleteAttribute('normal')
    if (!allColoured) g.deleteAttribute('color')
  }
  if (geometries.length === 1) return geometries[0]
  const merged = mergeGeometries(geometries)
  if (!merged) throw new Error('could not merge')
  return merged
}

function parseGeometry({ buffer, format }: ParseRequest): BufferGeometry {
  if (format === 'STL') return new STLLoader().parse(buffer)
  if (format === 'PLY') {
    // A PLY with no faces is a point cloud, which we can't show as a surface.
    const head = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8192)))
    if (!/element\s+face\s+[1-9]/.test(head)) throw new Error('no surface')
    return new PLYLoader().parse(buffer)
  }
  return parseObj(buffer)
}

function build(request: ParseRequest): { mesh: ParsedMesh; transfer: Transferable[] } {
  const geometry = parseGeometry(request)
  const position = geometry.getAttribute('position') as BufferAttribute | undefined
  if (!position || position.count < 3) throw new Error('no surface')

  // Centre on the middle of the box and scale so the longest side is 2 units, so every scan
  // fills the view the same way and two scans can be compared with the same camera.
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z }
  const longest = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(longest) || longest <= 0) throw new Error('empty')
  const cx = (box.min.x + box.max.x) / 2
  const cy = (box.min.y + box.max.y) / 2
  const cz = (box.min.z + box.max.z) / 2
  const k = 2 / longest
  const positions = toFloat3(position).slice()
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * k
    positions[i + 1] = (positions[i + 1] - cy) * k
    positions[i + 2] = (positions[i + 2] - cz) * k
  }

  const colorAttr = geometry.getAttribute('color') as BufferAttribute | undefined
  let out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(positions, 3))
  if (colorAttr) out.setAttribute('color', new BufferAttribute(toFloat3(colorAttr), 3))
  if (geometry.index) out.setIndex(geometry.index)
  geometry.dispose()

  // Weld corners shared by neighbouring triangles (STL repeats them) so the surface shades
  // smoothly like the real teeth; very large meshes keep their per-triangle shading.
  if (!out.index && out.getAttribute('position').count <= WELD_LIMIT) out = mergeVertices(out, 1e-5)
  out.computeVertexNormals()

  const index = out.index ? (out.index.array as Uint32Array | Uint16Array) : null
  const finalPositions = out.getAttribute('position').array as Float32Array
  const colors = out.getAttribute('color') ? (out.getAttribute('color').array as Float32Array) : null
  const mesh: ParsedMesh = {
    positions: finalPositions,
    normals: out.getAttribute('normal').array as Float32Array,
    colors,
    index: index ? (index instanceof Uint32Array ? index : Uint32Array.from(index)) : null,
    triangles: (index ? index.length : finalPositions.length / 3) / 3,
    dimensions: size,
    transform: { centre: [cx, cy, cz], scale: k },
  }
  const transfer = [mesh.positions.buffer, mesh.normals.buffer] as Transferable[]
  if (mesh.colors) transfer.push(mesh.colors.buffer)
  if (mesh.index) transfer.push(mesh.index.buffer)
  return { mesh, transfer }
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  try {
    const { mesh, transfer } = build(event.data)
    const response: ParseResponse = { ok: true, mesh }
    self.postMessage(response, transfer)
  } catch (error) {
    const response: ParseResponse = { ok: false, message: error instanceof Error ? error.message : 'failed' }
    self.postMessage(response)
  }
}
