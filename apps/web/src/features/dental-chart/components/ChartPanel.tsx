import { type FormEvent, useState } from 'react'
import { buttonOnLight, buttonOutline } from '../../../components/buttons'
import { ErrorBox } from '../../../components/ErrorBox'
import { FormField } from '../../../components/FormField'
import { fieldAria, textareaClass } from '../../../components/forms'
import { ApiError, errorMessage } from '../../../lib/api'
import { formatDate, formatTimeRange, manilaDate, todayInManila } from '../../../lib/format'
import { usePatientAppointments } from '../../appointments/queries'
import { type Chart, type ChartRecord, recordedByName as byWhom, useCorrectEntry, useRecordFinding } from '../api'
import { FDI_CODES, type FdiCode, toothName } from '../model/fdi'
import { Swatch } from './Swatch'
import {
  type Condition,
  CONDITIONS,
  HAS_SURFACES,
  STATUS_LABELS,
  statusOf,
  type Surface,
  SURFACE_LABELS,
  SURFACES,
  surfaceList,
} from '../model/status'

type Props = {
  patientId: string
  chart: Chart
  selected: FdiCode | null
  onSelect: (code: FdiCode | null) => void
  /** Dentists and admins write in the chart; everyone else reads it. */
  canWrite: boolean
  archived: boolean
}

const conditionLabel = (condition: Condition) => STATUS_LABELS[statusOf(condition)]

/** The panel beside the chart: the whole mouth at a glance, or one tooth's story. */
export function ChartPanel(props: Props) {
  return (
    <aside aria-label={props.selected ? `Tooth ${props.selected}` : 'Chart summary'} className="flex min-h-0 flex-col bg-white lg:w-[26rem] lg:shrink-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {props.selected ? <ToothView key={props.selected} {...props} tooth={props.selected} /> : <Summary {...props} />}
      </div>
    </aside>
  )
}

