import type { ReactNode } from 'react'
import { AlertIcon } from './icons'

/** An error: an inverted ink box, never red (see DESIGN.md). */
export function ErrorBox({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex gap-3 rounded-md bg-neutral-950 px-3.5 py-3 text-sm/6 text-white ${className}`} role="alert">
      <AlertIcon className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
