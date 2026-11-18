// The occlusal plane, the band of crowns and the curve of the arch through it, on the height map.
import type { HeightMap } from './heightMap'

/** h = a*u + b*v + c: the occlusal plane in the height map's frame (mm). */
export type Plane = { a: number; b: number; c: number }

export const planeAt = (p: Plane, u: number, v: number) => p.a * u + p.b * v + p.c

/**
 * The plane touching the tops of the crowns (the occlusal plane), as an upper envelope: the
 * height map is cut into 3 mm blocks, each block's highest point is kept when it is near the
 * highest in its 6 mm neighbourhood (a crown top, not a slope of the palate), and a plane is
 * fitted to those by expectile regression (points above the plane count 9 times as much as
 * points below), so it rests on the cusp tips the way the occlusal plane is defined. The tilt
 * carries a ridge penalty, so a narrow segment (whose sideways tilt the tops can't pin down)
 * keeps the axis it came with.
 */
export function fitOcclusalPlane(map: HeightMap): Plane {
  const { w, h, top, cell, u0, v0 } = map
  const B = Math.max(1, Math.round(3 / cell))
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B)
  const bt = new Float32Array(bw * bh).fill(NaN)
  const bu = new Float32Array(bw * bh), bv = new Float32Array(bw * bh)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = top[y * w + x]
      if (Number.isNaN(t)) continue
      const o = Math.floor(y / B) * bw + Math.floor(x / B)
      if (!(bt[o] >= t)) {
        bt[o] = t
        bu[o] = u0 + x * cell
        bv[o] = v0 + y * cell
      }
    }
  }
  const pu: number[] = [], pv: number[] = [], ph: number[] = []
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const t = bt[y * bw + x]
      if (Number.isNaN(t)) continue
      let around = -Infinity
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const yy = y + dy, xx = x + dx
        if (yy < 0 || xx < 0 || yy >= bh || xx >= bw) continue
        const o = bt[yy * bw + xx]
        if (o > around) around = o
      }
      if (t >= around - 1) {
        pu.push(bu[y * bw + x])
        pv.push(bv[y * bw + x])
        ph.push(t)
      }
    }
  }
  if (pu.length < 3) return { a: 0, b: 0, c: ph[0] ?? 0 }
  let plane: Plane = { a: 0, b: 0, c: ph.reduce((s, x) => s + x, 0) / ph.length }
  for (let iter = 0; iter < 12; iter++) {
    let s1 = 0, su = 0, sv = 0, suu = 0, svv = 0, suv = 0, sh = 0, suh = 0, svh = 0
    for (let i = 0; i < pu.length; i++) {
      const r = ph[i] - planeAt(plane, pu[i], pv[i])
      const wt = r > 0 ? 0.9 : 0.1
      const u = pu[i], v = pv[i], t = ph[i]
      s1 += wt
      su += wt * u
      sv += wt * v
      suu += wt * u * u
      svv += wt * v * v
      suv += wt * u * v
      sh += wt * t
      suh += wt * u * t
      svh += wt * v * t
    }
    const mu = su / s1, mv = sv / s1, mh = sh / s1
    const cuu = suu / s1 - mu * mu, cvv = svv / s1 - mv * mv, cuv = suv / s1 - mu * mv
    const cuh = suh / s1 - mu * mh, cvh = svh / s1 - mv * mh
    // A band about 6 mm across can't support a sideways tilt.
    const ridge = 15
    const A = cuu + ridge, Bc = cuv, C = cvv + ridge
    const det = A * C - Bc * Bc
    const a = (cuh * C - cvh * Bc) / det
    const b = (cvh * A - cuh * Bc) / det
    plane = { a, b, c: mh - a * mu - b * mv }
  }
  return plane
}

/** A smooth curve along the arch, sampled every `step` mm. */
export type ArchCurve = { u: Float64Array; v: Float64Array; step: number; length: number }

type Grid = { w: number; h: number }

/**
 * How much each cell looks like crown: 1 at the occlusal plane, 0 at `depth` mm below it.
 */
export function crownWeight(map: HeightMap, plane: Plane, depth: number): Float32Array {
  const { w, h, top, cell, u0, v0 } = map
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = top[y * w + x]
      if (Number.isNaN(t)) continue
      const r = t - planeAt(plane, u0 + x * cell, v0 + y * cell)
      out[y * w + x] = Math.max(0, Math.min(1, 1 + r / depth))
    }
  }
  return out
}

