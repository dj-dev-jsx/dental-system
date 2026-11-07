import type { Chart } from '../api'
import { type FdiCode, toothName } from '../model/fdi'
import { GHOST_STATUSES, STATUS_COLORS, STATUS_LABELS, statusOf } from '../model/status'

// The way a dentist reads a chart: the patient's right on the viewer's left.
// Upper jaw 18 to 11 then 21 to 28; lower jaw 48 to 41 then 31 to 38.
const UPPER: FdiCode[] = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const LOWER: FdiCode[] = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']

type Props = {
  teeth: Chart['teeth']
  selected: FdiCode | null
  onSelect: (code: FdiCode) => void
  /** The large version, shown instead of the 3D model; otherwise a strip under it. */
  large?: boolean
}

/**
 * Every tooth as a button, in chart order. It works with the keyboard and on computers that
 * can't show 3D, and it's always there under the model for picking a tooth by number.
 */
export function ToothGrid({ teeth, selected, onSelect, large = false }: Props) {
  const row = (codes: FdiCode[], jaw: string) => (
    <div role="group" aria-label={jaw} className="grid grid-cols-16">
      {codes.map((code, i) => {
        const now = teeth[code]
        const status = now ? statusOf(now.condition) : null
        const ghost = status !== null && GHOST_STATUSES.has(status)
        const isSelected = code === selected
        return (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            aria-pressed={isSelected}
            aria-label={`${code}, ${toothName(code)}: ${status ? STATUS_LABELS[status] : 'nothing recorded'}`}
            className={`relative flex flex-col items-center justify-between gap-1 tabular-nums outline-white transition-colors duration-150 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 ${
              large ? 'h-20 py-3 text-base' : 'h-12 py-1.5 text-xs'
            } ${i === 8 ? 'border-l border-white/40' : i > 0 ? 'border-l border-white/10' : ''} ${
              isSelected ? 'bg-white font-semibold text-neutral-950' : 'text-neutral-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className={ghost ? 'line-through decoration-1 opacity-70' : ''}>{code}</span>
            {/* The condition's own colour: the one place colour carries meaning (see DESIGN.md). */}
            <span
              aria-hidden="true"
              className={`block rounded-full ${large ? 'h-2.5 w-8' : 'h-1.5 w-5'} ${status ? '' : 'border border-white/20'}`}
              style={status ? { background: STATUS_COLORS[status], opacity: ghost ? 0.5 : 1 } : undefined}
            />
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="min-w-[36rem] text-white">
      {row(UPPER, 'Upper teeth')}
      <div className="border-t border-white/40" />
      {row(LOWER, 'Lower teeth')}
    </div>
  )
}
