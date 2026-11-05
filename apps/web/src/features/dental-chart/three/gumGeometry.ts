import { BufferAttribute, BufferGeometry, Color, MathUtils, Vector2 } from 'three'
import { archPoint, jawSlots, type ToothSlot } from './archLayout'
import type { Jaw } from './toothShape'

// Builds the gum as a tube swept along the arch. The tube's edge follows each tooth's
// neck and rises between teeth, which forms the scalloped line and the papillae.

const ROW_SPACING = 0.35 // mm along the arch
const BEYOND_LAST_TOOTH = 7 // the gum continues a little past the last molar
const RING_SUBDIVISIONS = 3
const GUM_HEIGHT = 11 // mm from the gum line toward the root
const FADE_START = 4 // where it starts to fade; must stay above the tooth's root stub

const { smoothstep } = MathUtils

const MARGIN_COLOR = new Color('#e79aa0') // the gum is paler where it meets the teeth
const BODY_COLOR = new Color('#c9666f')
const scratch = new Color()

// Value along the arch, blended between tooth centres.
function blendAcrossTeeth(slots: ToothSlot[], s: number, value: (slot: ToothSlot) => number) {
  if (s <= slots[0].sCenter) return value(slots[0])
  for (let i = 0; i < slots.length - 1; i++) {
    const a = slots[i]
    const b = slots[i + 1]
    if (s <= b.sCenter) return value(a) + (value(b) - value(a)) * ((s - a.sCenter) / (b.sCenter - a.sCenter))
  }
  return value(slots[slots.length - 1])
}

// 0 at the middle of a tooth, 1 where two teeth meet.
function nearContact(slots: ToothSlot[], s: number) {
  for (const slot of slots) {
    if (s >= slot.sStart && s <= slot.sEnd) return Math.abs((s - slot.sCenter) / ((slot.sEnd - slot.sStart) / 2))
  }
  return 0
}

// Cross-section outline: x is outward from the arch, y is toward the root, from the margin.
function outline(halfDepth: number): Vector2[] {
  const hd = halfDepth
  return [
    new Vector2(hd, 0),
    new Vector2(hd + 0.6, 0.8),
    new Vector2(hd + 1.1, 2.6),
    new Vector2(hd + 1.5, 4.6),
    new Vector2(hd + 1.7, 6.8),
    new Vector2(hd + 1.4, 8.8),
    new Vector2(hd * 0.5 + 1, GUM_HEIGHT),
    new Vector2(-hd * 0.5 - 1, GUM_HEIGHT),
    new Vector2(-hd - 1.4, 8.8),
    new Vector2(-hd - 1.7, 6.8),
    new Vector2(-hd - 1.5, 4.6),
    new Vector2(-hd - 1.1, 2.6),
    new Vector2(-hd - 0.6, 0.8),
    new Vector2(-hd, 0),
    new Vector2(-hd * 0.5, 1),
    new Vector2(hd * 0.5, 1),
  ]
}

// Smooths a closed outline with Catmull-Rom interpolation.
function smoothClosed(points: Vector2[]): Vector2[] {
  const out: Vector2[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i + n - 1) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]]
    for (let k = 0; k < RING_SUBDIVISIONS; k++) {
      const t = k / RING_SUBDIVISIONS
      const t2 = t * t
      const t3 = t2 * t
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
      out.push(new Vector2(blend(p0.x, p1.x, p2.x, p3.x), blend(p0.y, p1.y, p2.y, p3.y)))
    }
  }
  return out
}

export function buildGumGeometry(jaw: Jaw): BufferGeometry {
  const slots = jawSlots(jaw)
  const occlusalSign = jaw === 'upper' ? -1 : 1 // the direction the crowns point
  const lastTooth = slots[slots.length - 1]
  const reach = lastTooth.sEnd + BEYOND_LAST_TOOTH

  const positions: number[] = []
  const colors: number[] = []
  let rows = 0
  let ringSize = 0

  for (let signed = -reach; signed <= reach + 1e-6; signed += ROW_SPACING) {
    const s = Math.abs(signed)
    const side = signed < 0 ? -1 : 1
    const { position, outward } = archPoint(jaw, s, side)

    const contact = nearContact(slots, s)
    const papillaHeight = s < slots[2].sEnd ? 3 : 2
    const papilla = papillaHeight * contact ** 2.6
    const neckY = blendAcrossTeeth(slots, s, (slot) => slot.neckY)
    const neckOffset = blendAcrossTeeth(slots, s, (slot) => slot.neckOffset)
    const halfDepth = blendAcrossTeeth(slots, s, (slot) => slot.halfDepth) * (1 - 0.1 * contact)

    const marginY = neckY + occlusalSign * (0.5 + papilla)

    // Round off the far ends of the gum behind the last molar.
    const past = Math.max(0, s - lastTooth.sEnd) / BEYOND_LAST_TOOTH
    const endScale = Math.sqrt(Math.max(0, 1 - past * past))

    const ring = smoothClosed(outline(halfDepth))
    ringSize = ring.length
    for (const point of ring) {
      const out = neckOffset + point.x * endScale
      const toRoot = point.y * endScale
      positions.push(
        position.x + outward.x * out,
        marginY - occlusalSign * toRoot,
        position.z + outward.z * out,
      )
      scratch.copy(MARGIN_COLOR).lerp(BODY_COLOR, Math.min(1, point.y / 5))
      // Fade out toward the roots and past the last molar, so the gum melts into the skull.
      const alpha = (1 - smoothstep(point.y, FADE_START, GUM_HEIGHT - 1)) * (1 - past * past)
      colors.push(scratch.r, scratch.g, scratch.b, alpha)
    }
    rows++
  }

  const index: number[] = []
  // The outline runs toward the root, which is up on one jaw and down on the other,
  // so the two jaws need opposite triangle winding to face outward.
  const flip = jaw === 'upper'
  for (let row = 0; row < rows - 1; row++) {
    for (let i = 0; i < ringSize; i++) {
      const a = row * ringSize + i
      const b = row * ringSize + ((i + 1) % ringSize)
      const c = a + ringSize
      const d = b + ringSize
      if (flip) index.push(a, c, b, b, c, d)
      else index.push(a, b, c, b, d, c)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4)) // RGBA
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}
