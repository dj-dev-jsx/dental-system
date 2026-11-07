import { Outlines, useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import type { FdiCode } from '../model/fdi'
import { GHOST_STATUSES, STATUS_COLORS, type ToothStatus } from '../model/status'
import { buildPlacedTooth } from './archLayout'

type Props = {
  code: FdiCode
  status: ToothStatus
  selected: boolean
  onSelect: (code: FdiCode) => void
}

export function ToothMesh({ code, status, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  const geometry = useMemo(() => buildPlacedTooth(code), [code])
  const ghost = GHOST_STATUSES.has(status)

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    // Without this, a click would also hit every tooth behind this one.
    e.stopPropagation()
    onSelect(code)
  }

  return (
    <mesh
      // The mesh name is the contract with any future GLB model: "tooth_16".
      name={`tooth_${code}`}
      geometry={geometry}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <meshPhysicalMaterial
        vertexColors
        color={status === 'healthy' ? '#ffffff' : STATUS_COLORS[status]}
        roughness={0.3}
        clearcoat={0.55}
        clearcoatRoughness={0.25}
        transparent={ghost}
        opacity={ghost ? 0.25 : 1}
        depthWrite={!ghost}
        // Highlights must not change the tooth's hue: its colour is its clinical status.
        // So a selected tooth glows in its own colour.
        emissive={selected ? STATUS_COLORS[status] : '#ffffff'}
        emissiveIntensity={selected ? 0.4 : hovered ? 0.1 : 0}
      />
      {selected && <Outlines thickness={0.9} color="#ffffff" />}
    </mesh>
  )
}
