import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { compactInputClass, inputClass } from '../../components/forms'
import { AlertIcon, PlusIcon, SearchIcon } from '../../components/icons'
import { Segmented } from '../../components/Segmented'
import { Pill } from '../../components/Table'
import { errorMessage } from '../../lib/api'
import { addDays, ageLabel, formatDate, formatDayShort, listName, manilaDate, todayInManila } from '../../lib/format'
import { FIRST_DIRECTION, readListParams, useWorkspaceLink } from './listParams'
import { usePatientList } from './queries'
import type { PatientSort, PatientSummary } from './types'

const SORT_OPTIONS: [PatientSort, string][] = [
  ['name', 'Name'],
  ['nextAppointment', 'Next visit'],
  ['lastVisit', 'Last visit'],
]

const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

/** "Today, 9:00 AM", "Tomorrow, …" or "Next Tue, Nov 10, …", with the year only when it isn't this year. */
function when(iso: string) {
  const day = manilaDate(iso)
  const today = todayInManila()
  const date =
    day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : `Next ${day.slice(0, 4) === today.slice(0, 4) ? formatDayShort(day) : formatDate(day)}`
  return `${date}, ${TIME.format(new Date(iso))}`
}

type Props = {
  /** The patient open beside the list, if any. */
  selectedId: string | null
  /** True while a record is open. On phones that hides the list (it stays mounted). */
  hidden: boolean
}

/**
 * The left column of the patients workspace: who's here, found fast. Search, sort and the
 * Current/Archived view live in the address, so the top bar's "See all results" lands here
 * and Back works. The list scrolls on its own, so opening a record never loses your place.
 */
