import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronDownIcon } from './icons'

// One table vocabulary for every list in the app (see DESIGN.md "Tables and record details"):
// a heading row in graphite over a 1px ink rule, hairlines between rows, a mist fill on hover,
// the row's name as its link, and the whole row clickable. Less important columns drop out on
// narrow screens (give them `hideBelow`) instead of scrolling sideways.

/** The breakpoint below which a column is hidden. */
export type HideBelow = 'sm' | 'md' | 'lg' | 'xl'

const HIDE: Record<HideBelow, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

export function Table({ children, busy = false, label }: { children: ReactNode; busy?: boolean; label: string }) {
  return (
    <table aria-label={label} aria-busy={busy} className={`w-full text-left transition-opacity duration-150 ${busy ? 'opacity-50' : ''}`}>
      {children}
    </table>
  )
}

type ThProps = {
  children?: ReactNode
  hideBelow?: HideBelow
  align?: 'left' | 'right'
  /** Makes the heading a sort button. `direction` says how the column is sorted now, if it is. */
  onSort?: () => void
  direction?: 'asc' | 'desc'
  /** For columns that have no visible heading, like row actions. */
  srOnly?: boolean
}

/** A column heading, optionally a button that sorts by that column. */
export function Th({ children, hideBelow, align = 'left', onSort, direction, srOnly = false }: ThProps) {
  const sorted = direction !== undefined
  return (
    <th
      scope="col"
      aria-sort={sorted ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`py-2.5 pr-4 text-sm font-medium text-neutral-600 last:pr-0 ${align === 'right' ? 'text-right' : ''} ${hideBelow ? HIDE[hideBelow] : ''}`}
    >
      {srOnly ? (
        <span className="sr-only">{children}</span>
      ) : onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={`-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 outline-neutral-950 hover:text-neutral-950 focus-visible:outline-2 ${sorted ? 'text-neutral-950' : ''}`}
        >
          {children}
          <ChevronDownIcon className={`size-3.5 transition-transform duration-150 ${sorted ? '' : 'opacity-0'} ${direction === 'asc' ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        children
      )}
    </th>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-neutral-950">{children}</thead>
}

/**
 * A row. Give `to` and its first cell's link covers the whole row (a "stretched link"), so a
 * click anywhere opens the record while the name stays a real, keyboard-focusable link.
 */
export function Tr({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <tr className={`group relative border-b border-neutral-200 hover:bg-neutral-50 ${muted ? 'text-neutral-500' : ''}`}>{children}</tr>
}

/** A cell. Primary cells hold the name; the rest are quieter. */
export function Td({ children, hideBelow, align = 'left', primary = false }: { children?: ReactNode; hideBelow?: HideBelow; align?: 'left' | 'right'; primary?: boolean }) {
  return (
    <td className={`py-3 pr-4 align-top last:pr-0 ${align === 'right' ? 'text-right' : ''} ${primary ? '' : 'text-neutral-700'} ${hideBelow ? HIDE[hideBelow] : ''}`}>{children}</td>
  )
}

/** The name in a row, as a link whose click area is the whole row. */
export function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-semibold outline-neutral-950 after:absolute after:inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 group-hover:underline group-hover:underline-offset-3">
      {children}
    </Link>
  )
}

/** A second, quieter line under a cell's main text. */
export function Sub({ children }: { children: ReactNode }) {
  return <span className="block text-sm text-neutral-500">{children}</span>
}

/** Shown in place of a missing value: a dash that reads as "nothing here", not as an error. */
export function None() {
  return (
    <span className="text-neutral-400" aria-label="Not recorded">
      —
    </span>
  )
}

type PillProps = { children: ReactNode; tone?: 'solid' | 'outline' | 'muted' }

/** A small status label. Solid is for what needs action, outline for notable, muted for done or inactive. */
export function Pill({ children, tone = 'outline' }: PillProps) {
  const tones = {
    solid: 'bg-neutral-950 text-white',
    outline: 'border border-neutral-950 text-neutral-950',
    muted: 'border border-neutral-300 text-neutral-600',
  }
  return <span className={`inline-flex shrink-0 items-center rounded-sm px-1.5 text-xs/5 font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>
}

/** The line under a table: how many are shown, and the page buttons if there are several pages. */
export function TableFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">{children}</div>
}
