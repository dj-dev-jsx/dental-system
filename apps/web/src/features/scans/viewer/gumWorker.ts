/// <reference lib="webworker" />
// The slow parts of hiding the gums, off the page's thread. First one number per vertex, worked
// out once per scan and set of pins: moving the slider then only compares numbers (fitMath's
// keptTriangles), quick enough to do as it moves. Then, once the slider rests, a tidy pass over
// the kept triangles (cleanTriangles), which needs the whole surface, so the worker keeps it.
import { cleanTriangles, gumLines, heightsInTeeth, keptTriangles, rednessOf, sameCorners, smoothEdge } from './fitMath'

export type GumRequest =
  | { kind: 'teeth'; positions: Float32Array; index: Uint32Array | null; pins: Float32Array; frames: Float32Array; outlines: Float32Array; reach: number; unitsPerMm: number }
  | { kind: 'colour'; positions: Float32Array; index: Uint32Array | null; colors: Float32Array; unitsPerMm: number }
  | { kind: 'clean'; threshold: number; id: number }
  | { kind: 'gumLines'; positions: Float32Array; pins: Float32Array; frames: Float32Array; outlines: Float32Array; reach: number }

/**
 * Per vertex: keep it while `value >= threshold`. Teeth: height above its tooth's neck in mm
 * (-Infinity: always hidden). Colour: minus its redness. Gum lines: two per pin, its gum line
 * in mm above its standard neck and how far out its cheek side is there (see gumLines). Or, for a
 * clean request, the tidied triangles (three vertex numbers each) and the cut edge smoothed for
 * display (the points moved and where to).
 */
export type GumResponse =
  | { kind: 'values'; values: Float32Array; ms: number }
  | { kind: 'clean'; id: number; triangles: Uint32Array; edge: { indices: Uint32Array; positions: Float32Array }; ms: number }

let surface: { positions: Float32Array; index: Uint32Array | null; values: Float32Array; unitsPerMm: number; same: Uint32Array | null } | null = null

self.onmessage = (event: MessageEvent<GumRequest>) => {
  const started = performance.now()
  const request = event.data
  if (request.kind === 'clean') {
    if (!surface) return
    const { positions, index, values, unitsPerMm } = surface
    const kept = keptTriangles(index, positions.length / 3, values, request.threshold)
    // Copies of one corner (an STL repeats each corner per triangle; some files split them by
    // normal or colour) are matched first, so neighbouring triangles are found.
    surface.same ??= sameCorners(positions)
    const same = surface.same
    const triangles = cleanTriangles(kept, positions, unitsPerMm, same)
    const edge = smoothEdge(triangles, positions, unitsPerMm, same)
    const response: GumResponse = { kind: 'clean', id: request.id, triangles, edge, ms: performance.now() - started }
    self.postMessage(response, [triangles.buffer, edge.indices.buffer, edge.positions.buffer])
    return
  }
  if (request.kind === 'gumLines') {
    // Each tooth's gum line read from the scan's shape (NaN: not read).
    const lines = gumLines(request.positions, request.pins, request.frames, request.outlines, request.reach)
    const response: GumResponse = { kind: 'values', values: lines, ms: performance.now() - started }
    self.postMessage(response, [lines.buffer])
    return
  }
  let values: Float32Array
  if (request.kind === 'teeth') {
    values = heightsInTeeth(request.positions, request.pins, request.frames, request.outlines, request.reach)
  } else {
    values = rednessOf(request.colors)
    for (let i = 0; i < values.length; i++) values[i] = -values[i]
  }
  surface = { positions: request.positions, index: request.index, values: values.slice(), unitsPerMm: request.unitsPerMm, same: null }
  const response: GumResponse = { kind: 'values', values, ms: performance.now() - started }
  self.postMessage(response, [values.buffer])
}