export function PatientList({ selectedId, hidden }: Props) {
  const [params, setParams] = useSearchParams()
  const { search, archived, sort, dir } = readListParams(params)
  const link = useWorkspaceLink()

  // What's in the box can run ahead of the address while typing pauses are awaited. When the
  // address changes from elsewhere (the top bar, Back), the box follows it.
  const [draft, setDraft] = useState(search)
  const [seen, setSeen] = useState(search)
  if (search !== seen) {
    setSeen(search)
    if (draft.trim() !== search) setDraft(search)
  }
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function update(change: (next: URLSearchParams) => void, replace = false) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('page')
        change(next)
        return next
      },
      { replace },
    )
  }

  // Waits until typing pauses before searching, so each keystroke isn't its own request
  // (and its own line in the audit log).
  function changeSearch(value: string, delay = 300) {
    setDraft(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      update((next) => {
        if (value.trim()) next.set('search', value.trim())
        else next.delete('search')
      }, true)
    }, delay)
  }

  function sortBy(column: PatientSort) {
    update((next) => {
      // The default (name, A to Z) stays out of the address.
      if (column === 'name') {
        next.delete('sort')
        next.delete('dir')
      } else {
        next.set('sort', column)
        next.set('dir', FIRST_DIRECTION[column])
      }
    })
  }

  function showArchived(value: boolean) {
    update((next) => {
      if (value) next.set('archived', 'true')
      else next.delete('archived')
    })
  }

  const query = usePatientList({ search, archived, sort, dir })
  const { data, isPending, isError, error, isPlaceholderData, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } = query
  const patients = data?.pages.flatMap((page) => page.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  // ---- Keeping your place ----
  const scroller = useRef<HTMLDivElement>(null)
  const savedScroll = useRef(0)
  // On phones the list is hidden while a record is open, which resets its scroll; put it back.
  useLayoutEffect(() => {
    if (!hidden && scroller.current) scroller.current.scrollTop = savedScroll.current
  }, [hidden])

  // A record opened from elsewhere (a link, the address bar) scrolls its row into view once.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId || scrolledTo.current === selectedId || !scroller.current) return
    const row = scroller.current.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`)
    if (!row) return
    scrolledTo.current = selectedId
    row.scrollIntoView({ block: 'nearest' })
  }, [selectedId, patients.length])

  // The next page loads by itself as the end of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = sentinel.current
    if (!target || !hasNextPage || isFetchNextPageError) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { root: scroller.current, rootMargin: '200px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

  // Up and down move between rows (Enter opens one). Moving doesn't open each record on the
  // way, because every opening is logged as a view.
  function rows() {
    return Array.from(scroller.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]') ?? [])
  }
  function onListKeyDown(event: KeyboardEvent) {
    const all = rows()
    const index = all.indexOf(document.activeElement as HTMLAnchorElement)
    if (index < 0) return
    let target: number | null = null
    if (event.key === 'ArrowDown') target = Math.min(index + 1, all.length - 1)
    else if (event.key === 'ArrowUp') target = index - 1
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = all.length - 1
    if (target === null) return
    event.preventDefault()
    if (target < 0) document.getElementById('patient-search')?.focus()
    else all[target].focus()
  }

  const Heading = selectedId ? 'h2' : 'h1'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-neutral-200 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <Heading className="text-xl font-bold tracking-[-0.02em]">
            {archived ? 'Archived' : 'Patients'}
            {data && (
              <span className="ml-2 text-base font-medium text-neutral-500 tabular-nums" aria-live="polite">
                <span className="sr-only">, </span>
                {total}
                <span className="sr-only">{search ? ` matching “${search}”` : ''}</span>
              </span>
            )}
          </Heading>
          <Link to={link('/app/patients/new')} className={`${buttonOnLight} h-8 px-3 text-sm`}>
            <PlusIcon className="size-4" /> New<span className="sr-only"> patient</span>
          </Link>
        </div>

        <div className="relative mt-4">
          <label htmlFor="patient-search" className="sr-only">
            Search patients
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" />
          <input
            id="patient-search"
            type="search"
            value={draft}
            onChange={(event) => changeSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && draft) {
                event.preventDefault()
                changeSearch('', 0)
              } else if (event.key === 'ArrowDown') {
                const first = rows()[0]
                if (first) {
                  event.preventDefault()
                  first.focus()
                }
              }
            }}
            placeholder="Name or phone"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} h-10 pl-10`}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Segmented
            label="Which patients"
            value={archived ? 'archived' : 'current'}
            onChange={(value) => showArchived(value === 'archived')}
            options={[
              { value: 'current', label: 'Current' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(event) => sortBy(event.target.value as PatientSort)} className={`${compactInputClass} pr-2 font-medium`}>
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(event) => {
          // Only while visible: hiding the list reads as a jump back to the top.
          if (event.currentTarget.clientHeight > 0) savedScroll.current = event.currentTarget.scrollTop
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {isError && !data ? (
          <div className="m-5 flex flex-wrap items-center gap-3 rounded-md bg-neutral-950 px-3.5 py-3 text-sm/6 text-white" role="alert">
            <AlertIcon className="shrink-0" />
            <span className="min-w-0 flex-1">{errorMessage(error)}</span>
            <button type="button" onClick={() => void refetch()} className="rounded-sm font-semibold underline underline-offset-3 outline-white focus-visible:outline-2">
              Try again
            </button>
          </div>
        ) : isPending ? (
          <SkeletonRows />
        ) : total === 0 ? (
          <EmptyState search={search} archived={archived} onClear={() => changeSearch('', 0)} onShowCurrent={() => showArchived(false)} newLink={link('/app/patients/new')} />
        ) : (
          <>
            <ul
              aria-label={archived ? 'Archived patients' : 'Patients'}
              aria-busy={isPlaceholderData}
              onKeyDown={onListKeyDown}
              className={`transition-opacity duration-150 ${isPlaceholderData ? 'opacity-50' : ''}`}
            >
              {patients.map((patient) => (
                <PatientRow key={patient.id} patient={patient} sort={sort} to={link(`/app/patients/${patient.id}`)} selected={patient.id === selectedId} archived={archived} />
              ))}
            </ul>
            <div ref={sentinel} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-neutral-600">
              <p className="tabular-nums">{hasNextPage ? `Showing ${patients.length} of ${total}` : total === 1 ? '1 patient' : `All ${total} patients`}</p>
              {hasNextPage && (
                <button type="button" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()} className={`${buttonOutline} h-8 px-3 text-sm`}>
                  {isFetchingNextPage ? 'Loading…' : isFetchNextPageError ? 'Try again' : 'Show more'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PatientRow({ patient, sort, to, selected, archived }: { patient: PatientSummary; sort: PatientSort; to: string; selected: boolean; archived: boolean }) {
  const next = patient.nextAppointment
  let visit: string
  if (sort === 'lastVisit') visit = patient.lastVisitAt ? `Last visit ${formatDate(manilaDate(patient.lastVisitAt))}` : 'No visits yet'
  else if (next) visit = `${when(next.startsAt)}${next.status === 'REQUESTED' ? ' · request' : ''}`
  else visit = 'No upcoming visit'

  return (
    <li>
      <Link
        to={to}
        data-row=""
        data-id={patient.id}
        aria-current={selected ? 'page' : undefined}
        className={`block border-b border-neutral-200 px-5 py-3 outline-neutral-950 transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 ${
          selected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate ${selected ? 'font-bold' : 'font-semibold'} ${archived ? 'text-neutral-600' : ''}`}>{listName(patient)}</span>
          {archived && <Pill tone="muted">Archived</Pill>}
        </span>
        <span className="mt-0.5 block truncate text-sm text-neutral-600">
          {ageLabel(patient.birthDate)}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          <span className={next || sort === 'lastVisit' ? '' : 'text-neutral-500'}>{visit}</span>
        </span>
      </Link>
    </li>
  )
}

function SkeletonRows() {
  return (
    <div aria-busy="true" aria-label="Loading patients">
      {[64, 52, 72, 48, 60, 56, 68, 44].map((width, i) => (
        <div key={i} className="border-b border-neutral-200 px-5 py-3.5">
          <div className="h-4 rounded bg-neutral-100" style={{ width: `${width}%` }} />
          <div className="mt-2 h-3.5 w-1/2 rounded bg-neutral-100" />
        </div>
      ))}
      <p className="appear-late px-5 py-4 text-sm text-neutral-500">Loading…</p>
    </div>
  )
}

type EmptyProps = { search: string; archived: boolean; onClear: () => void; onShowCurrent: () => void; newLink: string }

function EmptyState({ search, archived, onClear, onShowCurrent, newLink }: EmptyProps) {
  let title = 'No patients yet'
  let text = 'Register your first patient to start their record, then book their first visit.'
  let action = (
    <Link to={newLink} className={`${buttonOnLight} h-9 px-4 text-sm`}>
      <PlusIcon className="size-4" /> Register patient
    </Link>
  )
  if (search) {
    title = `No ${archived ? 'archived ' : ''}patients match “${search}”`
    text = 'Check the spelling, or try part of the name or the mobile number.'
    action = (
      <button type="button" onClick={onClear} className={`${buttonOutline} h-9 px-4 text-sm`}>
        Clear search
      </button>
    )
  } else if (archived) {
    title = 'No archived patients'
    text = 'Patients an admin archives are kept here and can be restored.'
    action = (
      <button type="button" onClick={onShowCurrent} className={`${buttonOutline} h-9 px-4 text-sm`}>
        Back to current patients
      </button>
    )
  }
  return (
    <div className="px-5 py-10" role="status">
      <p className="font-semibold text-balance break-words">{title}</p>
      <p className="mt-1 text-sm text-neutral-600">{text}</p>
      <div className="mt-5">{action}</div>
    </div>
  )
}