/** Cheapest-path distances over the grid (8-neighbour Dijkstra with a binary heap). */
function dijkstra(g: Grid, cost: Float32Array, start: number, dist: Float64Array, prev: Int32Array) {
  dist.fill(Infinity)
  prev.fill(-1)
  const heap = new MinHeap(g.w * g.h)
  dist[start] = 0
  heap.push(start, 0)
  const { w, h } = g
  while (heap.size > 0) {
    const [i, d] = heap.pop()
    if (d > dist[i]) continue
    const x = i % w, y = (i - x) / w
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        if (nx < 0 || nx >= w) continue
        const j = ny * w + nx
        const c = cost[j]
        if (!(c < Infinity)) continue
        const nd = d + ((c + cost[i]) / 2) * (dx && dy ? Math.SQRT2 : 1)
        if (nd < dist[j]) {
          dist[j] = nd
          prev[j] = i
          heap.push(j, nd)
        }
      }
    }
  }
}

class MinHeap {
  private ids: Int32Array
  private keys: Float64Array
  size = 0
  constructor(capacity: number) {
    this.ids = new Int32Array(capacity * 4 + 16)
    this.keys = new Float64Array(capacity * 4 + 16)
  }
  push(id: number, key: number) {
    if (this.size >= this.ids.length) {
      const ids = new Int32Array(this.ids.length * 2)
      ids.set(this.ids)
      const keys = new Float64Array(this.keys.length * 2)
      keys.set(this.keys)
      this.ids = ids
      this.keys = keys
    }
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= key) break
      this.ids[i] = this.ids[p]
      this.keys[i] = this.keys[p]
      i = p
    }
    this.ids[i] = id
    this.keys[i] = key
  }
  pop(): [number, number] {
    const id = this.ids[0], key = this.keys[0]
    const lastId = this.ids[--this.size], lastKey = this.keys[this.size]
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= this.size) break
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++
      if (this.keys[c] >= lastKey) break
      this.ids[i] = this.ids[c]
      this.keys[i] = this.keys[c]
      i = c
    }
    this.ids[i] = lastId
    this.keys[i] = lastKey
    return [id, key]
  }
}

/**
 * The arch's centre line: the cheapest path between the two ends of the band of crowns, where
 * crown cells are cheap, gum dearer and empty space impassable, then pulled to the middle of the
 * band and smoothed. The ends are found by the double sweep (farthest from anywhere, then
 * farthest from that), which works for a full horseshoe, half an arch or a few teeth alike.
 */
