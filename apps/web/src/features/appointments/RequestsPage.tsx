import { useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { errorMessage } from '../../lib/api'
import { dentistName, formatDateTime, formatDayShort, formatTimeRange, fullName, manilaDate } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ClosePanel, ConfirmPanel } from './AppointmentActions'
import { hasPassed } from './appointmentInput'
import { useRequests } from './queries'
import type { Appointment } from './types'

/** What was just done, so the request leaving the list doesn't look like it vanished. */
type Done = { appointment: Appointment; action: 'confirmed' | 'declined' }

/** Requests waiting for the clinic: confirm each one (perhaps at another time) or decline it. */
export default function RequestsPage() {
  useDocumentTitle('Requests')
  const requests = useRequests()
  const [done, setDone] = useState<Done | null>(null)

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-[-0.02em]">Requests</h1>
      <p className="mt-1 max-w-2xl text-neutral-600">
        Appointments patients asked for. A request doesn’t hold the time until you confirm it, so call or message the patient if you need to agree on another time.
      </p>

      <div aria-live="polite">
        {done && (
          <p className="mt-6 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
            <span className="font-semibold">
              {done.action === 'confirmed' ? 'Confirmed' : 'Declined'}: {fullName(done.appointment.patient)}
            </span>
            {done.action === 'confirmed' && (
              <>
                , {formatDayShort(manilaDate(done.appointment.startsAt))} at{' '}
                {formatTimeRange(done.appointment.startsAt, done.appointment.endsAt)}
                {done.appointment.dentist && ` with ${dentistName(done.appointment.dentist)}`}.{' '}
                <Link to={`/app/appointments?date=${manilaDate(done.appointment.startsAt)}`} className="font-semibold underline underline-offset-3">
                  See the day
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {requests.isError ? (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ErrorBox className="flex-1">{errorMessage(requests.error)}</ErrorBox>
          <button type="button" onClick={() => void requests.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
            Try again
          </button>
        </div>
      ) : requests.isPending ? (
        <div className="mt-8 border-t border-neutral-950" aria-busy="true" aria-label="Loading requests">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="border-b border-neutral-200 py-5">
              <div className="h-5 w-56 rounded bg-neutral-100" />
              <div className="mt-2 h-4 w-80 max-w-full rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : requests.data.items.length === 0 ? (
        <div className="relative mt-8 overflow-hidden rounded-md bg-neutral-950 text-white">
          <img src="/images/clinic-room-960.jpg" srcSet="/images/clinic-room-960.jpg 960w, /images/clinic-room-1920.jpg 1920w" sizes="(min-width: 1024px) 60rem, 100vw" alt="" className="absolute inset-0 size-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-linear-to-r from-neutral-950 via-neutral-950/80 to-neutral-950/20" />
          <div className="relative px-6 py-14 sm:px-10 sm:py-20">
            <h2 className="text-2xl font-bold tracking-[-0.02em]">No requests waiting</h2>
            <p className="mt-2 max-w-sm text-neutral-300">You’re all caught up. New requests from patients will appear here, and in the menu.</p>
          </div>
        </div>
      ) : (
        <>
          <ol className="mt-8 border-t border-neutral-950">
            {requests.data.items.map((request) => (
              <RequestItem key={request.id} request={request} onDone={setDone} />
            ))}
          </ol>
          {requests.data.total > requests.data.items.length && (
            <p className="mt-3 text-sm text-neutral-500">
              Showing the first {requests.data.items.length} of {requests.data.total}. Answer these to see the rest.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function RequestItem({ request, onDone }: { request: Appointment; onDone: (done: Done) => void }) {
  const [panel, setPanel] = useState<'confirm' | 'decline' | null>(null)
  const passed = hasPassed(request)

  return (
    <li className="border-b border-neutral-200 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">
            <Link to={`/app/patients/${request.patient.id}`} className="hover:underline hover:underline-offset-3">
              {fullName(request.patient)}
            </Link>
          </p>
          <p className="mt-0.5 font-medium">
            {formatDayShort(manilaDate(request.startsAt))}, {formatTimeRange(request.startsAt, request.endsAt)}
            <span className="font-normal text-neutral-600">
              {' · '}
              {request.dentist ? dentistName(request.dentist) : 'Any dentist'}
            </span>
          </p>
          {request.reason && <p className="mt-1 text-neutral-700">{request.reason}</p>}
          <p className="mt-1 text-sm text-neutral-500">
            {request.patient.phone ?? 'No phone number'} · Requested {formatDateTime(request.createdAt)}
          </p>
          {passed && <p className="mt-2 text-sm font-semibold">This day has passed. Confirm at a new time, or decline.</p>}
        </div>
        {panel === null && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setPanel('confirm')} className={`${buttonOnLight} h-9 px-4 text-sm`}>
              Confirm…
            </button>
            <button type="button" onClick={() => setPanel('decline')} className={`${buttonOutline} h-9 px-4 text-sm`}>
              Decline…
            </button>
          </div>
        )}
      </div>

      {panel === 'confirm' && (
        <ConfirmPanel
          appointment={request}
          onBack={() => setPanel(null)}
          onConfirmed={(appointment) => onDone({ appointment, action: 'confirmed' })}
        />
      )}
      {panel === 'decline' && (
        <ClosePanel
          appointment={request}
          action="decline"
          onBack={() => setPanel(null)}
          onClosed={(appointment) => onDone({ appointment, action: 'declined' })}
        />
      )}
    </li>
  )
}
