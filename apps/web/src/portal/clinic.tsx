import { type ReactNode, useEffect } from 'react'
import { Link } from 'react-router'
import { useSite } from '../lib/useSite'
import { commonMessage, isNotAvailable } from './api'
import { ClinicContext, useClinicInfo } from './clinic-context'

/**
 * Loads the clinic's name, hours and dentists before any page shows. While the clinic has
 * online booking switched off, one calm page with its phone number; a failed connection gets a retry.
 */
export function ClinicGate({ children }: { children: ReactNode }) {
  const info = useClinicInfo()

  if (info.data) return <ClinicContext value={{ clinic: info.data }}>{children}</ClinicContext>
  if (info.isPending) return <GateLoading />
  if (isNotAvailable(info.error)) return <NotAvailable />
  return (
    <BareScreen title="This page didn’t load">
      <p className="mt-3 text-[1.0625rem]/7 text-pretty text-neutral-600">{commonMessage(info.error)}</p>
      <button
        type="button"
        onClick={() => void info.refetch()}
        disabled={info.isFetching}
        className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 font-semibold text-white outline-neutral-950 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:bg-neutral-950/70"
      >
        {info.isFetching ? 'Trying again…' : 'Try again'}
      </button>
    </BareScreen>
  )
}

function GateLoading() {
  return (
    <div className="flex min-h-full flex-col bg-white" aria-busy="true">
      <div className="h-16 border-b border-neutral-200" />
      <div className="mx-auto w-full max-w-md px-5 pt-16">
        <div className="h-9 w-2/3 rounded-xl bg-neutral-100" />
        <div className="mt-4 h-5 w-full rounded-xl bg-neutral-100" />
        <p className="appear-late mt-8 text-sm text-neutral-500">Loading…</p>
      </div>
    </div>
  )
}

/** A page without the clinic's header: for when its booking details didn't load. */
function BareScreen({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title
  }, [title])
  return (
    <main className="flex min-h-full flex-col justify-center bg-white px-5 py-16 text-neutral-950 sm:px-10">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-[1.875rem] leading-[1.1] font-bold tracking-[-0.02em] text-balance sm:text-4xl">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function NotAvailable() {
  const site = useSite()
  return (
    <BareScreen title="Online booking is closed for now">
      <p className="mt-3 text-[1.0625rem]/7 text-pretty text-neutral-600">
        {site?.phone ? (
          <>
            To book a visit, call {site.name} on{' '}
            <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`} className="font-semibold whitespace-nowrap text-neutral-950 underline underline-offset-4">
              {site.phone}
            </a>
            .
          </>
        ) : (
          `To book a visit, call or visit ${site?.name ?? 'the clinic'}.`
        )}
      </p>
      <p className="mt-4 text-[1.0625rem]/7 text-pretty text-neutral-600">
        Appointments you already have still stand. Online booking and sign-in for patients will
        be back when the clinic switches them on again.
      </p>
      <Link to="/" className="mt-8 inline-flex min-h-11 items-center font-semibold text-neutral-950 underline underline-offset-4">
        Back to the home page
      </Link>
    </BareScreen>
  )
}
