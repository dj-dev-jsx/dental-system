import { Link } from 'react-router'
import type { ReactNode } from 'react'
import type { PortalAppointment } from '../api'
import { ResendLink } from '../auth'
import { dateLeaf, dayOfMoment, dentistLabel, timeLabel } from '../format'
import { MailIcon, TickIcon } from '../icons'
import { Lead, primaryButton, ScreenHeading, StatusPill, textLink } from '../ui'
import { useClinic } from '../clinic-context'

// What patients see after sending a booking: "check your email" for a new account, and
// "request sent" once the request has reached the clinic.

/** The round badge over an outcome's heading. */
function Badge({ children, solid = false }: { children: ReactNode; solid?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mb-6 grid size-14 place-items-center rounded-full ${solid ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-950 ring-1 ring-neutral-200'}`}
    >
      {children}
    </span>
  )
}

export function CheckEmail({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const { clinic } = useClinic()
  return (
    <div>
      <Badge>
        <MailIcon className="size-7" strokeWidth={1.6} />
      </Badge>
      <ScreenHeading>Check your email</ScreenHeading>
      <Lead>
        We sent a link to <strong className="font-semibold [overflow-wrap:anywhere] text-neutral-950">{email}</strong>. Open it within
        24 hours to send your request to {clinic.name}.
      </Lead>
      <ul className="mt-8 flex flex-col gap-3 rounded-2xl bg-neutral-50 p-5 ring-1 ring-neutral-200">
        {[
          'Your request isn’t sent until you open the link. The time isn’t held for you before then.',
          'You can open it on this phone or on any other device.',
          'Can’t find it? Look in your spam or promotions folder.',
          'If you already have an account with this email, the email says how to sign in instead.',
        ].map((line) => (
          <li key={line} className="flex gap-3 text-[0.9375rem]/6 text-pretty text-neutral-700">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-neutral-950" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-col gap-6">
        <ResendLink email={email} label="Send the email again" />
        <p className="text-[0.9375rem] text-neutral-600">
          Wrong email address?{' '}
          <button type="button" onClick={onChangeEmail} className={textLink}>
            Go back and fix it
          </button>
        </p>
      </div>
    </div>
  )
}

/** One appointment as a ticket: a calendar leaf and the time, then label and value rows. */
export function AppointmentFacts({ appointment }: { appointment: PortalAppointment }) {
  const leaf = dateLeaf(appointment.startsAt)
  const rows: [string, ReactNode][] = [
    ['Dentist', dentistLabel(appointment.dentist)],
    ['For', appointment.reason],
    ['Status', <StatusPill key="status" status={appointment.status} />],
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200">
      <div className="flex items-center gap-4 bg-neutral-950 px-5 py-4 text-white">
        <span aria-hidden="true" className="grid w-14 shrink-0 overflow-hidden rounded-xl bg-white text-center text-neutral-950">
          <span className="bg-neutral-200 py-0.5 text-[0.6875rem] font-bold text-neutral-950 uppercase">{leaf.month}</span>
          <span className="py-1 text-[1.375rem] leading-none font-bold tabular-nums">{leaf.day}</span>
        </span>
        <div className="min-w-0">
          <p className="text-[1.0625rem] font-bold tracking-[-0.01em]">{dayOfMoment(appointment.startsAt)}</p>
          <p className="text-white/80">
            {timeLabel(appointment.startsAt)} to {timeLabel(appointment.endsAt)}
          </p>
        </div>
      </div>
      <dl className="px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[5rem_1fr] gap-3 border-b border-neutral-200 py-3.5 last:border-b-0 sm:grid-cols-[6rem_1fr]">
            <dt className="text-neutral-600">{label}</dt>
            <dd className="min-w-0 font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function RequestSent({ appointment, email }: { appointment: PortalAppointment; email?: string }) {
  const { clinic } = useClinic()
  const next: [string, ReactNode, boolean][] = [
    ['Sent to the clinic', `${clinic.name} has it now.`, true],
    ['The clinic answers', 'They check the time and confirm it, change it, or decline it.', false],
    [
      'We email you',
      <>
        {email ? (
          <>
            When they do, at
            <strong className="block font-semibold [overflow-wrap:anywhere] text-neutral-950">{email}</strong>
          </>
        ) : (
          'When they do.'
        )}
        <span className="mt-1 block">You can see or cancel it any time in My appointments.</span>
      </>,
      false,
    ],
  ]
  return (
    <div>
      <Badge solid>
        <TickIcon className="size-7" strokeWidth={2.25} draw />
      </Badge>
      <ScreenHeading>Request sent</ScreenHeading>
      <Lead>
        {clinic.name} has your request for {dayOfMoment(appointment.startsAt)}. It isn’t confirmed yet.
      </Lead>
      <div className="mt-8">
        <AppointmentFacts appointment={appointment} />
      </div>
      <h2 className="mt-10 text-lg font-bold tracking-[-0.01em]">What happens next</h2>
      <ol className="mt-4">
        {next.map(([title, text, done], i) => (
          <li key={title} className="relative grid grid-cols-[1.5rem_1fr] gap-x-3 pb-5 last:pb-0">
            {i < next.length - 1 && <span aria-hidden="true" className="absolute top-6 bottom-0 left-[0.6875rem] w-px bg-neutral-200" />}
            <span
              aria-hidden="true"
              className={`relative mt-0.5 grid size-6 place-items-center rounded-full ${done ? 'bg-neutral-950 text-white' : 'border-2 border-neutral-300 bg-white'}`}
            >
              {done && <TickIcon className="size-3.5" strokeWidth={2.75} />}
            </span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-0.5 text-[0.9375rem]/6 text-pretty text-neutral-600">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <Link to="/appointments" className={primaryButton}>
          My appointments
        </Link>
        <Link to="/" className={`${textLink} inline-flex min-h-11 items-center justify-center`}>
          Back to the home page
        </Link>
      </div>
    </div>
  )
}
