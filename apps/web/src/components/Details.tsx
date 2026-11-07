import type { ReactNode } from 'react'

/** One label and value in a record. An empty value reads "Not recorded". */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-200 py-3 sm:grid-cols-[11rem_1fr] sm:gap-6">
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="break-words">{children || <span className="text-neutral-500">Not recorded</span>}</dd>
    </div>
  )
}

/** A titled group of details, over an ink rule. */
export function Details({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="mt-3 border-t border-neutral-950">{children}</dl>
    </section>
  )
}
