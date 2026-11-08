import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeftIcon } from './icons'

/**
 * The frame every working page sits in, so they all start at the same left edge and the
 * same height: a 72rem column with 20px (phone) or 32px side gutters. A page that is mostly
 * a form or a record passes `narrow`, which keeps its content to a readable 48rem measure
 * but still left-aligned with everything else (never centred, or the edge would jump).
 */
export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className={narrow ? 'max-w-3xl' : undefined}>{children}</div>
    </div>
  )
}

type HeaderProps = {
  title: ReactNode
  /** One quiet line under the title: what this page is, or the key facts about the record. */
  description?: ReactNode
  /** The page's main actions, aligned right; they wrap under the title on phones. */
  actions?: ReactNode
  /** A link back to the list this page belongs to. */
  back?: { to: string; label: string }
  /** Extra line items under the description, such as a row of facts. */
  children?: ReactNode
}

/** The top of a page: where you came from, what this is, and what you can do here. */
export function PageHeader({ title, description, actions, back, children }: HeaderProps) {
  return (
    <header>
      {back && (
        <Link to={back.to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
          <ArrowLeftIcon className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-balance">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-neutral-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
