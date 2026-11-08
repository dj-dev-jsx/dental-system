import type { ReactNode } from 'react'

/** The side padding of the right-hand pane of the patients workspace. */
export const PANE_X = 'px-6 lg:px-10'

/**
 * The right side of the patients workspace: pane padding instead of a page container, and a
 * left-aligned measure that suits the pane (records 64rem, forms 48rem). It is a size
 * container, so the record's grids respond to the pane's width rather than the window's.
 */
export function DetailPane({ children, narrow = false, className = '' }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return (
    <div className={`@container ${PANE_X} py-8 ${className}`}>
      <div className={narrow ? 'max-w-3xl' : 'max-w-5xl'}>{children}</div>
    </div>
  )
}
