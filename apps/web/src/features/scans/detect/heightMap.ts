// The scan seen straight down its occlusal axis, as a grid of heights (a depth image). Most of
// the detection works on this 2D picture: it is small, and teeth are bumps on it.
import { cross, dot, type Samples, unit, type Vec3 } from './meshStats'

/** u, v across the occlusal plane and h along the axis, all in millimetres from `origin`. */
export type Frame = { origin: Vec3; e1: Vec3; e2: Vec3; d: Vec3; unitsPerMm: number }

export function frameFor(axis: Vec3, origin: Vec3, unitsPerMm: number, hint?: Vec3): Frame {
  const d = unit(axis)
  let ref: Vec3 = hint ?? (Math.abs(d[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0])
  if (Math.abs(dot(ref, d)) > 0.99) ref = Math.abs(d[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]
  const e1 = unit(cross(cross(d, ref), d))
  const e2 = cross(d, e1)
  return { origin, e1, e2, d, unitsPerMm }
}

/** Viewer coordinates of a point given in the frame's millimetres. */
export function toViewer(f: Frame, u: number, v: number, h: number): Vec3 {
  const k = f.unitsPerMm
  return [
    f.origin[0] + (f.e1[0] * u + f.e2[0] * v + f.d[0] * h) * k,
    f.origin[1] + (f.e1[1] * u + f.e2[1] * v + f.d[1] * h) * k,
    f.origin[2] + (f.e1[2] * u + f.e2[2] * v + f.d[2] * h) * k,
  ]
}

export type HeightMap = {
  w: number
  h: number
  /** Cell size, mm. */
  cell: number
  /** u, v of cell (0, 0)'s centre. */
  u0: number
  v0: number
  /** Highest point seen in each cell (NaN when empty). */
  top: Float32Array
  /** Lowest point in each cell (NaN when empty). */
  bottom: Float32Array
  /** Up-facing share of the normals of the samples that made each cell's top (0..1), for shading. */
  slope: Float32Array
}

/** Project the fine samples into the frame and keep the highest and lowest point per cell. */
export function buildHeightMap(s: Samples, f: Frame, cell: number): HeightMap {
  const k = 1 / f.unitsPerMm
  const n = s.count
  const us = new Float32Array(n)
  const vs = new Float32Array(n)
  const hs = new Float32Array(n)
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity
  const [ox, oy, oz] = f.origin
  for (let i = 0; i < n; i++) {
    if (s.coarse[i]) continue
    const x = (s.x[i] - ox) * k, y = (s.y[i] - oy) * k, z = (s.z[i] - oz) * k
    const u = x * f.e1[0] + y * f.e1[1] + z * f.e1[2]
    const v = x * f.e2[0] + y * f.e2[1] + z * f.e2[2]
    us[i] = u
    vs[i] = v
    hs[i] = x * f.d[0] + y * f.d[1] + z * f.d[2]
    if (u < umin) umin = u
    if (u > umax) umax = u
    if (v < vmin) vmin = v
    if (v > vmax) vmax = v
  }
  const w = Math.max(1, Math.ceil((umax - umin) / cell) + 1)
  const h = Math.max(1, Math.ceil((vmax - vmin) / cell) + 1)
  const top = new Float32Array(w * h).fill(NaN)
  const bottom = new Float32Array(w * h).fill(NaN)
  const slope = new Float32Array(w * h)
  for (let i = 0; i < n; i++) {
    if (s.coarse[i]) continue
    const cx = Math.round((us[i] - umin) / cell)
    const cy = Math.round((vs[i] - vmin) / cell)
    const o = cy * w + cx
    const z = hs[i]
    if (!(top[o] >= z)) {
      top[o] = z
      slope[o] = Math.abs(s.nx[i] * f.d[0] + s.ny[i] * f.d[1] + s.nz[i] * f.d[2])
    }
    if (!(bottom[o] <= z)) bottom[o] = z
  }
  // Drop stray specks and one-cell-thin lines (edges of a model's base, loose triangles).
  for (let pass = 0; pass < 2; pass++) {
    const drop: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x
        if (Number.isNaN(top[o])) continue
        let filled = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy, xx = x + dx
            if ((dx || dy) && yy >= 0 && xx >= 0 && yy < h && xx < w && !Number.isNaN(top[yy * w + xx])) filled++
          }
        }
        if (filled < 3) drop.push(o)
      }
    }
    for (const o of drop) {
      top[o] = NaN
      bottom[o] = NaN
    }
  }
  return { w, h, cell, u0: umin, v0: vmin, top, bottom, slope }
}

/**
 * How bumpy a height image is: the median, over filled cells with filled neighbours, of the
 * distance from a cell's height to the mean of its 5x5 neighbourhood. Teeth are bumpy; a model's
 * base or the inside of the shell is smooth.
 */
export function roughness(map: Float32Array, w: number, h: number, slope?: Float32Array, minSlope = 0): number {
  const out: number[] = []
  for (let y = 2; y < h - 2; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const c = map[y * w + x]
      if (Number.isNaN(c)) continue
      if (slope && slope[y * w + x] < minSlope) continue
      let sum = 0, cnt = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const v = map[(y + dy) * w + x + dx]
          if (!Number.isNaN(v)) {
            sum += v
            cnt++
          }
        }
      }
      if (cnt < 20) continue
      out.push(Math.abs(c - sum / cnt))
    }
  }
  if (out.length === 0) return 0
  out.sort((a, b) => a - b)
  return out[Math.floor(out.length * 0.75)]
}
