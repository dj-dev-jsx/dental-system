// First pass over a scan's triangles: a sample of their centres and normals, which way the
// biting surfaces face, and the scan's open edge. Plain typed arrays, so it runs in a worker
// and in a test script.

export type Vec3 = [number, number, number]

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const unit = (v: ArrayLike<number>): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** A sample of the scan's triangles: centre, unit normal and area (sq mm) of each. */
export type Samples = {
  count: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  nx: Float32Array
  ny: Float32Array
  nz: Float32Array
  area: Float32Array
  /** True for a big filler triangle (a model base or a patched hole), not real anatomy. */
  coarse: Uint8Array
}

export type MeshInfo = {
  samples: Samples
  /** Sum of area-weighted normals of the fine triangles (sq mm). Points out of an open shell's dome. */
  vectorArea: Vec3
  fineArea: number
  fineCentre: Vec3
  coarseArea: number
  coarseCentre: Vec3
}

/** Above this many triangles, every k-th one is sampled. */
const MAX_SAMPLES = 450_000

export function triangleCount(positions: Float32Array, index: Uint32Array | null) {
  return index ? Math.floor(index.length / 3) : Math.floor(positions.length / 9)
}

/**
 * One pass over the triangles: the sample, the vector area of the fine triangles, and where the
 * fine and coarse (filler) triangles are. A triangle is coarse when its area is over 40 times
 * the median: model bases and hole patches are made of a few huge triangles, while the scanned
 * surface is evenly meshed.
 */
export function meshInfo(positions: Float32Array, index: Uint32Array | null, unitsPerMm: number): MeshInfo {
  const n = triangleCount(positions, index)
  const toMm = 1 / unitsPerMm
  const stride = Math.max(1, Math.ceil(n / MAX_SAMPLES))
  const count = Math.ceil(n / stride)
  const s: Samples = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    nx: new Float32Array(count),
    ny: new Float32Array(count),
    nz: new Float32Array(count),
    area: new Float32Array(count),
    coarse: new Uint8Array(count),
  }
  // Median triangle area, from a sparse sample.
  const probe: number[] = []
  const probeStride = Math.max(1, Math.floor(n / 4000))
  for (let t = 0; t < n; t += probeStride) probe.push(triArea(positions, index, t))
  probe.sort((a, b) => a - b)
  const coarseLimit = 40 * (probe[probe.length >> 1] || 0)

  let vx = 0, vy = 0, vz = 0
  let fa = 0, fx = 0, fy = 0, fz = 0
  let ca = 0, cx = 0, cy = 0, cz = 0
  for (let t = 0, k = 0; t < n; t++) {
    const a = index ? index[t * 3] : t * 3
    const b = index ? index[t * 3 + 1] : t * 3 + 1
    const c = index ? index[t * 3 + 2] : t * 3 + 2
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2]
    const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az
    const wx = positions[c * 3] - ax, wy = positions[c * 3 + 1] - ay, wz = positions[c * 3 + 2] - az
    const nx = (uy * wz - uz * wy) / 2, ny = (uz * wx - ux * wz) / 2, nz = (ux * wy - uy * wx) / 2
    const area = Math.hypot(nx, ny, nz)
    const mx = ax + (ux + wx) / 3, my = ay + (uy + wy) / 3, mz = az + (uz + wz) / 3
    const coarse = area > coarseLimit
    if (coarse) {
      ca += area
      cx += mx * area
      cy += my * area
      cz += mz * area
    } else {
      vx += nx
      vy += ny
      vz += nz
      fa += area
      fx += mx * area
      fy += my * area
      fz += mz * area
    }
    if (t % stride === 0 && k < count) {
      s.x[k] = mx
      s.y[k] = my
      s.z[k] = mz
      const l = area || 1
      s.nx[k] = nx / l
      s.ny[k] = ny / l
      s.nz[k] = nz / l
      s.area[k] = area * stride * toMm * toMm
      s.coarse[k] = coarse ? 1 : 0
      k++
    }
  }
  const mm2 = toMm * toMm
  return {
    samples: s,
    vectorArea: [vx * mm2, vy * mm2, vz * mm2],
    fineArea: fa * mm2,
    fineCentre: fa > 0 ? [fx / fa, fy / fa, fz / fa] : [0, 0, 0],
    coarseArea: ca * mm2,
    coarseCentre: ca > 0 ? [cx / ca, cy / ca, cz / ca] : [0, 0, 0],
  }
}

function triArea(p: Float32Array, index: Uint32Array | null, t: number) {
  const a = index ? index[t * 3] : t * 3
  const b = index ? index[t * 3 + 1] : t * 3 + 1
  const c = index ? index[t * 3 + 2] : t * 3 + 2
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2]
  const wx = p[c * 3] - p[a * 3], wy = p[c * 3 + 1] - p[a * 3 + 1], wz = p[c * 3 + 2] - p[a * 3 + 2]
  return Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2
}

