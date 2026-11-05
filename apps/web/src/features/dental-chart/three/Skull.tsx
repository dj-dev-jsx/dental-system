import { useGLTF } from '@react-three/drei'
import { Component, useEffect, useMemo, type ReactNode } from 'react'
import { DoubleSide, ShaderMaterial } from 'three'

const MODEL_URL = '/models/skull.glb'
useGLTF.preload(MODEL_URL)

// A faint X-ray look: only the silhouette and ridges of the bone show, and the skull
// fades further from the mouth, so the eye goes to the teeth.
function createGhostMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      const vec3 FOCUS = vec3(0.0, 0.0, -30.0);
      void main() {
        vec3 toCamera = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - abs(dot(normalize(vNormal), toCamera)), 2.6);
        float fade = mix(0.3, 1.0, smoothstep(190.0, 70.0, distance(vWorldPosition, FOCUS)));
        gl_FragColor = vec4(vec3(0.66, 0.77, 0.88), (0.006 + 0.12 * rim) * fade);
        #include <colorspace_fragment>
      }
    `,
  })
}

function SkullPart({ part }: { part: 'cranium' | 'mandible' }) {
  const { nodes } = useGLTF(MODEL_URL)
  const material = useMemo(() => createGhostMaterial(), [])
  useEffect(() => () => material.dispose(), [material])

  return <primitive object={nodes[part]} material={material} renderOrder={1} />
}

// The skull is only context. If it fails to load, the clinical chart must keep working.
class HideOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('Skull model failed to load', error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function Skull({ part }: { part: 'cranium' | 'mandible' }) {
  return (
    <HideOnError>
      <SkullPart part={part} />
    </HideOnError>
  )
}
