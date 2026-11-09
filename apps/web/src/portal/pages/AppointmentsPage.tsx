import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { PlusIcon } from '../../components/icons'
import { commonMessage, errorCode, isSignedOut, type PortalAppointment, portalApi } from '../api'
import { dateLeaf, dayOfMoment, dentistLabel, timeLabel } from '../format'
import { appointmentsKey, signOut, useForgetSession, useSession } from '../session'
import { LoadFailed, Notice, PortalPage, portalTextarea, primaryButton, Problem, ScreenHeading, secondaryButton, Skeleton, StatusPill, textLink } from '../ui'
import { useClinic, usePortalTitle } from '../clinic-context'

// /appointments — only the signed-in patient's own appointments: the ones they
// booked online, and the clinic's bookings for them once staff have linked their record.

export default function AppointmentsPage() {
  usePortalTitle('My appointments')
  const session = useSession()

  if (session.isPending) return <PortalPage><ListSkeleton /></PortalPage>
  if (session.isError) {
    return (
      <PortalPage>
        <div className="mx-auto max-w-3xl px-5 pt-10 sm:px-10">
          <LoadFailed message={commonMessage(session.error)} onRetry={() => void session.refetch()} retrying={session.isFetching} />
        </div>
      </PortalPage>
    )
  }
  if (!session.data) {
    return <Navigate to="/sign-in" replace state={{ notice: 'Sign in to see your appointments.' }} />
  }
  return (
    <PortalPage>
      <Appointments name={`${session.data.firstName} ${session.data.lastName}`} email={session.data.email} />
    </PortalPage>
  )
}

function ListSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-5 pt-10 sm:px-10" aria-busy="true">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="mt-10 h-24" />
      <Skeleton className="mt-3 h-24" />
    </div>
  )
}

