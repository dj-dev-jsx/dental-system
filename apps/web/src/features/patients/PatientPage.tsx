import { type ReactNode, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { ArrowRightIcon, CalendarIcon, CheckIcon, ToothIcon } from '../../components/icons'
import { DetailBack } from '../../components/SplitView'
import { Pill } from '../../components/Table'
import { ApiError, errorMessage } from '../../lib/api'
import { ageLabel, dentistName, formatDate, formatDateTime, formatTimeRange, fullName, manilaDate, SEX_LABELS } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PatientAppointments } from '../appointments/PatientAppointments'
import type { Appointment } from '../appointments/types'
import { usePatientAppointmentSummary } from '../appointments/usePatientAppointmentSummary'
import { useStaffUser } from '../auth/authStore'
import { CONDITIONS, STATUS_COLORS, STATUS_LABELS, statusOf } from '../dental-chart/model/status'
import { OnlineAccountSection } from '../patient-accounts/OnlineAccountSection'
import { DetailPane, PANE_X } from './DetailPane'
import { useWorkspaceLink } from './listParams'
import { PatientHistory } from './PatientHistory'
import { usePatient, useSetArchived } from './queries'
import { RecordSection } from './RecordSection'
import type { ChartSummary, Patient } from './types'

type LocationState = { registered?: boolean } | null

