import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, type Ref, useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { Pill } from '../../components/Table'
import { ageLabel, formatDate, formatDateTime, fullName, listName } from '../../lib/format'
import { type ChosenPatient, PatientPicker } from '../appointments/PatientPicker'
import type { Requester } from '../appointments/types'
import { errorCode, onlineErrorMessage } from './errors'
import { useAccountMatches, useCreatePatientFromAccount, useLinkAccount, usePatientAccount } from './queries'
import type { AccountMatch, MatchReason } from './types'

const REASONS: Record<MatchReason, string> = {
  BIRTH_DATE_AND_NAME: 'same birth date and last name',
  PHONE: 'same mobile number',
  EMAIL: 'same email',
}

/** "Same birth date and last name, and same mobile number" */
function reasonsText(reasons: MatchReason[]) {
  const words = reasons.map((reason) => REASONS[reason])
  const text = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** What staff are about to do, asked inline before it is sent. */
type Step = { kind: 'link'; patient: ChosenPatient } | { kind: 'register' } | null

type Props = {
  requester: Requester
  /** Called once the request shows its patient, with the record's name. */
  onLinked: (text: string) => void
  headingRef?: Ref<HTMLHeadingElement>
}

/**
 * The step before confirming an online request from someone who isn't tied to a patient record:
 * what they typed, the existing patients who might be them and why, then "This is them" or
 * "Register as new patient". Never automatic: linking lets the person see that patient's
 * appointments online, so staff check who they are first.
 */
export function WhoIsThis({ requester, onLinked, headingRef }: Props) {
  const account = usePatientAccount(requester.accountId)
  const matches = useAccountMatches(requester.accountId)
  const queryClient = useQueryClient()
  const link = useLinkAccount()
  const register = useCreatePatientFromAccount()
  const [step, setStep] = useState<Step>(null)
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<ChosenPatient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = `${requester.firstName} ${requester.lastName}`
  const busy = link.isPending || register.isPending
  const verifiedAt = account.data?.emailVerifiedAt

  function start(next: Step) {
    setError(null)
    setStep(next)
  }

  async function send() {
    if (!step) return
    setError(null)
    try {
      if (step.kind === 'link') {
        await link.mutateAsync({ accountId: requester.accountId, patientId: step.patient.id })
        onLinked(`Linked to the record of ${step.patient.name}.`)
      } else {
        await register.mutateAsync(requester.accountId)
        onLinked(`Registered ${name} as a new patient and linked their online account.`)
      }
    } catch (caught) {
      setError(onlineErrorMessage(caught))
      // Someone else may have linked it meanwhile: show the request as it is now.
      if (errorCode(caught) === 'ALREADY_LINKED') void queryClient.invalidateQueries({ queryKey: ['appointments'] })
      if (errorCode(caught) === 'PATIENT_HAS_ACCOUNT') void matches.refetch()
    }
  }

  const items = matches.data?.items ?? []

  return (
    <section aria-labelledby="who-is-this" className="mt-10">
      <h2 id="who-is-this" ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
        Who is this?
      </h2>
      <p className="mt-1 max-w-prose text-sm/6 text-neutral-600">
        Booked online by someone who isn’t linked to a patient record yet. Link them to their record, or register them as a new patient, before you confirm.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-neutral-600">What they gave when signing up</h3>
      <dl className="mt-2 border-t border-neutral-950">
        <Fact label="Name">{name}</Fact>
        <Fact label="Birth date">
          {formatDate(requester.birthDate)} <span className="text-neutral-500">({ageLabel(requester.birthDate)})</span>
        </Fact>
        <Fact label="Mobile">
          <span className="tabular-nums">{requester.phone}</span>
        </Fact>
        <Fact label="Email">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-all">{requester.email}</span>
            {account.data && (verifiedAt ? <Pill tone="muted">Confirmed</Pill> : <Pill tone="outline">Not confirmed</Pill>)}
          </span>
        </Fact>
        {account.data && (
          <Fact label="Signed up">
            {formatDateTime(account.data.createdAt)}
            {verifiedAt && <span className="text-neutral-500"> · email confirmed {formatDateTime(verifiedAt)}</span>}
          </Fact>
        )}
      </dl>

      <h3 className="mt-8 text-sm font-semibold text-neutral-600">
        Patients who might be them
        {matches.data && items.length > 0 && <span className="font-normal text-neutral-500"> · {items.length}</span>}
      </h3>
      <div className="mt-2 border-t border-neutral-950" aria-live="polite">
        {matches.isPending ? (
          <div className="space-y-2 border-b border-neutral-200 py-4" aria-busy="true" aria-label="Looking for matching patients">
            <div className="h-4 w-48 rounded bg-neutral-100" />
            <div className="h-3.5 w-72 max-w-full rounded bg-neutral-100" />
          </div>
        ) : matches.isError ? (
          <div className="flex flex-wrap items-center gap-3 py-4">
            <ErrorBox className="flex-1">{onlineErrorMessage(matches.error)}</ErrorBox>
            <button type="button" onClick={() => void matches.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="border-b border-neutral-200 py-4 text-sm text-neutral-600">
            No current patient has the same birth date and last name, mobile number or email. If they’ve been here before, find their record below.
          </p>
        ) : (
          <ul aria-label="Patients who might be them">
            {items.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                asking={step?.kind === 'link' && step.patient.id === match.id}
                disabled={busy}
                onChoose={() => start({ kind: 'link', patient: { id: match.id, name: fullName(match), detail: '' } })}
              >
                {step?.kind === 'link' && step.patient.id === match.id && (
                  <LinkQuestion who={name} email={requester.email} patient={step.patient.name} busy={link.isPending} error={error} onSend={() => void send()} onCancel={() => start(null)} />
                )}
              </MatchRow>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 grid gap-6 @2xl:grid-cols-2 @2xl:gap-10">
        <div>
          <h3 className="font-semibold">Someone else?</h3>
          {searching ? (
            <div className="mt-3">
              <PatientPicker
                chosen={found}
                onChoose={(patient) => {
                  setFound(patient)
                  start(patient ? { kind: 'link', patient } : null)
                }}
              />
              {found && step?.kind === 'link' && step.patient.id === found.id && (
                <LinkQuestion who={name} email={requester.email} patient={found.name} busy={link.isPending} error={error} onSend={() => void send()} onCancel={() => start(null)} />
              )}
              {found && step === null && (
                <button type="button" onClick={() => start({ kind: 'link', patient: found })} className={`${buttonOutline} mt-3 h-9 px-4 text-sm`}>
                  This is them…
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-neutral-600">Find their record by name or mobile number.</p>
              <button type="button" disabled={busy} onClick={() => setSearching(true)} className={`${buttonOutline} mt-3 h-9 px-4 text-sm`}>
                Find their record
              </button>
            </>
          )}
        </div>

        <div>
          <h3 className="font-semibold">Not a patient yet?</h3>
          {step?.kind === 'register' ? (
            <div role="group" aria-label="Register as a new patient" className="mt-3 rounded-md bg-neutral-100 px-4 py-3.5 text-sm/6">
              <p className="font-semibold">Register {name} as a new patient?</p>
              <p className="mt-1 text-neutral-700">
                A new record is made from what they gave above, with their privacy consent from signing up, and linked to their online account. Add the rest of their details at their visit.
              </p>
              {error && <ErrorBox className="mt-3">{error}</ErrorBox>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" autoFocus disabled={busy} onClick={() => void send()} className={`${buttonOnLight} h-9 px-4 text-sm`}>
                  {register.isPending ? 'Registering…' : 'Register and link'}
                </button>
                <button type="button" disabled={busy} onClick={() => start(null)} className={`${buttonOutline} h-9 px-4 text-sm`}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-neutral-600">Make a new record from the details they gave.</p>
              <button type="button" disabled={busy} onClick={() => start({ kind: 'register' })} className={`${buttonOutline} mt-3 h-9 px-4 text-sm`}>
                Register as new patient…
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-200 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

type MatchRowProps = { match: AccountMatch; asking: boolean; disabled: boolean; onChoose: () => void; children?: ReactNode }

/** One possible match, with why it matched. A value that matched is in bold. */
function MatchRow({ match, asking, disabled, onChoose, children }: MatchRowProps) {
  const on = (reason: MatchReason) => match.matchedOn.includes(reason)
  const strong = (yes: boolean, text: string) => (yes ? <span className="font-semibold text-neutral-950">{text}</span> : text)
  return (
    <li className="border-b border-neutral-200 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/app/patients/${match.id}`}
              target="_blank"
              rel="noopener"
              className="font-semibold underline-offset-3 outline-neutral-950 hover:underline focus-visible:outline-2"
            >
              {listName(match)}
              <span className="sr-only"> (opens the record in a new tab)</span>
            </Link>
            {match.hasOnlineAccount && <Pill tone="muted">Has another online account</Pill>}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600">
            {strong(on('BIRTH_DATE_AND_NAME'), `Born ${formatDate(match.birthDate)}`)}
            {match.phone && <> · {strong(on('PHONE'), match.phone)}</>}
            {match.email && <> · {strong(on('EMAIL'), match.email)}</>}
          </p>
          <p className="mt-0.5 text-sm text-neutral-500">{reasonsText(match.matchedOn)}</p>
        </div>
        {!asking &&
          (match.hasOnlineAccount ? (
            <p className="max-w-56 text-sm text-neutral-500 sm:text-right">Can’t be linked: a patient can have only one online account.</p>
          ) : (
            <button type="button" disabled={disabled} onClick={onChoose} className={`${buttonOutline} h-9 shrink-0 px-4 text-sm`}>
              This is them…
            </button>
          ))}
      </div>
      {children}
    </li>
  )
}

type QuestionProps = { who: string; email: string; patient: string; busy: boolean; error: string | null; onSend: () => void; onCancel: () => void }

/** Asked before linking, because the link decides whose appointments this login can see. */
function LinkQuestion({ who, email, patient, busy, error, onSend, onCancel }: QuestionProps) {
  return (
    <div role="group" aria-label={`Link to the record of ${patient}`} className="mt-3 rounded-md bg-neutral-100 px-4 py-3.5 text-sm/6">
      <p className="font-semibold">Link {who}’s online account to the record of {patient}?</p>
      <p className="mt-1 text-neutral-700">
        Whoever signs in as <span className="font-medium break-all text-neutral-950">{email}</span> will see {patient}’s appointments online. Check it’s really them first:
        ask for their birth date and mobile number, or see an ID at the desk.
      </p>
      {error && <ErrorBox className="mt-3">{error}</ErrorBox>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" autoFocus disabled={busy} onClick={onSend} className={`${buttonOnLight} h-9 px-4 text-sm`}>
          {busy ? 'Linking…' : 'Link to this record'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={`${buttonOutline} h-9 px-4 text-sm`}>
          Cancel
        </button>
      </div>
    </div>
  )
}
