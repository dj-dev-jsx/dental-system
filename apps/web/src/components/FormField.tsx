import type { ReactNode } from 'react'
import { AlertIcon } from './icons'

type Props = {
  id: string
  label: string
  error?: string
  hint?: string
  className?: string
  /** The box itself. Give it id={id} and the aria props from fieldAria() in forms.ts. */
  children: ReactNode
}

/** A label, the box, and the line under it saying what to fix. */
export function FormField({ id, label, error, hint, className = '', children }: Props) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-neutral-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-sm font-medium">
          <AlertIcon className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