export default function PatientPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const link = useWorkspaceLink()
  const user = useStaffUser()
  const isAdmin = user.role === 'ADMIN'
  const { data: patient, isPending, isError, error, refetch } = usePatient(id)
  const setArchived = useSetArchived(id)
  useDocumentTitle(patient ? fullName(patient) : 'Patient')
  const justRegistered = Boolean((location.state as LocationState)?.registered)

  if (isPending) {
    return (
      <DetailPane>
        <DetailBack to={link('/app/patients')} label="Patients" />
        <div aria-busy="true" aria-label="Loading the record">
          <div className="h-8 w-80 max-w-full rounded bg-neutral-100" />
          <div className="mt-3 h-4 w-64 max-w-full rounded bg-neutral-100" />
          <div className="mt-10 grid gap-4 @md:grid-cols-2">
            <div className="h-32 rounded bg-neutral-100" />
            <div className="h-32 rounded bg-neutral-100" />
          </div>
          <div className="mt-10 h-40 rounded bg-neutral-100" />
          <p className="appear-late mt-6 text-sm text-neutral-500">Loading…</p>
        </div>
      </DetailPane>
    )
  }
  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <DetailPane>
        <DetailBack to={link('/app/patients')} label="Patients" />
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{notFound ? 'Patient not found' : 'The record didn’t load'}</h1>
        <p className="mt-1.5 max-w-prose text-neutral-600">
          {notFound ? 'It may have been removed, or the link is wrong. Pick a patient from the list instead.' : errorMessage(error)}
        </p>
        {!notFound && (
          <button type="button" onClick={() => void refetch()} className={`${buttonOutline} mt-5 h-9 px-4 text-sm`}>
            Try again
          </button>
        )}
      </DetailPane>
    )
  }

  const archived = Boolean(patient.archivedAt)
  const facts = [ageLabel(patient.birthDate), patient.sex && SEX_LABELS[patient.sex], `Born ${formatDate(patient.birthDate)}`].filter(Boolean)
  const contact = [patient.phone, patient.email].filter(Boolean)

  return (
    <div className="@container">
      {/* Stays at the top of the pane while the record scrolls, so the name (the check that
          this is the right person) and the main actions are always in view. */}
      <header className={`border-b border-neutral-200 bg-white ${PANE_X} pt-6 pb-4 lg:sticky lg:top-0 lg:z-20 lg:pt-5`}>
        <div className="max-w-5xl">
          <DetailBack to={link('/app/patients')} label="Patients" />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold tracking-[-0.02em] text-balance break-words">
                {fullName(patient)}
                {archived && <Pill tone="muted">Archived</Pill>}
              </h1>
              <p className="mt-1 text-sm text-neutral-600">
                {facts.join(' · ')}
                {contact.length > 0 && (
                  <>
                    <span aria-hidden="true" className="hidden @3xl:inline"> · </span>
                    <span className="block break-words @3xl:inline">{contact.join(' · ')}</span>
                  </>
                )}
              </p>
            </div>
            {!archived && (
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/app/patients/${id}/chart`} className={`${buttonOnLight} h-9 px-4 text-sm`}>
                  <ToothIcon className="size-4" /> Dental chart
                </Link>
                <Link to={`/app/appointments/new?patientId=${id}`} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
                  <CalendarIcon className="size-4" /> Book
                  <span className="sr-only"> appointment</span>
                </Link>
                <Link to={link(`/app/patients/${id}/edit`)} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
                  Edit
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`${PANE_X} pb-16`}>
        <div className="max-w-5xl">
          {justRegistered && !archived && (
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md bg-neutral-100 px-4 py-3" role="status">
              <p className="mr-auto flex items-center gap-2 text-sm/6">
                <CheckIcon className="size-4 shrink-0" />
                <span>
                  <span className="font-semibold">Registered.</span> Add the rest of their details any time.
                </span>
              </p>
              <Link to={`/app/appointments/new?patientId=${id}`} className={`${buttonOnLight} h-8 px-3 text-sm`}>
                Book first visit
              </Link>
              <Link to={link('/app/patients/new')} className="text-sm font-semibold underline underline-offset-3 hover:text-neutral-700">
                Register another
              </Link>
            </div>
          )}

          {archived && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md bg-neutral-100 px-4 py-3">
              <p className="text-sm/6">
                <span className="font-semibold">Archived {formatDateTime(patient.archivedAt!)}.</span> The record is kept, but the patient no longer appears in the current list.
              </p>
              {isAdmin && (
                <button type="button" disabled={setArchived.isPending} onClick={() => setArchived.mutate(false)} className={`${buttonOnLight} h-9 px-4 text-sm`}>
                  {setArchived.isPending ? 'Restoring…' : 'Restore'}
                </button>
              )}
            </div>
          )}

          {setArchived.isError && <ErrorBox className="mt-6">{errorMessage(setArchived.error)}</ErrorBox>}

          <AtAGlance patient={patient} archived={archived} />

          <div className="mt-12 grid gap-12">
            <PatientAppointments patientId={id} canBook={!archived} />
            <ContactSection patient={patient} archived={archived} />
            {patient.onlineAccount && <OnlineAccountSection patientId={id} account={patient.onlineAccount} canUnlink={isAdmin} />}
            <RecordDetails patient={patient} canArchive={isAdmin && !archived} />
            {isAdmin && <PatientHistory patientId={id} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- At a glance -------------------------------------------------------------------------

function AtAGlance({ patient, archived }: { patient: Patient; archived: boolean }) {
  const { query, next, lastVisit } = usePatientAppointmentSummary(patient.id)
  // The appointments list is the freshest (it changes when something is booked here); the
  // record's own summary covers the moment before it has loaded.
  const loaded = query.data !== undefined
  const nextAppointment: Pick<Appointment, 'id' | 'startsAt' | 'endsAt' | 'status' | 'reason'> & { dentistText: string | null } | null = loaded
    ? next && { ...next, dentistText: next.dentist ? dentistName(next.dentist) : null }
    : patient.nextAppointment && {
        ...patient.nextAppointment,
        reason: patient.nextAppointment.reason ?? null,
        dentistText: patient.nextAppointment.dentist ? `Dr. ${patient.nextAppointment.dentist.lastName}` : null,
      }
  const lastVisitAt = loaded ? (lastVisit?.endsAt ?? null) : patient.lastVisitAt

  return (
    <div className="grid border-b border-neutral-200 @3xl:grid-cols-2 @3xl:divide-x @3xl:divide-neutral-200">
      <div className="grid gap-6 py-6 @md:grid-cols-2 @3xl:pr-8">
        <Glance label="Next appointment">
          {nextAppointment ? (
            <>
              <p className="text-lg/6 font-semibold">{formatDate(manilaDate(nextAppointment.startsAt))}</p>
              <p className="mt-1 text-neutral-700">
                {formatTimeRange(nextAppointment.startsAt, nextAppointment.endsAt)}
                {nextAppointment.dentistText && ` · ${nextAppointment.dentistText}`}
              </p>
              {nextAppointment.reason && <p className="mt-0.5 text-sm text-neutral-600">{nextAppointment.reason}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {nextAppointment.status === 'REQUESTED' && <Pill tone="solid">Request, not confirmed</Pill>}
                <GlanceLink to={`/app/appointments/${nextAppointment.id}`}>Open appointment</GlanceLink>
              </div>
            </>
          ) : (
            <>
              <p className="text-lg/6 font-semibold text-neutral-500">Nothing booked</p>
              {!archived && (
                <div className="mt-2">
                  <GlanceLink to={`/app/appointments/new?patientId=${patient.id}`}>Book appointment</GlanceLink>
                </div>
              )}
            </>
          )}
        </Glance>
        <Glance label="Last visit">
          {lastVisitAt ? (
            <>
              <p className="text-lg/6 font-semibold">{formatDate(manilaDate(lastVisitAt))}</p>
              {lastVisit?.dentist && <p className="mt-1 text-neutral-700">{dentistName(lastVisit.dentist)}</p>}
            </>
          ) : (
            <p className="text-lg/6 font-semibold text-neutral-500">No visits yet</p>
          )}
        </Glance>
      </div>

      <div className="border-t border-neutral-200 py-6 @3xl:border-t-0 @3xl:pl-8">
        <ChartGlance patientId={patient.id} summary={patient.chartSummary} />
      </div>
    </div>
  )
}

function Glance({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-neutral-600">{label}</h2>
      {children}
    </div>
  )
}

function GlanceLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold underline underline-offset-3 outline-neutral-950 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2">
      {children} <ArrowRightIcon className="size-3.5" />
    </Link>
  )
}

function ChartGlance({ patientId, summary }: { patientId: string; summary?: ChartSummary }) {
  const counted = summary ? CONDITIONS.filter((condition) => summary.counts[condition]) : []
  const latest = summary?.latest
  return (
    <Glance label="Dental chart">
      {counted.length > 0 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {counted.map((condition) => (
            <li key={condition} className="flex items-center gap-2">
              {/* The one place hue is allowed outside the chart: the condition's own colour. */}
              <span aria-hidden="true" className="size-3 rounded-full border border-neutral-950/20" style={{ backgroundColor: STATUS_COLORS[statusOf(condition)] }} />
              <span className="font-semibold tabular-nums">{summary!.counts[condition]}</span>
              <span className="text-neutral-700">{STATUS_LABELS[statusOf(condition)]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-lg/6 font-semibold text-neutral-500">Nothing charted yet</p>
      )}
      {latest && (
        <p className="mt-3 text-sm text-neutral-600">
          Latest: tooth {latest.tooth}, {STATUS_LABELS[statusOf(latest.condition)].toLowerCase()}, {formatDate(manilaDate(latest.recordedAt))} by{' '}
          {latest.recordedBy.role === 'DENTIST' ? dentistName(latest.recordedBy) : `${latest.recordedBy.firstName} ${latest.recordedBy.lastName}`}
        </p>
      )}
      <div className="mt-2">
        <GlanceLink to={`/app/patients/${patientId}/chart`}>Open the chart</GlanceLink>
      </div>
    </Glance>
  )
}

// ---- Sections ----------------------------------------------------------------------------

function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? '@md:col-span-2' : undefined}>
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  )
}

function ContactSection({ patient, archived }: { patient: Patient; archived: boolean }) {
  const link = useWorkspaceLink()
  const emergency = [patient.emergencyContactName, patient.emergencyContactPhone].filter(Boolean).join(' · ')
  const missing = [
    !patient.phone && 'phone',
    !patient.email && 'email',
    !patient.address && 'address',
    !emergency && 'emergency contact',
  ].filter(Boolean) as string[]
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} or ${missing.at(-1)}` : missing[0]
  return (
    <RecordSection
      title="Contact & emergency"
      action={
        !archived && (
          <Link to={link(`/app/patients/${patient.id}/edit`)} className="text-sm font-semibold underline underline-offset-3 hover:text-neutral-700">
            Edit
          </Link>
        )
      }
    >
      {missing.length < 4 && (
        <dl className="grid gap-x-8 gap-y-4 py-4 @md:grid-cols-2">
          {patient.phone && <Fact label="Mobile or phone"><span className="tabular-nums">{patient.phone}</span></Fact>}
          {patient.email && <Fact label="Email">{patient.email}</Fact>}
          {patient.address && <Fact label="Address" wide><span className="whitespace-pre-line">{patient.address}</span></Fact>}
          {emergency && <Fact label="Emergency contact" wide><span className="tabular-nums">{emergency}</span></Fact>}
        </dl>
      )}
      {missing.length > 0 && (
        <p className={`text-sm text-neutral-600 ${missing.length === 4 ? 'py-4' : 'border-t border-neutral-200 py-3'}`}>
          No {list} recorded.{' '}
          {!archived && (
            <Link to={link(`/app/patients/${patient.id}/edit`)} className="font-semibold text-neutral-950 underline underline-offset-3">
              Add {missing.length === 1 ? 'it' : 'them'}
            </Link>
          )}
        </p>
      )}
    </RecordSection>
  )
}

function RecordDetails({ patient, canArchive }: { patient: Patient; canArchive: boolean }) {
  const setArchived = useSetArchived(patient.id)
  const [confirming, setConfirming] = useState(false)
  return (
    <RecordSection
      title="Record"
      action={
        canArchive &&
        (confirming ? (
          <div role="group" aria-label="Confirm archiving" className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Archive this patient? The record is kept and can be restored.</span>
            <button
              type="button"
              autoFocus
              disabled={setArchived.isPending}
              onClick={() => setArchived.mutate(true, { onSuccess: () => setConfirming(false) })}
              className={`${buttonOnLight} h-8 px-3 text-sm`}
            >
              {setArchived.isPending ? 'Archiving…' : 'Archive'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${buttonOutline} h-8 px-3 text-sm`}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-sm font-semibold underline underline-offset-3 hover:text-neutral-700">
            Archive patient
          </button>
        ))
      }
    >
      {setArchived.isError && <ErrorBox className="mt-4">{errorMessage(setArchived.error)}</ErrorBox>}
      <dl className="grid gap-x-8 gap-y-4 py-4 @md:grid-cols-2 @4xl:grid-cols-4">
        <Fact label="Birth date">
          {formatDate(patient.birthDate)} <span className="text-neutral-500">({ageLabel(patient.birthDate)})</span>
        </Fact>
        <Fact label="Privacy consent">
          {patient.privacyConsentAt ? `Given ${formatDate(manilaDate(patient.privacyConsentAt))}` : <span className="text-neutral-600">Not yet given</span>}
        </Fact>
        <Fact label="Registered">{formatDateTime(patient.createdAt)}</Fact>
        <Fact label="Last changed">{formatDateTime(patient.updatedAt)}</Fact>
      </dl>
    </RecordSection>
  )
}
