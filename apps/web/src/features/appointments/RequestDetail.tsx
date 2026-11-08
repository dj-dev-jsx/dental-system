import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useOutletContext, useParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { AlertIcon } from '../../components/icons'
import { DetailBack } from '../../components/SplitView'
import { Pill } from '../../components/Table'
import { api, errorMessage } from '../../lib/api'
import { dentistName, formatDateTime, formatDayLong, formatTimeRange, fullName, manilaDate, minutesBetween } from '../../lib/format'
import { ClosePanel, ConfirmPanel } from './AppointmentActions'
import { DoneNotice, type RequestsContext } from './RequestsWorkspace'
import { type Appointment, STATUS_LABELS } from './types'
import { overdueReason, waitedFor, waitingFor } from './waiting'

/**
 * The open request, beside the queue. Taken from the list already loaded; only a request that
 * isn't in it (an old link, one answered elsewhere) is fetched, because fetching one is logged.
 */
export default function RequestDetail() {
  const { id = '' } = useParams()
  const context = useOutletContext<RequestsContext>()
  const fromList = context.find(id)
  const fetched = useQuery({
    // The same cache entry as useAppointment, so a just-answered request is already there.
    queryKey: ['appointments', 'one', id],
    queryFn: () => api<Appointment>(`/appointments/${id}`),
    enabled: !fromList && !context.loading,
  })
  const request = fromList ?? fetched.data

  return (
    <div className="flex flex-1 flex-col">
      {context.done && context.done.appointment.id !== id && (
        <div className="px-6 pt-5 lg:px-10">
          <DoneNotice done={context.done} onDismiss={context.clearDone} />
        </div>
      )}
      {request ? (
        <Request key={request.id} request={request} context={context} />
      ) : fetched.isError ? (
        <div className="px-6 py-6 lg:px-10">
          <DetailBack to={context.listPath} label="Requests" />
          <h1 className="text-2xl font-bold tracking-[-0.02em]">Request not found</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ErrorBox className="flex-1">{errorMessage(fetched.error)}</ErrorBox>
            <button type="button" onClick={() => void fetched.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="px-6 py-6 lg:px-10" aria-busy="true" aria-label="Loading the request">
          <div className="h-7 w-56 rounded bg-neutral-100" />
          <div className="mt-2 h-4 w-32 rounded bg-neutral-100" />
          <div className="mt-10 h-10 w-72 max-w-full rounded bg-neutral-100" />
          <div className="mt-3 h-6 w-48 rounded bg-neutral-100" />
          <div className="mt-10 h-11 w-60 rounded bg-neutral-100" />
        </div>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-200 py-3 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function Request({ request, context }: { request: Appointment; context: RequestsContext }) {
  const [panel, setPanel] = useState<'confirm' | 'decline' | null>(null)
  const [now] = useState(Date.now)
  const heading = useRef<HTMLHeadingElement>(null)
  const waiting = request.status === 'REQUESTED'
  const urgent = waiting ? overdueReason(request, now) : null
  const day = manilaDate(request.startsAt)
  const minutes = minutesBetween(request.startsAt, request.endsAt)

  // Opening the next request after answering one puts the cursor on its name, so keyboard
  // and screen reader users carry on from the top of the new request.
  const answered = (useLocation().state as { answered?: boolean } | null)?.answered === true
  useEffect(() => {
    if (answered) heading.current?.focus()
  }, [answered])

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-6 pt-5 pb-4 lg:px-10">
        <DetailBack to={context.listPath} label="Requests" />
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold tracking-[-0.02em] outline-none">
              <Link to={`/app/patients/${request.patient.id}`} className="outline-neutral-950 hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
                {fullName(request.patient)}
              </Link>
            </h1>
            <p className="mt-0.5 text-neutral-600 tabular-nums">{request.patient.phone ?? 'No phone number'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
            <Pill tone={waiting ? 'outline' : 'muted'}>{STATUS_LABELS[request.status]}</Pill>
            {urgent && <Pill tone="solid">{urgent}</Pill>}
            {waiting && request.conflict && <Pill tone="outline">Clash</Pill>}
          </div>
        </div>
      </header>

      <div className="max-w-3xl px-6 pt-8 pb-12 lg:px-10">
        <section aria-labelledby="asked-for">
          <h2 id="asked-for" className="text-sm font-semibold text-neutral-600">
            {waiting ? 'Asked for' : 'Was asked for'}
          </h2>
          <p className="mt-1 text-3xl font-bold tracking-[-0.02em] text-balance">{formatDayLong(day)}</p>
          <p className="mt-1 text-xl">
            {formatTimeRange(request.startsAt, request.endsAt)} <span className="text-neutral-500">· {minutes} min</span>
          </p>
          <p className="mt-1 text-neutral-700">{request.dentist ? dentistName(request.dentist) : 'Any dentist'}</p>
        </section>

        {waiting && request.conflict && (
          <div role="note" className="mt-6 flex gap-3 rounded-md bg-neutral-950 px-3.5 py-3 text-sm/6 text-white">
            <AlertIcon className="mt-0.5 shrink-0" />
            <p>
              <span className="font-semibold">
                Dr. {request.conflict.dentist.lastName} is busy {formatTimeRange(request.conflict.startsAt, request.conflict.endsAt)}.
              </span>{' '}
              Confirming at the time asked would double-book. Agree another time or dentist with the patient, then confirm.
            </p>
          </div>
        )}

        {waiting ? (
          <div className="mt-8">
            {panel === null ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setPanel('confirm')} className={`${buttonOnLight} h-11 px-6`}>
                  Confirm…
                </button>
                <button type="button" onClick={() => setPanel('decline')} className={`${buttonOutline} h-11 px-5`}>
                  Decline…
                </button>
              </div>
            ) : panel === 'confirm' ? (
              <ConfirmPanel appointment={request} onBack={() => setPanel(null)} onConfirmed={(appointment) => context.onDone({ appointment, action: 'confirmed' })} />
            ) : (
              <ClosePanel appointment={request} action="decline" onBack={() => setPanel(null)} onClosed={(appointment) => context.onDone({ appointment, action: 'declined' })} />
            )}
          </div>
        ) : (
          <p className="mt-8 text-neutral-700">
            {request.status === 'DECLINED' ? 'This request was declined.' : request.status === 'CONFIRMED' ? 'This request has been confirmed.' : 'This appointment was cancelled.'}{' '}
            <Link to={`/app/appointments/${request.id}`} className="font-semibold underline underline-offset-3 hover:no-underline">
              Open the appointment
            </Link>
          </p>
        )}

        <section aria-labelledby="request-facts" className="mt-12">
          <h2 id="request-facts" className="text-lg font-semibold">
            The request
          </h2>
          <dl className="mt-3 border-t border-neutral-950">
            <Fact label="Reason">{request.reason ?? <span className="text-neutral-500">No reason given</span>}</Fact>
            {request.status === 'DECLINED' && <Fact label="Reason declined">{request.statusNote ?? <span className="text-neutral-500">None given</span>}</Fact>}
            <Fact label="Requested">
              {formatDateTime(request.createdAt)}
              {!waiting && <span className="text-neutral-500"> ({waitedFor(request.createdAt, now)})</span>}
            </Fact>
            {waiting && <Fact label="Waited">{waitingFor(request.createdAt, now).replace('Waiting ', '').replace('Just in', 'Under two minutes')}</Fact>}
            <Fact label="Dentist">{request.dentist ? dentistName(request.dentist) : 'No preference'}</Fact>
          </dl>
          <p className="mt-4 text-sm">
            <Link to={`/app/appointments/${request.id}`} className="font-medium text-neutral-600 underline underline-offset-3 hover:text-neutral-950">
              Full appointment page and history
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
