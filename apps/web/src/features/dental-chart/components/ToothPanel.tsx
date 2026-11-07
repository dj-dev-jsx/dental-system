import { toothName, type FdiCode } from '../model/fdi'
import { STATUS_COLORS, STATUS_LABELS, type ToothStatus } from '../model/status'

type Props = {
  selected: FdiCode | null
  toothStates: Record<FdiCode, ToothStatus>
}

export function ToothPanel({ selected, toothStates }: Props) {
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 border-l border-neutral-200 bg-white p-5">
      <section>
        <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Selected tooth
        </h2>
        {selected ? (
          <div className="mt-2">
            <p className="text-4xl font-bold text-neutral-900">#{selected}</p>
            <p className="text-neutral-600">{toothName(selected)}</p>
            <p className="mt-3 flex items-center gap-2 text-sm font-medium">
              <span
                className="inline-block h-3 w-3 rounded-full border border-neutral-300"
                style={{ background: STATUS_COLORS[toothStates[selected]] }}
              />
              {STATUS_LABELS[toothStates[selected]]}
            </p>
            <p className="mt-4 rounded bg-neutral-50 p-3 text-xs text-neutral-500">
              History, treatments and notes will appear here once the API is connected.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">
            Click a tooth. Drag to rotate, scroll to zoom.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Legend</h2>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-neutral-700">
          {(Object.keys(STATUS_LABELS) as ToothStatus[]).map((status) => (
            <li key={status} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full border border-neutral-300"
                style={{ background: STATUS_COLORS[status] }}
              />
              {STATUS_LABELS[status]}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