function Appointments({ name, email }: { name: string; email: string }) {
  const forget = useForgetSession()
  const [done, setDone] = useState<string | null>(null)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const list = useQuery({ queryKey: appointmentsKey(), queryFn: () => portalApi.appointments() })

  // The session ended (expired, or the password was changed elsewhere): back to sign in.
  useEffect(() => {
    if (isSignedOut(list.error)) forget()
  }, [list.error, forget])

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8 pb-20 sm:px-10 sm:pt-14">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <ScreenHeading>My appointments</ScreenHeading>
          <p className="mt-2 text-neutral-600">
            Signed in as <span className="font-semibold text-neutral-950">{name}</span>
            <span className="[overflow-wrap:anywhere]"> · {email}</span>
          </p>
        </div>
        <Link to="/book" className={`${primaryButton} shrink-0`}>
          <PlusIcon /> Book another
        </Link>
      </div>

      {done && <Notice className="mt-8">{done}</Notice>}

      {list.isPending ? (
        <div className="mt-10" aria-busy="true">
          <Skeleton className="h-24" />
          <Skeleton className="mt-3 h-24" />
        </div>
      ) : list.isError ? (
        isSignedOut(list.error) ? null : (
          <div className="mt-10">
            <LoadFailed message={commonMessage(list.error)} onRetry={() => void list.refetch()} retrying={list.isFetching} />
          </div>
        )
      ) : (
        <>
          <section aria-labelledby="upcoming-heading" className="mt-12">
            <h2 id="upcoming-heading" className="text-xl font-bold tracking-[-0.01em]">
              Upcoming
            </h2>
            {list.data.upcoming.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 px-5 py-6">
                <p className="text-[1.0625rem] font-semibold">No upcoming appointments.</p>
                <p className="mt-1 text-neutral-600">When you book, your request shows here until the clinic answers.</p>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {list.data.upcoming.map((appointment) => (
                  <AppointmentRow key={appointment.id} appointment={appointment} onCancelled={setDone} />
                ))}
              </ul>
            )}
          </section>

          {list.data.past.length > 0 && (
            <section aria-labelledby="past-heading" className="mt-14">
              <h2 id="past-heading" className="text-xl font-bold tracking-[-0.01em]">
                Past and cancelled
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {list.data.past.map((appointment) => (
                  <AppointmentRow key={appointment.id} appointment={appointment} past onCancelled={setDone} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="mt-16 flex flex-col gap-3 rounded-2xl bg-neutral-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9375rem] text-neutral-600">On a shared phone or computer? Sign out when you’re done.</p>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true)
            setSignOutFailed(false)
            signOut().catch(() => {
              setSigningOut(false)
              setSignOutFailed(true)
            })
          }}
          className={`${secondaryButton} shrink-0`}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      {signOutFailed && (
        <Problem className="mt-4">
          You’re still signed in: we couldn’t reach the clinic’s booking system. Check your connection, then try again.
        </Problem>
      )}
    </div>
  )
}

function AppointmentRow({
  appointment,
  past = false,
  onCancelled,
}: {
  appointment: PortalAppointment
  past?: boolean
  onCancelled: (message: string) => void
}) {
  const { clinic } = useClinic()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const reasonId = useId()
  const isRequest = appointment.status === 'REQUESTED'
  const muted = past || appointment.status === 'CANCELLED' || appointment.status === 'DECLINED'
  const leaf = dateLeaf(appointment.startsAt)

  const cancel = useMutation({
    mutationFn: () => portalApi.cancel(appointment.id, reason.trim() || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appointmentsKey() })
      onCancelled(
        `${isRequest ? 'Request' : 'Appointment'} for ${dayOfMoment(appointment.startsAt)} at ${timeLabel(appointment.startsAt)} cancelled. The clinic can see that you cancelled.`,
      )
    },
    onError: (error) => {
      // Already answered or already started: the list is out of date.
      if (errorCode(error) === 'CANNOT_CANCEL' || (error as { status?: number }).status === 404) {
        void queryClient.invalidateQueries({ queryKey: appointmentsKey() })
      }
    },
  })

  const cancelFailure = cancel.isError
    ? errorCode(cancel.error) === 'CANNOT_CANCEL'
      ? `This can’t be cancelled online any more.${clinic.phone ? ` Call the clinic at ${clinic.phone}.` : ' Contact the clinic.'}`
      : commonMessage(cancel.error)
    : null

  return (
    <li className={`rounded-2xl border p-4 sm:p-5 ${muted ? 'border-neutral-200 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 gap-4">
          <span
            aria-hidden="true"
            className={`grid w-14 shrink-0 self-start overflow-hidden rounded-xl text-center ring-1 ${muted ? 'bg-white text-neutral-500 ring-neutral-200' : 'bg-white text-neutral-950 ring-neutral-300'}`}
          >
            <span className={`py-0.5 text-[0.6875rem] font-bold uppercase ${muted ? 'bg-neutral-200 text-neutral-600' : 'bg-neutral-950 text-white'}`}>
              {leaf.month}
            </span>
            <span className="py-1 text-[1.375rem] leading-none font-bold tabular-nums">{leaf.day}</span>
          </span>
        <div className="min-w-0">
          <p className={`text-[1.125rem] font-bold tracking-[-0.01em] ${muted ? 'text-neutral-600' : ''}`}>{dayOfMoment(appointment.startsAt)}</p>
          <p className={`mt-0.5 text-[1.0625rem] ${muted ? 'text-neutral-600' : 'font-medium'}`}>
            {timeLabel(appointment.startsAt)} to {timeLabel(appointment.endsAt)} · {dentistLabel(appointment.dentist)}
          </p>
          <p className="mt-1 break-words text-neutral-600">{appointment.reason}</p>
          {appointment.statusNote && (
            <p className="mt-2 text-pretty text-neutral-800">
              <span className="font-semibold">Clinic’s note:</span> {appointment.statusNote}
            </p>
          )}
        </div>
        </div>
        <div className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 pl-[4.5rem] sm:flex-col sm:items-end sm:pl-0">
          <StatusPill status={appointment.status} />
          {appointment.canCancel && !asking && (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className={`${textLink} inline-flex min-h-11 items-center px-1 text-[0.9375rem]`}
            >
              Cancel {isRequest ? 'request' : 'appointment'}
            </button>
          )}
        </div>
      </div>

      {asking && (
        <div className="mt-4 rounded-xl bg-neutral-100 p-4">
          <p className="font-semibold">Cancel {isRequest ? 'this request' : 'this appointment'}?</p>
          <p className="mt-1 text-[0.9375rem] text-pretty text-neutral-700">
            {isRequest
              ? 'The clinic will see that you cancelled it. You can book again any time.'
              : 'The time goes back on the clinic’s calendar for other patients. You can book again any time.'}
          </p>
          <label htmlFor={reasonId} className="mt-4 block text-sm font-semibold">
            Why are you cancelling? <span className="font-normal text-neutral-600">Optional</span>
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={2}
            className={`${portalTextarea} mt-2 min-h-20`}
          />
          {cancelFailure && <Problem className="mt-4">{cancelFailure}</Problem>}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending} className={primaryButton}>
              {cancel.isPending ? 'Cancelling…' : `Yes, cancel it`}
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false)
                cancel.reset()
              }}
              className={secondaryButton}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
