import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeftIcon } from './icons'

type Props = {
  /** Names the list for screen readers, like "Patients". */
  listLabel: string
  /** The list column: its own header, search, filters and the scrolling list. */
  list: ReactNode
  /** The selected item, or an empty state when nothing is selected. Usually an <Outlet />. */
  detail: ReactNode
  /** True when a specific item is open. On phones, that hides the list and shows only the detail. */
  showingDetail: boolean
}

/**
 * The workspace layout: a list on the left and the selected item on the right, like an email
 * app. Picking another item swaps the right side without losing your place in the list.
 * From 1024px the two sit side by side; below that, you see one at a time and the detail has
 * a Back link (<DetailBack>) to the list.
 */
export function SplitView({ listLabel, list, detail, showingDetail }: Props) {
  return (
    <div className="flex h-full min-h-0">
      <section
        aria-label={listLabel}
        className={`${showingDetail ? 'hidden lg:flex' : 'flex'} min-h-0 w-full shrink-0 flex-col border-neutral-200 lg:w-[24rem] lg:border-r xl:w-[27rem]`}
      >
        {list}
      </section>
      <section className={`${showingDetail ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white`}>{detail}</section>
    </div>
  )
}

/** On phones, the way back from a detail to its list. Hidden when the list is beside it. */
export function DetailBack({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950 lg:hidden">
      <ArrowLeftIcon className="size-4" /> {label}
    </Link>
  )
}

/** The right side when nothing is selected yet: what to do, and the main action. */
export function DetailEmpty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center px-8 py-16">
      <div className="max-w-sm text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-1 text-neutral-600">{text}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  )
}
