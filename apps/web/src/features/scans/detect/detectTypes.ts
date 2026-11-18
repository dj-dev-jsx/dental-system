export type Arch = 'upper' | 'lower'

export type DetectedTooth = {
  /** FDI number, '11'..'48'. */
  tooth: string
  /** Viewer coordinates, on the surface: the middle of the biting surface. */
  at: [number, number, number]
  /** 0..1 */
  confidence: number
  /**
   * Estimated gum line (cervical margin) at this tooth: a point on the tooth's cheek side, on
   * the surface, at the height where crown meets gum along the occlusal axis (viewer coords).
   * From the height map and typical crown heights; absent when it can't be estimated.
   */
  neck?: [number, number, number]
}

export type DetectResult = {
  arch: Arch
  /** How sure the upper/lower guess is, 0..1 (1 when the dentist said which). */
  archConfidence: number
  /** Unit vector, viewer coordinates, from the gums toward the biting surfaces. */
  occlusal: [number, number, number]
  /** In arch order: the patient's right distal to left distal. */
  teeth: DetectedTooth[]
  /** Overall 0..1. */
  confidence: number
  /** Plain English, for the dentist. */
  notes: string[]
  /** How much of the arch the scan covers, and which teeth' places it spans (found or not). */
  coverage?: { kind: 'full' | 'partial'; teeth: string[] }
}

export type DetectInput = {
  /** Viewer coordinates (as ScanViewer.positions). */
  positions: Float32Array
  /** Triangle index if the mesh is indexed. */
  index: Uint32Array | null
  /** Vertex colours 0..1 if present. */
  colors: Float32Array | null
  /** Viewer units per millimetre (mesh.transform.scale). */
  unitsPerMm: number
  /** When the dentist says which arch; otherwise guessed. */
  arch?: Arch
}
