export type ToothStatus =
  | 'healthy'
  | 'decayed'
  | 'filled'
  | 'crown'
  | 'root_canal'
  | 'implant'
  | 'missing'
  | 'extracted'

export const STATUS_LABELS: Record<ToothStatus, string> = {
  healthy: 'Healthy',
  decayed: 'Decayed',
  filled: 'Filled',
  crown: 'Crown',
  root_canal: 'Root canal',
  implant: 'Implant',
  missing: 'Missing',
  extracted: 'Extracted',
}

export const STATUS_COLORS: Record<ToothStatus, string> = {
  healthy: '#f4efe2',
  decayed: '#8a4b1f',
  filled: '#5b8def',
  crown: '#e0b13a',
  root_canal: '#d9534f',
  implant: '#94a3b8',
  missing: '#b8c2d1',
  extracted: '#d6a8a8',
}

/** Missing and extracted teeth are drawn as translucent "ghosts" but stay clickable. */
export const GHOST_STATUSES: ReadonlySet<ToothStatus> = new Set(['missing', 'extracted'])

// The API's names for the same conditions and surfaces. See apps/api/prisma/schema.prisma.
export type Condition = 'HEALTHY' | 'DECAYED' | 'FILLED' | 'CROWN' | 'ROOT_CANAL' | 'IMPLANT' | 'MISSING' | 'EXTRACTED'
export type Surface = 'MESIAL' | 'DISTAL' | 'OCCLUSAL' | 'BUCCAL' | 'LINGUAL'

export const CONDITIONS: Condition[] = ['HEALTHY', 'DECAYED', 'FILLED', 'CROWN', 'ROOT_CANAL', 'IMPLANT', 'MISSING', 'EXTRACTED']
export const SURFACES: Surface[] = ['MESIAL', 'DISTAL', 'OCCLUSAL', 'BUCCAL', 'LINGUAL']

/** The 3D model's name for an API condition. */
export const statusOf = (condition: Condition) => condition.toLowerCase() as ToothStatus

/** Decay and fillings are on particular sides of a tooth; the rest are the whole tooth. */
export const HAS_SURFACES: ReadonlySet<Condition> = new Set(['DECAYED', 'FILLED'])

export const SURFACE_LABELS: Record<Surface, string> = {
  MESIAL: 'Mesial',
  DISTAL: 'Distal',
  OCCLUSAL: 'Occlusal (biting)',
  BUCCAL: 'Buccal (cheek side)',
  LINGUAL: 'Lingual (tongue side)',
}

/** "Occlusal, distal", for a history line. */
export function surfaceList(surfaces: Surface[]) {
  const text = surfaces.map((surface) => SURFACE_LABELS[surface].split(' ')[0].toLowerCase()).join(', ')
  return text && text[0].toUpperCase() + text.slice(1)
}
