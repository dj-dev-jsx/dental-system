import type { ScanFormat } from '../types'

export type ParseRequest = { buffer: ArrayBuffer; format: ScanFormat }

/** A scan ready for the GPU, centred on the origin and scaled to fit a box 2 units wide. */
export type ParsedMesh = {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array | null
  index: Uint32Array | null
  triangles: number
  /** The size in the file's own units, before scaling. */
  dimensions: { x: number; y: number; z: number }
  /** How the file's points were moved to fit: view = (file - centre) * scale. Kept so pins go back to file coordinates. */
  transform: { centre: [number, number, number]; scale: number }
}

export type ParseResponse = { ok: true; mesh: ParsedMesh } | { ok: false; message: string }