function Summary({ chart, onSelect }: Props) {
  const counts = new Map<Condition, number>()
  for (const now of Object.values(chart.teeth)) counts.set(now.condition, (counts.get(now.condition) ?? 0) + 1)
  const unrecorded = FDI_CODES.length - Object.keys(chart.teeth).length
  const recent = chart.records.slice(0, 8)

  return (
    <>
      <h2 className="text-xl font-bold tracking-[-0.02em]">Chart</h2>
      <p className="mt-1 text-sm text-neutral-600">Pick a tooth on the model, or by its number below the model, to see its history.</p>

      <section className="mt-6">
        <h3 className="text-sm font-semibold">Teeth now</h3>
        <ul className="mt-2 border-t border-neutral-950 text-sm">
          {CONDITIONS.filter((condition) => counts.has(condition)).map((condition) => (
            <li key={condition} className="flex items-center gap-2.5 border-b border-neutral-200 py-2">
              <Swatch condition={condition} />
              <span className="flex-1">{conditionLabel(condition)}</span>
              <span className="tabular-nums text-neutral-600">{counts.get(condition)}</span>
            </li>
          ))}
          <li className="flex items-center gap-2.5 border-b border-neutral-200 py-2 text-neutral-600">
            <Swatch condition={null} />
            <span className="flex-1">Nothing recorded</span>
            <span className="tabular-nums">{unrecorded}</span>
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h3 className="text-sm font-semibold">Latest entries</h3>
        {recent.length === 0 ? (
          <p className="mt-2 border-t border-neutral-950 py-3 text-sm text-neutral-600">Nothing has been charted for this patient yet.</p>
        ) : (
          <ol className="mt-2 border-t border-neutral-950 text-sm">
            {recent.map((record) => (
              <li key={record.id} className="border-b border-neutral-200">
                <button
                  type="button"
                  onClick={() => onSelect(record.tooth)}
                  className="flex w-full items-center gap-2.5 px-1 py-2 text-left outline-neutral-950 hover:bg-neutral-50 focus-visible:outline-2"
                >
                  <span className="w-6 font-semibold tabular-nums">{record.tooth}</span>
                  <Swatch condition={record.condition} />
                  <span className={`min-w-0 flex-1 truncate ${record.correctedBy ? 'text-neutral-500 line-through' : ''}`}>
                    {record.condition ? conditionLabel(record.condition) : 'Entry withdrawn'}
                    {record.correctsId && <span className="text-neutral-500"> (correction)</span>}
                  </span>
                  <span className="text-neutral-500">{formatDate(manilaDate(record.recordedAt))}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

function ToothView({ patientId, chart, tooth, onSelect, canWrite, archived }: Props & { tooth: FdiCode }) {
  const now = chart.teeth[tooth]
  const records = chart.records.filter((record) => record.tooth === tooth)
  const latest = now ? records.find((record) => record.id === now.recordId) : undefined

  return (
    <>
      <button type="button" onClick={() => onSelect(null)} className="text-sm font-medium text-neutral-600 underline-offset-3 hover:text-neutral-950 hover:underline">
        Whole chart
      </button>
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em] tabular-nums">{tooth}</h2>
      <p className="text-neutral-600">{toothName(tooth)}</p>

      <div className="mt-5 rounded-md bg-neutral-100 px-4 py-3">
        {now ? (
          <>
            <p className="flex items-center gap-2.5 font-semibold">
              <Swatch condition={now.condition} />
              {conditionLabel(now.condition)}
              {now.surfaces.length > 0 && <span className="font-normal text-neutral-600">· {surfaceList(now.surfaces)}</span>}
            </p>
            {latest && (
              <p className="mt-0.5 text-sm text-neutral-600">
                Since {formatDate(manilaDate(now.recordedAt))}, {byWhom(latest)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-600">Nothing recorded for this tooth yet.</p>
        )}
      </div>

      {archived ? (
        <p className="mt-6 text-sm text-neutral-600">This patient is archived, so the chart can be read but not written in.</p>
      ) : canWrite ? (
        <FindingForm patientId={patientId} tooth={tooth} />
      ) : (
        <p className="mt-6 text-sm text-neutral-600">Only dentists and admins can record findings.</p>
      )}

      <section className="mt-8">
        <h3 className="text-sm font-semibold">History</h3>
        {records.length === 0 ? (
          <p className="mt-2 border-t border-neutral-950 py-3 text-sm text-neutral-600">No entries yet.</p>
        ) : (
          <ol className="mt-2 border-t border-neutral-950">
            {records.map((record) => (
              <HistoryEntry key={record.id} patientId={patientId} record={record} canCorrect={canWrite && !archived} />
            ))}
          </ol>
        )}
      </section>
    </>
  )
}

/** Which condition and surfaces, shared by a new finding and a correction. */
function ConditionFields({
  name,
  condition,
  onCondition,
  surfaces,
  onSurfaces,
  allowWithdraw = false,
}: {
  name: string
  condition: Condition | 'WITHDRAW' | null
  onCondition: (condition: Condition | 'WITHDRAW') => void
  surfaces: Surface[]
  onSurfaces: (surfaces: Surface[]) => void
  allowWithdraw?: boolean
}) {
  const options: (Condition | 'WITHDRAW')[] = allowWithdraw ? [...CONDITIONS, 'WITHDRAW'] : CONDITIONS
  return (
    <>
      <fieldset>
        <legend className="text-sm font-semibold">{allowWithdraw ? 'What it should say' : 'Finding'}</legend>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {options.map((option) => (
            <label
              key={option}
              className={`flex h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-neutral-950 ${
                condition === option ? 'border-neutral-950 bg-neutral-50 font-semibold' : 'border-neutral-300 hover:border-neutral-950'
              } ${option === 'WITHDRAW' ? 'col-span-2' : ''}`}
            >
              <input type="radio" name={name} value={option} checked={condition === option} onChange={() => onCondition(option)} className="sr-only" />
              <Swatch condition={option === 'WITHDRAW' ? null : option} />
              {option === 'WITHDRAW' ? 'Withdraw this entry (nothing in its place)' : conditionLabel(option)}
            </label>
          ))}
        </div>
      </fieldset>

      {condition !== null && condition !== 'WITHDRAW' && HAS_SURFACES.has(condition) && (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Surfaces</legend>
          <p className="text-sm text-neutral-600">Optional. Which sides of the tooth.</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {SURFACES.map((surface) => (
              <label key={surface} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={surfaces.includes(surface)}
                  onChange={(event) => onSurfaces(event.target.checked ? [...surfaces, surface] : surfaces.filter((item) => item !== surface))}
                  className="size-4 accent-neutral-950"
                />
                {SURFACE_LABELS[surface]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  )
}

/** The API's own reason for a refused entry, which is written for people. */
function refusal(error: unknown) {
  const messages = error instanceof ApiError ? (error.details as { message?: unknown } | undefined)?.message : undefined
  if (error instanceof ApiError && error.status === 400 && Array.isArray(messages) && typeof messages[0] === 'string') {
    const text = messages[0].split(': ').slice(1).join(': ')
    if (/^[A-Z]/.test(text)) return `${text}.`
  }
  return errorMessage(error)
}

function FindingForm({ patientId, tooth }: { patientId: string; tooth: FdiCode }) {
  const record = useRecordFinding(patientId)
  const [condition, setCondition] = useState<Condition | null>(null)
  const [surfaces, setSurfaces] = useState<Surface[]>([])
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  // A finding made during today's appointment is linked to it, so the visit shows what was done.
  const appointments = usePatientAppointments(patientId)
  const today = todayInManila()
  const visit = appointments.data?.items.find((item) => item.status === 'CONFIRMED' && manilaDate(item.startsAt) === today)
  const [linkVisit, setLinkVisit] = useState(true)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaved(null)
    if (!condition) return setMissing(true)
    setMissing(false)
    try {
      const entry = await record.mutateAsync({
        tooth,
        condition,
        surfaces: HAS_SURFACES.has(condition) ? surfaces : [],
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(visit && linkVisit ? { appointmentId: visit.id } : {}),
      })
      setSaved(`Saved: ${tooth} ${conditionLabel(entry.condition!).toLowerCase()}.`)
      setCondition(null)
      setSurfaces([])
      setNote('')
    } catch {
      // Shown from record.error below.
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-6 border-t border-neutral-950 pt-4">
      <h3 className="font-semibold">Record a finding</h3>
      {record.isError && <ErrorBox className="mt-3">{refusal(record.error)}</ErrorBox>}
      {missing && <ErrorBox className="mt-3">Choose what you found on this tooth.</ErrorBox>}
      <div className="mt-3">
        <ConditionFields name={`finding-${tooth}`} condition={condition} onCondition={(value) => value !== 'WITHDRAW' && setCondition(value)} surfaces={surfaces} onSurfaces={setSurfaces} />
      </div>
      <FormField id="finding-note" label="Note" hint="Optional. For example: Sensitive to cold." className="mt-4">
        <textarea id="finding-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} className={`${textareaClass} min-h-20`} {...fieldAria('finding-note', undefined, 'hint')} />
      </FormField>
      {visit && (
        <label className="mt-4 flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={linkVisit} onChange={(event) => setLinkVisit(event.target.checked)} className="mt-0.5 size-4 accent-neutral-950" />
          <span>Part of today’s visit, {formatTimeRange(visit.startsAt, visit.endsAt)}</span>
        </label>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={record.isPending} className={`${buttonOnLight} h-10 px-5 text-sm`}>
          {record.isPending ? 'Saving…' : 'Save finding'}
        </button>
        <p role="status" className="text-sm font-medium">
          {saved}
        </p>
      </div>
    </form>
  )
}

function HistoryEntry({ patientId, record, canCorrect }: { patientId: string; record: ChartRecord; canCorrect: boolean }) {
  const [correcting, setCorrecting] = useState(false)
  const wrong = record.correctedBy !== null
  return (
    <li className="border-b border-neutral-200 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className={`flex min-w-0 items-center gap-2.5 font-semibold ${wrong ? 'text-neutral-500 line-through decoration-1' : ''}`}>
          <Swatch condition={record.condition} />
          <span>
            {record.condition ? conditionLabel(record.condition) : 'Entry withdrawn'}
            {record.surfaces.length > 0 && <span className="font-normal"> · {surfaceList(record.surfaces)}</span>}
          </span>
        </p>
        <time dateTime={record.recordedAt} className="shrink-0 text-neutral-500">
          {formatDate(manilaDate(record.recordedAt))}
        </time>
      </div>
      {record.note && <p className={`mt-1 whitespace-pre-line ${wrong ? 'text-neutral-500 line-through decoration-1' : 'text-neutral-800'}`}>{record.note}</p>}
      {record.correctsId && (
        <p className="mt-1">
          <span className="font-semibold">Correction:</span> {record.correctionReason}
        </p>
      )}
      <p className="mt-1 text-neutral-500">
        {byWhom(record)}
        {record.correctsId && `, on ${formatDate(manilaDate(record.createdAt))}`}
        {record.appointment && `, at the visit on ${formatDate(manilaDate(record.appointment.startsAt))}`}
        {wrong && '. Corrected: see the entry above.'}
      </p>
      {canCorrect && !wrong && !correcting && (
        <button type="button" onClick={() => setCorrecting(true)} className="mt-1.5 text-sm font-medium text-neutral-700 underline underline-offset-3 hover:text-neutral-950">
          Correct this entry…
        </button>
      )}
      {correcting && <CorrectionForm patientId={patientId} record={record} onDone={() => setCorrecting(false)} />}
    </li>
  )
}

/** Fixes a wrong entry: a new entry that takes its place, with the reason. The wrong one stays, struck through. */
function CorrectionForm({ patientId, record, onDone }: { patientId: string; record: ChartRecord; onDone: () => void }) {
  const correct = useCorrectEntry(patientId)
  const [condition, setCondition] = useState<Condition | 'WITHDRAW' | null>(null)
  const [surfaces, setSurfaces] = useState<Surface[]>([])
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const reasonId = `correction-${record.id}`

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!condition) return setProblem('Choose what the entry should say, or withdraw it.')
    if (!reason.trim()) return setProblem('Say why it’s being corrected. It stays in the record.')
    setProblem(null)
    try {
      const fixed = condition === 'WITHDRAW' ? null : condition
      await correct.mutateAsync({
        recordId: record.id,
        condition: fixed,
        surfaces: fixed && HAS_SURFACES.has(fixed) ? surfaces : [],
        reason: reason.trim(),
      })
      onDone()
    } catch {
      // Shown from correct.error below.
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-3 border-t border-neutral-300 pt-3">
      <p className="font-semibold">Correct this entry</p>
      <p className="mt-0.5 text-neutral-600">The entry stays in the history, struck through, with your reason. The correction takes its place on {formatDate(manilaDate(record.recordedAt))}.</p>
      {(problem || correct.isError) && <ErrorBox className="mt-3">{problem ?? refusal(correct.error)}</ErrorBox>}
      <div className="mt-3">
        <ConditionFields name={`correction-${record.id}-condition`} condition={condition} onCondition={setCondition} surfaces={surfaces} onSurfaces={setSurfaces} allowWithdraw />
      </div>
      <FormField id={reasonId} label="Reason" className="mt-4">
        <textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className={`${textareaClass} min-h-16`} />
      </FormField>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={correct.isPending} className={`${buttonOnLight} h-9 px-4 text-sm`}>
          {correct.isPending ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" onClick={onDone} className={`${buttonOutline} h-9 px-4 text-sm`}>
          Cancel
        </button>
      </div>
    </form>
  )
}
