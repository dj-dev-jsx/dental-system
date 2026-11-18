import { useGLTF } from '@react-three/drei'
import { Component, useEffect, useMemo, type ReactNode } from 'react'
import { createGhostMaterial, SKULL_URL } from './ghostMaterial'

useGLTF.preload(SKULL_URL)

function SkullPart({ part }: { part: 'cranium' | 'mandible' }) {
  const { nodes } = useGLTF(SKULL_URL)
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
