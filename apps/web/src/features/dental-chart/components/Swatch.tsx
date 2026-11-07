import { type Condition, STATUS_COLORS, statusOf } from '../model/status'

/** A dot in the condition's own colour, the one place hue means something. Dashed and empty for nothing. */
export function Swatch({ condition, onDark = false }: { condition: Condition | null; onDark?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-3 shrink-0 rounded-full ${
        condition ? (onDark ? 'ring-1 ring-white/30' : 'ring-1 ring-black/15') : `border border-dashed ${onDark ? 'border-neutral-500' : 'border-neutral-400'}`
      }`}
      style={condition ? { background: STATUS_COLORS[statusOf(condition)] } : undefined}
    />
  )
}
