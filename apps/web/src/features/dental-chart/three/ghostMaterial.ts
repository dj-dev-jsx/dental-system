import { DoubleSide, ShaderMaterial, Vector3 } from 'three'

/** The standard skull model, shared by the chart and by scans placed in the skull. */
export const SKULL_URL = '/models/skull.glb'

type GhostOptions = {
  /** Where the eye should go; the skull fades further from it. World units. */
  focus?: Vector3
  /** Within this distance of the focus the skull is at full strength, beyond `fadeFar` at 30%. */
  fadeNear?: number
  fadeFar?: number
}

/**
 * A faint X-ray look: only the silhouette and ridges of the bone show, and the skull fades
 * further from the mouth, so the eye goes to the teeth. The defaults are the chart's, in mm.
 */
export function createGhostMaterial({ focus = new Vector3(0, 0, -30), fadeNear = 70, fadeFar = 190 }: GhostOptions = {}) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      focus: { value: focus },
      fadeNear: { value: fadeNear },
      fadeFar: { value: fadeFar },
    },
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
      uniform vec3 focus;
      uniform float fadeNear;
      uniform float fadeFar;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 toCamera = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - abs(dot(normalize(vNormal), toCamera)), 2.6);
        float fade = mix(0.3, 1.0, smoothstep(fadeFar, fadeNear, distance(vWorldPosition, focus)));
        gl_FragColor = vec4(vec3(0.66, 0.77, 0.88), (0.006 + 0.12 * rim) * fade);
        #include <colorspace_fragment>
      }
    `,
  })
}
