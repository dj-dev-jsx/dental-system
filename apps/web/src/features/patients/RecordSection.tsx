import type { ReactNode } from 'react'

/** A section of the patient record: a heading over a 1px ink rule, with an action at the right. */
export function RecordSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-neutral-950 pb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
