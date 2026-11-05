import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { FDI_CODES, type FdiCode } from '../model/fdi'
import type { ToothStatus } from '../model/status'
import { JAW_HINGE, JAW_OPEN_RADIANS, jawOf } from './archLayout'
import { buildGumGeometry } from './gumGeometry'
import { Skull } from './Skull'
import { ToothMesh } from './ToothMesh'
import type { Jaw } from './toothShape'

// The whole contract between the 3D scene and the rest of the app.
// It knows nothing about APIs, patients or stores.
type Props = {
  toothStates: Record<FdiCode, ToothStatus>
  selected: FdiCode | null
  onSelect: (code: FdiCode | null) => void
}

function Gum({ jaw }: { jaw: Jaw }) {
  const geometry = useMemo(() => buildGumGeometry(jaw), [jaw])
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshPhysicalMaterial vertexColors transparent roughness={0.42} clearcoat={0.5} clearcoatRoughness={0.35} />
    </mesh>
  )
}

export function DentalChart3D({ toothStates, selected, onSelect }: Props) {
  const teethIn = (jaw: Jaw) =>
    FDI_CODES.filter((code) => jawOf(code) === jaw).map((code) => (
      <ToothMesh
        key={code}
        code={code}
        status={toothStates[code]}
        selected={selected === code}
        onSelect={onSelect}
      />
    ))

  return (
    <Canvas
      // Render only when something changes (interaction), saving battery on tablets.
      frameloop="demand"
      dpr={[1, 2]}
      // Units are millimetres.
      camera={{ position: [0, 14, 250], fov: 30, near: 5, far: 1500 }}
      onPointerMissed={() => onSelect(null)}
    >
      <ambientLight intensity={0.32} />
      <directionalLight position={[60, 120, 160]} intensity={1.15} />
      <directionalLight position={[-90, -30, 120]} intensity={0.4} />

      {/* Soft studio reflections for the wet look of enamel. Built locally, no download. */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={1.4} position={[0, 60, 90]} scale={[200, 60, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[-120, 0, 60]} rotation={[0, Math.PI / 2, 0]} scale={[140, 90, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[120, 0, 60]} rotation={[0, -Math.PI / 2, 0]} scale={[140, 90, 1]} />
      </Environment>

      <Suspense fallback={null}>
        <Skull part="cranium" />
      </Suspense>
      <Gum jaw="upper" />
      {teethIn('upper')}

      {/* The lower jaw swings around its hinge, so everything in it moves together. */}
      <group position={JAW_HINGE} rotation={[JAW_OPEN_RADIANS, 0, 0]}>
        <group position={[-JAW_HINGE[0], -JAW_HINGE[1], -JAW_HINGE[2]]}>
          <Suspense fallback={null}>
            <Skull part="mandible" />
          </Suspense>
          <Gum jaw="lower" />
          {teethIn('lower')}
        </group>
      </group>

      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, -4, -22]}
        minDistance={60}
        maxDistance={520}
      />
    </Canvas>
  )
}
