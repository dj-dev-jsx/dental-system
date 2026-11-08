import type { ReactNode } from 'react'

type Option<T extends string> = { value: T; label: ReactNode }

/**
 * A small set of exclusive choices side by side, like "Waiting / Declined". The chosen one is
 * ink on white; the others are quiet text. They are buttons, so the keyboard and screen
 * readers get the same states a mouse does (aria-pressed).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-neutral-300 p-0.5">
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-semibold outline-neutral-950 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
              on ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
