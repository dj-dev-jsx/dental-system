// Which way the biting surfaces face: the scan's "up" before we know if it is an upper or a
// lower arch.
import { buildHeightMap, frameFor, roughness } from './heightMap'
import { dot, type MeshInfo, openEdgeCentre, principalAxes, unit, type Vec3 } from './meshStats'

export type AxisGuess = {
  /** Unit vector, viewer coordinates, from the gums toward the biting surfaces. */
  axis: Vec3
  /** How sure the sign is, 0..1. */
  signConfidence: number
  how: string
}

/**
 * The direction:
 * - An open shell (a raw intraoral scan, like a sock) or a model whose base is a few huge
 *   triangles: the area-weighted normals of the fine part add up to a vector pointing out of the
 *   closed end (the teeth), away from the opening or base. That holds whatever the arch's shape.
 * - A closed, evenly meshed model: the flattest direction of the points (PCA), since an arch is
 *   wide and long but not tall. A short segment (a few teeth) is about as tall as it is wide, so
 *   PCA can't tell up from sideways there; scanners export with the occlusal plane level, so the
 *   direction in that uncertain plane nearest the file's vertical is taken.
 *
 * The sign never trusts the triangles' winding: the cut edge or the base lies on the gum side;
 * for a closed model, the side seen from above is the bumpy one (cusps) and the base is smooth.
 */
export function guessAxis(info: MeshInfo, positions: Float32Array, index: Uint32Array | null, unitsPerMm: number, signal?: AbortSignal): AxisGuess {
  const pca = principalAxes(info.samples, unitsPerMm)
  const va = info.vectorArea
  const vaLength = Math.hypot(va[0], va[1], va[2])
  let axis: Vec3
  let how: string
  const strongVectorArea = vaLength > 0.08 * info.fineArea
  if (strongVectorArea) {
    axis = unit(va)
    how = 'vector area'
  } else if (pca.values[0] / pca.values[1] < 0.5) {
    axis = pca.axes[0]
    how = 'flattest direction'
  } else {
    // Between the two weak directions, the one closest to the file's z axis.
    const [a0, a1] = pca.axes
    const p0 = a0[2], p1 = a1[2]
    if (Math.hypot(p0, p1) > 0.5) {
      axis = unit([a0[0] * p0 + a1[0] * p1, a0[1] * p0 + a1[1] * p1, a0[2] * p0 + a1[2] * p1])
      how = 'segment, file vertical'
    } else {
      axis = a0
      how = 'segment, flattest'
    }
  }

  const total = info.fineArea + info.coarseArea
  const fc = info.fineCentre
  let signConfidence = 0.5
  const flip = () => {
    axis = [-axis[0], -axis[1], -axis[2]]
  }
  if (info.coarseArea > 0.05 * total) {
    const cc = info.coarseCentre
    const along = dot([cc[0] - fc[0], cc[1] - fc[1], cc[2] - fc[2]], axis) / unitsPerMm
    if (along > 0) flip()
    signConfidence = Math.min(1, 0.5 + Math.abs(along) / 6)
    how += ', base side'
    return { axis, signConfidence, how }
  }
  const edge = strongVectorArea ? openEdgeCentre(positions, index, signal) : null
  if (edge) {
    const along = dot([edge.centre[0] - fc[0], edge.centre[1] - fc[1], edge.centre[2] - fc[2]], axis) / unitsPerMm
    if (along > 0) flip()
    signConfidence = Math.min(1, 0.5 + Math.abs(along) / 4)
    how += ', open edge'
    return { axis, signConfidence, how }
  }
  // Closed: compare how bumpy the scan looks from each side.
  const map = buildHeightMap(info.samples, frameFor(axis, fc, unitsPerMm), 0.4)
  const fromTop = roughness(map.top, map.w, map.h)
  const fromBottom = roughness(map.bottom, map.w, map.h)
  if (fromBottom > fromTop) flip()
  const ratio = Math.max(fromTop, fromBottom) / Math.max(1e-6, Math.min(fromTop, fromBottom))
  signConfidence = Math.min(1, 0.5 + (ratio - 1) / 2)
  how += ', bumpy side'
  return { axis, signConfidence, how }
}
