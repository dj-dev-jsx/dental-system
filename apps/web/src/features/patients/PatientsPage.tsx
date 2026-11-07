import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { inputClass } from '../../components/forms'
import { AlertIcon, PlusIcon, SearchIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { ageLabel, formatDate, listName, SEX_LABELS } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { usePatients } from './queries'

/** The patient list, with search. The search and page live in the address bar, so Back works. */
export default function PatientsPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const archived = params.get('archived') === 'true'
  useDocumentTitle(archived ? 'Archived patients' : 'Patients')

  const [draft, setDraft] = useState(search)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Waits until typing pauses before searching, so each keystroke isn't its own request
  // (and its own line in the audit log).
  function changeSearch(value: string) {
    setDraft(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (value.trim()) next.set('search', value.trim())
          else next.delete('search')
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }, 300)
  }

  function goToPage(target: number) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('page', String(target))
      return next
    })
  }

  const { data, isPending, isError, error, isPlaceholderData, refetch } = usePatients({ search, page, archived })
  const first = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0
  const last = data ? Math.min(data.page * data.limit, data.total) : 0

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-[-0.02em]">{archived ? 'Archived patients' : 'Patients'}</h1>
        <Link to="/app/patients/new" className={`${buttonOnLight} h-10 px-4 text-sm`}>
          <PlusIcon className="size-4" /> Register patient
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="relative w-full max-w-md">
          <label htmlFor="patient-search" className="sr-only">
            Search patients
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" />
          <input
            id="patient-search"
            type="search"
            value={draft}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Search by name or phone"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} pl-10`}
          />
        </div>
        <Link
          to={archived ? '/app/patients' : '/app/patients?archived=true'}
          className="text-sm font-medium text-neutral-600 underline underline-offset-3 hover:text-neutral-950"
        >
          {archived ? 'Show current patients' : 'Show archived patients'}
        </Link>
      </div>

      {isError ? (
        <div className="mt-8 flex flex-wrap items-center gap-4 rounded-md bg-neutral-950 px-4 py-3 text-sm text-white" role="alert">
          <AlertIcon className="shrink-0" />
          <span className="flex-1">{errorMessage(error)}</span>
          <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-3">
            Try again
          </button>
        </div>
      ) : isPending ? (
        <SkeletonRows />
      ) : data.total === 0 ? (
        <EmptyState search={search} archived={archived} />
      ) : (
        <>
          <table className={`mt-8 w-full text-left transition-opacity ${isPlaceholderData ? 'opacity-50' : ''}`} aria-busy={isPlaceholderData}>
            <thead className="border-b border-neutral-950 text-sm text-neutral-600">
              <tr>
                <th scope="col" className="py-2.5 pr-4 font-medium">Name</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Birth date</th>
                <th scope="col" className="hidden py-2.5 pr-4 font-medium md:table-cell">Sex</th>
                <th scope="col" className="hidden py-2.5 font-medium sm:table-cell">Mobile or phone</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((patient) => (
                <tr key={patient.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                  <td className="py-3 pr-4">
                    <Link to={`/app/patients/${patient.id}`} className="font-semibold hover:underline hover:underline-offset-3">
                      {listName(patient)}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-neutral-700">
                    {formatDate(patient.birthDate)}
                    <span className="block text-sm text-neutral-500 sm:inline sm:before:content-['_·_']">{ageLabel(patient.birthDate)}</span>
                  </td>
                  <td className="hidden py-3 pr-4 text-neutral-700 md:table-cell">
                    {patient.sex ? SEX_LABELS[patient.sex] : <span className="text-neutral-500">Not recorded</span>}
                  </td>
                  <td className="hidden py-3 text-neutral-700 tabular-nums sm:table-cell">
                    {patient.phone ?? <span className="text-neutral-500">Not recorded</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-neutral-600 tabular-nums">
              Showing {first}–{last} of {data.total}
            </p>
            {data.total > data.limit && (
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)} className={`${buttonOutline} h-9 px-3 disabled:cursor-not-allowed`}>
                  Previous
                </button>
                <button type="button" disabled={last >= data.total} onClick={() => goToPage(page + 1)} className={`${buttonOutline} h-9 px-3 disabled:cursor-not-allowed`}>
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="mt-8 border-t border-neutral-950" aria-busy="true" aria-label="Loading patients">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-8 border-b border-neutral-200 py-4">
          <div className="h-4 w-48 rounded bg-neutral-100" />
          <div className="h-4 w-28 rounded bg-neutral-100" />
          <div className="hidden h-4 w-32 rounded bg-neutral-100 sm:block" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ search, archived }: { search: string; archived: boolean }) {
  let title = 'No patients yet'
  let text = 'Register your first patient to start their record.'
  if (search) {
    title = `No patients match “${search}”`
    text = 'Check the spelling, or try part of the name or the mobile number.'
  } else if (archived) {
    title = 'No archived patients'
    text = 'Patients an admin archives appear here, and can be restored.'
  }
  return (
    <div className="mt-8 border-t border-neutral-950 py-12">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-neutral-600">{text}</p>
      {!search && !archived && (
        <Link to="/app/patients/new" className={`${buttonOnLight} mt-6 h-10 px-4 text-sm`}>
          <PlusIcon className="size-4" /> Register patient
        </Link>
      )}
    </div>
  )
}
