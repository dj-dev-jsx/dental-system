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