export function archCurve(map: HeightMap, weight: Float32Array, step = 0.5): ArchCurve | null {
  const { w, h, cell, u0, v0, top } = map
  const n = w * h
  // Cost: crowns cheap, everything else filled costs more; holes in the grid are bridged by a
  // closing (cells with filled neighbours both sides are passable at the high price).
  const cost = new Float32Array(n).fill(Infinity)
  for (let i = 0; i < n; i++) if (!Number.isNaN(top[i])) cost[i] = 1 + 12 * (1 - weight[i]) ** 2
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (cost[i] < Infinity) continue
      let filled = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cost[i + dy * w + dx] < Infinity) filled++
      if (filled >= 4) cost[i] = 13
    }
  }
  // Start from the strongest crown cell nearest the middle of the crown weight.
  let start = -1
  let best = -Infinity
  for (let i = 0; i < n; i++) if (weight[i] > best) {
    best = weight[i]
    start = i
  }
  if (start < 0 || best < 0.5) return null
  const dist = new Float64Array(n)
  const prev = new Int32Array(n)
  const farthest = () => {
    let far = -1
    let fd = -1
    for (let i = 0; i < n; i++) if (weight[i] > 0.6 && dist[i] < Infinity && dist[i] > fd) {
      fd = dist[i]
      far = i
    }
    return far
  }
  dijkstra({ w, h }, cost, start, dist, prev)
  const a = farthest()
  dijkstra({ w, h }, cost, a, dist, prev)
  const b = farthest()
  if (a < 0 || b < 0 || a === b) return null
  const path: number[] = []
  for (let i = b; i >= 0; i = prev[i]) path.push(i)
  let pu = path.map((i) => u0 + (i % w) * cell)
  let pv = path.map((i) => v0 + Math.floor(i / w) * cell)

  // Resample, then pull each point to the weighted middle of the crown band across it, smooth.
  let curve = resample(pu, pv, step)
  if (!curve) return null
  for (let iter = 0; iter < 3; iter++) {
    const cu = Array.from(curve.u), cv = Array.from(curve.v)
    const m = cu.length
    const su = new Float64Array(m), sv = new Float64Array(m), sw = new Float64Array(m)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wt = weight[y * w + x]
        if (wt < 0.5) continue
        const u = u0 + x * cell, v = v0 + y * cell
        const k = nearestIndex(cu, cv, u, v)
        if ((cu[k] - u) ** 2 + (cv[k] - v) ** 2 > 81) continue
        const ww = wt * wt
        su[k] += u * ww
        sv[k] += v * ww
        sw[k] += ww
      }
    }
    for (let k = 0; k < m; k++) if (sw[k] > 0) {
      cu[k] = su[k] / sw[k]
      cv[k] = sv[k] / sw[k]
    }
    pu = smooth(cu, Math.round(4 / step))
    pv = smooth(cv, Math.round(4 / step))
    const next = resample(pu, pv, step)
    if (!next) break
    curve = next
  }
  // Smoothing pulls the ends in; walk each end straight on while crown continues beside it.
  const ends = [0, 1].map((end) => {
    const m = curve!.u.length
    const i0 = end === 0 ? 0 : m - 1
    const i1 = end === 0 ? Math.min(m - 1, 6) : Math.max(0, m - 7)
    const eu = curve!.u[i0], ev = curve!.v[i0]
    let tu = eu - curve!.u[i1], tv = ev - curve!.v[i1]
    const l = Math.hypot(tu, tv) || 1
    tu /= l
    tv /= l
    let reach = 0
    let miss = 0
    for (let s = step; s <= 15 && miss < 2; s += step) {
      let found = false
      for (let o = -3; o <= 3 && !found; o += cell) {
        const x = Math.round((eu + tu * s - tv * o - u0) / cell)
        const y = Math.round((ev + tv * s + tu * o - v0) / cell)
        if (x >= 0 && y >= 0 && x < w && y < h && weight[y * w + x] > 0.6) found = true
      }
      if (found) {
        reach = s
        miss = 0
      } else miss += step
    }
    return { eu, ev, tu, tv, reach }
  })
  const head = ends[0], tail = ends[1]
  const extU: number[] = [], extV: number[] = []
  for (let s = head.reach; s > 0; s -= step) {
    extU.push(head.eu + head.tu * s)
    extV.push(head.ev + head.tv * s)
  }
  extU.push(...curve.u)
  extV.push(...curve.v)
  for (let s = step; s <= tail.reach; s += step) {
    extU.push(tail.eu + tail.tu * s)
    extV.push(tail.ev + tail.tv * s)
  }
  return resample(extU, extV, step) ?? curve
}

function nearestIndex(cu: number[], cv: number[], u: number, v: number) {
  let best = 0
  let bd = Infinity
  for (let k = 0; k < cu.length; k++) {
    const d = (cu[k] - u) ** 2 + (cv[k] - v) ** 2
    if (d < bd) {
      bd = d
      best = k
    }
  }
  return best
}

export function smooth(values: number[], radius: number): number[] {
  const m = values.length
  const out = new Array<number>(m)
  for (let i = 0; i < m; i++) {
    let s = 0, c = 0
    for (let k = Math.max(0, i - radius); k <= Math.min(m - 1, i + radius); k++) {
      s += values[k]
      c++
    }
    out[i] = s / c
  }
  return out
}

function resample(pu: number[], pv: number[], step: number): ArchCurve | null {
  const m = pu.length
  if (m < 2) return null
  const acc = [0]
  for (let i = 1; i < m; i++) acc.push(acc[i - 1] + Math.hypot(pu[i] - pu[i - 1], pv[i] - pv[i - 1]))
  const length = acc[m - 1]
  if (length < 3) return null
  const count = Math.floor(length / step) + 1
  const u = new Float64Array(count), v = new Float64Array(count)
  let j = 0
  for (let k = 0; k < count; k++) {
    const s = k * step
    while (j < m - 2 && acc[j + 1] < s) j++
    const span = acc[j + 1] - acc[j] || 1
    const t = Math.min(1, Math.max(0, (s - acc[j]) / span))
    u[k] = pu[j] + (pu[j + 1] - pu[j]) * t
    v[k] = pv[j] + (pv[j + 1] - pv[j]) * t
  }
  return { u, v, step, length: (count - 1) * step }
}
