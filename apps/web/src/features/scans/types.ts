// The shapes the API sends back for a patient's 3D scans.

export type ScanFormat = 'STL' | 'PLY' | 'OBJ'

export type Scan = {
  id: string
  title: string
  note: string | null
  format: ScanFormat
  fileName: string
  sizeBytes: number
  /** 'YYYY-MM-DD': the day the scan was taken. */
  scannedOn: string
  createdAt: string
  uploadedBy: { id: string; firstName: string; lastName: string }
  withdrawn: boolean
  withdrawnAt: string | null
  withdrawReason: string | null
  /** How many teeth are marked on the scan. */
  pinCount: number
}

/** Where a tooth was marked on a scan, in the scan file's own coordinates. */
export type ScanPin = {
  tooth: string
  x: number
  y: number
  z: number
  /** Where the crown meets the gum on the cheek side, when the automatic check found it. */
  neck?: { x: number; y: number; z: number } | null
}

export type ScanPins = {
  items: ScanPin[]
  updatedAt: string | null
  updatedBy: { id: string; firstName: string; lastName: string } | null
}

/** How a scan is shown when it opens, chosen by a dentist for everyone. Display only. */
export type ScanViewSettings = {
  view: 'SCAN_ONLY' | 'IN_SKULL'
  hideGums: boolean
  gumMethod: 'COLOUR' | 'PINS' | null
  /** mm below each tooth's pin, 0 to 12. */
  gumLineMm: number | null
  /** 0 to 100. */
  colourSensitivity: number | null
  updatedAt: string | null
  updatedBy: { id: string; firstName: string; lastName: string } | null
}

export type ScanViewSettingsInput = Omit<ScanViewSettings, 'updatedAt' | 'updatedBy'>

export type ScanInput = { file: File; title: string; note?: string; scannedOn?: string }

/** The largest file the server takes. */
export const MAX_SCAN_BYTES = 150 * 1024 * 1024

export const SCAN_EXTENSIONS = ['stl', 'ply', 'obj'] as const

export function formatOf(fileName: string): ScanFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  return ext === 'stl' || ext === 'ply' || ext === 'obj' ? (ext.toUpperCase() as ScanFormat) : null
}

/** "42.5 MB" */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : mb.toFixed(0)} MB`
}
