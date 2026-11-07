import type { CSSProperties } from 'react'

// The FDI tooth numbers, laid out as on a paper dental chart: the patient's right is on the
// viewer's left, upper teeth on top. Written out here rather than taken from the 3D chart's
// code, so pages that show them don't have to download the 3D library.
const half = (quadrant: number, order: 'in' | 'out') =>
  Array.from({ length: 8 }, (_, i) => `${quadrant}${order === 'in' ? 8 - i : i + 1}`)
const UPPER = [...half(1, 'in'), ...half(2, 'out')]
const LOWER = [...half(4, 'in'), ...half(3, 'out')]

type Props = {
  /** Just the upper teeth, or the whole mouth. */
  rows: 'upper' | 'both'
  /** 'dark' for black backgrounds and photos, 'light' for white ones. */
  tone: 'dark' | 'light'
  /** A light passes along the numbers once, like a lightbox switching on. */
  scan?: boolean
  className?: string
}

/** Decorative: screen readers skip it. */
export function ToothNumbers({ rows, tone, scan = false, className = '' }: Props) {
  const rule = tone === 'dark' ? 'border-white/25' : 'border-neutral-300'
  const ink = tone === 'dark' ? 'text-white/50' : 'text-neutral-400'

  const cells = (codes: string[], row: 'upper' | 'lower') =>
    codes.map((code, i) => (
      <span
        key={code}
        style={scan ? ({ '--i': i } as CSSProperties) : undefined}
        className={[
          'py-2.5 text-center',
          scan ? 'tooth-scan' : '',
          rows === 'both' && row === 'upper' ? `border-b ${rule}` : '',
          i === 7 ? `border-r ${rule}` : '',
        ].join(' ')}
      >
        {code}
      </span>
    ))

  return (
    <div
      aria-hidden="true"
      className={`grid grid-cols-[repeat(16,minmax(0,1fr))] text-xs tabular-nums select-none sm:text-sm ${ink} ${className}`}
    >
      {cells(UPPER, 'upper')}
      {rows === 'both' && cells(LOWER, 'lower')}
    </div>
  )
}