/** The area-weighted spread of the fine samples: eigenvalues (ascending, sq mm) and their unit vectors. */
export function principalAxes(s: Samples, unitsPerMm: number): { values: number[]; axes: Vec3[]; centre: Vec3 } {
  let w = 0, mx = 0, my = 0, mz = 0
  for (let i = 0; i < s.count; i++) {
    if (s.coarse[i]) continue
    const a = s.area[i]
    w += a
    mx += s.x[i] * a
    my += s.y[i] * a
    mz += s.z[i] * a
  }
  mx /= w
  my /= w
  mz /= w
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 0; i < s.count; i++) {
    if (s.coarse[i]) continue
    const a = s.area[i]
    const dx = s.x[i] - mx, dy = s.y[i] - my, dz = s.z[i] - mz
    m[0] += a * dx * dx
    m[1] += a * dx * dy
    m[2] += a * dx * dz
    m[4] += a * dy * dy
    m[5] += a * dy * dz
    m[8] += a * dz * dz
  }
  m[3] = m[1]
  m[6] = m[2]
  m[7] = m[5]
  const k = 1 / (w * unitsPerMm * unitsPerMm)
  const { values, vectors } = eigen3(m.map((x) => x * k))
  const order = [0, 1, 2].sort((a, b) => values[a] - values[b])
  return {
    values: order.map((i) => values[i]),
    axes: order.map((i) => unit([vectors[i], vectors[3 + i], vectors[6 + i]])),
    centre: [mx, my, mz],
  }
}

/** Jacobi eigen-decomposition of a symmetric 3x3 matrix (row by row); vectors are columns. */
export function eigen3(input: number[]): { values: number[]; vectors: number[] } {
  const n = 3
  const a = input.slice()
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[1] ** 2 + a[2] ** 2 + a[5] ** 2
    if (off < 1e-20 * (a[0] ** 2 + a[4] ** 2 + a[8] ** 2 + 1e-30)) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]
        if (Math.abs(apq) < 1e-300) continue
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq)
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const sn = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p], akq = a[k * n + q]
          a[k * n + p] = c * akp - sn * akq
          a[k * n + q] = sn * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k], aqk = a[q * n + k]
          a[p * n + k] = c * apk - sn * aqk
          a[q * n + k] = sn * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p], vkq = v[k * n + q]
          v[k * n + p] = c * vkp - sn * vkq
          v[k * n + q] = sn * vkp + c * vkq
        }
      }
    }
  }
  return { values: [a[0], a[4], a[8]], vectors: v }
}

/**
 * The middle of the scan's open edge (edges used by one triangle only), or null when the
 * surface is closed. An unindexed mesh (a plain STL) repeats each corner per triangle, so the
 * corners are first matched up by their exact coordinates.
 */
export function openEdgeCentre(positions: Float32Array, index: Uint32Array | null, signal?: AbortSignal): { centre: Vec3; edges: number } | null {
  const tris = triangleCount(positions, index)
  let ids: Uint32Array
  if (index) ids = index
  else {
    const weld = weldExact(positions)
    ids = new Uint32Array(tris * 3)
    for (let i = 0; i < tris * 3; i++) ids[i] = weld[i]
  }
  if (signal?.aborted) return null
  const edgeCount = tris * 3
  let size = 1
  while (size < edgeCount * 1.5) size <<= 1
  const mask = size - 1
  const ka = new Int32Array(size).fill(-1)
  const kb = new Int32Array(size)
  const cnt = new Uint8Array(size)
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      let a = ids[t * 3 + e]
      let b = ids[t * 3 + ((e + 1) % 3)]
      if (a === b) continue
      if (a > b) {
        const x = a
        a = b
        b = x
      }
      let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77)) >>> 0
      h = (h ^ (h >>> 15)) & mask
      while (ka[h] !== -1 && (ka[h] !== a || kb[h] !== b)) h = (h + 1) & mask
      if (ka[h] === -1) {
        ka[h] = a
        kb[h] = b
      }
      if (cnt[h] < 255) cnt[h]++
    }
  }
  let sx = 0, sy = 0, sz = 0, edges = 0
  for (let h = 0; h < size; h++) {
    if (cnt[h] !== 1) continue
    const a = ka[h], b = kb[h]
    // `a` and `b` are vertex numbers in `positions` (the first copy, when welded).
    sx += positions[a * 3] + positions[b * 3]
    sy += positions[a * 3 + 1] + positions[b * 3 + 1]
    sz += positions[a * 3 + 2] + positions[b * 3 + 2]
    edges++
  }
  if (edges < 10) return null
  return { centre: [sx / (2 * edges), sy / (2 * edges), sz / (2 * edges)], edges }
}

/** For each vertex, the first vertex with exactly the same coordinates. */
export function weldExact(positions: Float32Array): Uint32Array {
  const n = positions.length / 3
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, n * 3)
  let size = 1
  while (size < n * 2) size <<= 1
  const mask = size - 1
  const table = new Int32Array(size).fill(-1)
  const out = new Uint32Array(n)
  for (let v = 0; v < n; v++) {
    const x = bits[v * 3], y = bits[v * 3 + 1], z = bits[v * 3 + 2]
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0
    h = (h ^ (h >>> 13)) & mask
    for (;;) {
      const w = table[h]
      if (w === -1) {
        table[h] = v
        out[v] = v
        break
      }
      if (bits[w * 3] === x && bits[w * 3 + 1] === y && bits[w * 3 + 2] === z) {
        out[v] = w
        break
      }
      h = (h + 1) & mask
    }
  }
  return out
}
