import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { type Mesh, Vector3 } from 'three'
import type { FdiCode } from '../model/fdi'

/** Where a tooth is on screen, in pixels from the canvas's top left. */
export type Anchor = { x: number; y: number }

type Props = {
  code: FdiCode | null
  onAnchor: (anchor: Anchor | null) => void
}

/**
 * Follows the selected tooth on screen, so a label outside the 3D scene can point at it.
 * It runs only when the scene draws a frame (when it's turned or zoomed), and reports a
 * new position only when the tooth has moved by at least half a pixel.
 */
export function AnchorTracker({ code, onAnchor }: Props) {
  const { scene, camera, size, invalidate } = useThree()
  const last = useRef<Anchor | null>(null)
  const point = useRef(new Vector3())

  // A new tooth, or none: draw a frame so the position is worked out straight away.
  useEffect(() => {
    last.current = null
    if (!code) onAnchor(null)
    invalidate()
  }, [code, onAnchor, invalidate])

  useFrame(() => {
    if (!code) return
    const mesh = scene.getObjectByName(`tooth_${code}`) as Mesh | undefined
    if (!mesh) return
    const { geometry } = mesh
    if (!geometry.boundingSphere) geometry.computeBoundingSphere()
    // The middle of the tooth, carried through the jaw's own movement into the world, then
    // flattened onto the screen.
    const projected = point.current.copy(geometry.boundingSphere!.center).applyMatrix4(mesh.matrixWorld).project(camera)
    const anchor = { x: ((projected.x + 1) / 2) * size.width, y: ((1 - projected.y) / 2) * size.height }
    const previous = last.current
    if (previous && Math.abs(previous.x - anchor.x) < 0.5 && Math.abs(previous.y - anchor.y) < 0.5) return
    last.current = anchor
    onAnchor(anchor)
  })

  return null
}
