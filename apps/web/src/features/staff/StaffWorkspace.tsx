import { type KeyboardEvent, useEffect, useState, useSyncExternalStore } from 'react'
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { compactInputClass } from '../../components/forms'
import { CloseIcon, PlusIcon, SearchIcon } from '../../components/icons'
import { Segmented } from '../../components/Segmented'
import { DetailBack, DetailEmpty, SplitView } from '../../components/SplitView'
import { Pill } from '../../components/Table'
import { errorMessage } from '../../lib/api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ROLE_LABELS, useStaffUser } from '../auth/authStore'
import { useStaff } from './queries'
import { AddStaffForm } from './StaffForms'
import { formatClock, initials, isLocked, signedInLine } from './staffInput'
import { TemporaryPasswordPanel } from './TemporaryPasswordPanel'
import type { StaffMember, StaffQuery, StaffSort, StaffStatus } from './types'

/** A temporary password waiting to be handed over. Lives only in this screen's memory. */
type Issued = { key: number; name: string; email: string; password: string }

/** What the open person's pane gets from the workspace. */
export type StaffContext = {
  /** Hands a new temporary password to the workspace, which shows it at the top of the pane until dismissed. */
  issue: (name: string, email: string, password: string) => void
  /** The list with its filters, for the phone's Back link. */
  listPath: string
}

const DEFAULT_SORT: StaffSort = 'name'
const SORTS: { value: string; label: string }[] = [
  { value: 'name:asc', label: 'Name, A to Z' },
  { value: 'name:desc', label: 'Name, Z to A' },
  { value: 'role:asc', label: 'Role' },
  { value: 'lastSignInAt:desc', label: 'Signed in lately' },
  { value: 'lastSignInAt:asc', label: 'Signed in longest ago' },
]

/** The list's filters, read from the address bar (so a filtered list can be bookmarked). */
function useStaffQuery() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status')
  const role = params.get('role')
  const sort = params.get('sort')
  const query: StaffQuery = {
    search: params.get('q') ?? '',
    status: status === 'deactivated' || status === 'all' ? status : 'active',
    role: role && role in ROLE_LABELS ? (role as StaffQuery['role']) : '',
    sort: sort === 'role' || sort === 'lastSignInAt' ? sort : DEFAULT_SORT,
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  }
  // Defaults are left out of the address, so the plain /app/staff stays clean.
  const filters = (merged: StaffQuery) => {
    const out = new URLSearchParams()
    if (merged.search) out.set('q', merged.search)
    if (merged.status !== 'active') out.set('status', merged.status)
    if (merged.role) out.set('role', merged.role)
    if (merged.sort !== DEFAULT_SORT || merged.dir !== 'asc') {
      out.set('sort', merged.sort)
      out.set('dir', merged.dir)
    }
    return out
  }
  function change(next: Partial<StaffQuery>) {
    const out = filters({ ...query, ...next })
    if (params.get('add') === '1') out.set('add', '1')
    setParams(out, { replace: true })
  }
  const filterString = filters(query).toString()
  return { query, change, adding: params.get('add') === '1', filterString: filterString ? `?${filterString}` : '' }
}

const WIDE = '(min-width: 1024px)'
function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
/** True when the list and the pane sit side by side (SplitView's 1024px). */
function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true)
}

/** Moves between rows with the up and down arrows, like a mail app. */
function moveWithArrows(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[data-row]')]
  if (links.length === 0) return
  event.preventDefault()
  const at = links.findIndex((link) => link === document.activeElement || link.getAttribute('aria-current') === 'page')
  const next = links[Math.min(links.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))]
  next.focus()
  next.click()
}

function emptyMessage(query: StaffQuery) {
  if (query.search) return { title: `No one matches “${query.search}”`, body: 'Check the spelling, or search by email instead.' }
  if (query.role) {
    const who = ROLE_LABELS[query.role].toLowerCase()
    return { title: `No ${query.status === 'all' ? '' : `${query.status} `}${who}s`.replace('  ', ' '), body: 'Try another role or status.' }
  }
  if (query.status === 'deactivated') return { title: 'No deactivated staff', body: 'Everyone you’ve added can sign in.' }
  if (query.status === 'active') return { title: 'No active staff', body: 'Add someone so they can sign in, or look under Deactivated.' }
  return { title: 'No staff yet', body: 'Add the first person so they can sign in.' }
}

/** The account's notable states, as pills. A normal active account has none. */
export function StatusPills({ member }: { member: StaffMember }) {
  if (!member.isActive) return <Pill tone="muted">Deactivated</Pill>
  return (
    <>
      {isLocked(member) && <Pill tone="outline">Locked until {formatClock(member.lockedUntil!)}</Pill>}
      {member.mustChangePassword && <Pill tone="outline">Must set a password</Pill>}
    </>
  )
}

/** Staff accounts as a workspace: the people on the left, the one you're managing on the right. Admins only. */
export default function StaffWorkspace() {
  useDocumentTitle('Staff')
  const me = useStaffUser()
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const wide = useWide()
  const { query, change, adding, filterString } = useStaffQuery()
  const { data, isPending, isError, isPlaceholderData, error, refetch } = useStaff(query)
  // Temporary passwords not yet handed over. Several can wait at once (an add, then a reset).
  const [issued, setIssued] = useState<Issued[]>([])
  const [nextKey, setNextKey] = useState(0)

  // The search box types freely; the address bar and the request follow a moment later.
  const [typed, setTyped] = useState(query.search)
  useEffect(() => {
    if (typed.trim() === query.search) return
    const timer = setTimeout(() => change({ search: typed.trim() }), 250)
    return () => clearTimeout(timer)
  })

  function issue(name: string, email: string, password: string) {
    setIssued((list) => [...list, { key: nextKey, name, email, password }])
    setNextKey((key) => key + 1)
  }
  // Dismissing removes the password from memory for good. Leaving the screen does too.
  const dismiss = (key: number) => setIssued((list) => list.filter((item) => item.key !== key))

  const listPath = `/app/staff${filterString}`
  const addPath = `/app/staff${filterString ? `${filterString}&add=1` : '?add=1'}`
  const filtered = Boolean(query.search || query.role || query.status !== 'active')
  function clearFilters() {
    setTyped('')
    change({ search: '', role: '', status: 'active' })
  }

  const items = data?.items ?? []
  const empty = emptyMessage(query)
  const passwords = issued.map((item) => (
    <TemporaryPasswordPanel key={item.key} name={item.name} email={item.email} password={item.password} onDismiss={() => dismiss(item.key)} />
  ))
  // On phones the list is shown on its own, so a password still to hand over sits above it.
  const passwordsInList = !wide && !id && !adding && issued.length > 0

  const list = (
    <>
      <header className="shrink-0 border-b border-neutral-200 px-5 pt-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-baseline gap-2.5 text-2xl font-bold tracking-[-0.02em]">
            Staff
            {data && <span className="text-base font-normal text-neutral-500 tabular-nums">{items.length}</span>}
          </h1>
          <Link to={addPath} aria-current={adding ? 'page' : undefined} className={`${buttonOnLight} h-9 px-3.5 text-sm`}>
            <PlusIcon className="size-4" /> Add
          </Link>
        </div>
        <div className="mt-4 flex flex-col gap-2.5" role="search">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="search"
              aria-label="Search staff by name or email"
              placeholder="Search name or email"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className={`${compactInputClass} w-full pl-9`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<StaffStatus>
              label="Show"
              value={query.status}
              onChange={(status) => change({ status })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'deactivated', label: 'Deactivated' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Filter by role" value={query.role} onChange={(event) => change({ role: event.target.value as StaffQuery['role'] })} className={`${compactInputClass} min-w-0 pr-8`}>
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort"
              value={`${query.sort}:${query.dir}`}
              onChange={(event) => {
                const [sort, dir] = event.target.value.split(':') as [StaffSort, 'asc' | 'desc']
                change({ sort, dir })
              }}
              className={`${compactInputClass} min-w-0 pr-8`}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {filtered && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-sm font-medium text-neutral-600 underline underline-offset-3 outline-neutral-950 hover:text-neutral-950 focus-visible:outline-2">
              <CloseIcon className="size-3.5" /> Clear filters
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {passwordsInList && <div className="flex flex-col gap-4 p-5">{passwords}</div>}
        {isError ? (
          <div className="flex flex-col items-start gap-3 p-5">
            <ErrorBox className="w-full">{errorMessage(error)}</ErrorBox>
            <button type="button" onClick={() => void refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        ) : isPending ? (
          <div aria-busy="true" aria-label="Loading staff">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-neutral-200 px-5 py-3.5">
                <div className="size-9 shrink-0 rounded-full bg-neutral-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-36 rounded bg-neutral-100" />
                  <div className="h-3.5 w-48 rounded bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-8">
            <p className="font-semibold">{empty.title}</p>
            <p className="mt-1 text-sm text-neutral-600">{empty.body}</p>
            {filtered && (
              <button type="button" onClick={clearFilters} className={`${buttonOutline} mt-4 h-9 px-3.5 text-sm`}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul aria-label="Staff accounts" aria-busy={isPlaceholderData} onKeyDown={moveWithArrows} className={`transition-opacity duration-150 ${isPlaceholderData ? 'opacity-50' : ''}`}>
            {items.map((member) => (
              <StaffRow key={member.id} member={member} isSelf={member.id === me.id} selected={member.id === id} to={`/app/staff/${member.id}${filterString}`} />
            ))}
          </ul>
        )}
      </div>
    </>
  )

  const context: StaffContext = { issue, listPath }

  return (
    <SplitView
      listLabel="Staff"
      list={list}
      showingDetail={Boolean(id) || adding}
      detail={
        <>
          {issued.length > 0 && !passwordsInList && <div className="flex flex-col gap-4 px-6 pt-6 lg:px-10">{passwords}</div>}
          {adding ? (
            <div className="max-w-3xl px-6 py-6 lg:px-10 lg:py-8">
              <DetailBack to={listPath} label="Staff" />
              <AddStaffForm
                onCancel={() => void navigate(listPath, { replace: true })}
                onCreated={(result) => {
                  issue(result.name, result.email, result.password)
                  // Open the new person, with their password at the top of the pane.
                  void navigate(`/app/staff/${result.id}${filterString}`, { replace: true })
                }}
              />
            </div>
          ) : id ? (
            <Outlet context={context} />
          ) : (
            <DetailEmpty
              title="Choose someone to manage"
              text="Their details, password and access open here. Add staff to give someone a sign-in."
              action={
                <Link to={addPath} className={`${buttonOutline} h-10 px-4 text-sm`}>
                  <PlusIcon className="size-4" /> Add staff
                </Link>
              }
            />
          )}
        </>
      }
    />
  )
}

function StaffRow({ member, isSelf, selected, to }: { member: StaffMember; isSelf: boolean; selected: boolean; to: string }) {
  return (
    <li className="border-b border-neutral-200">
      <Link
        to={to}
        data-row
        aria-current={selected ? 'page' : undefined}
        className={`flex items-center gap-3 px-5 py-3 outline-neutral-950 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 ${
          selected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
        }`}
      >
        <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${selected ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-700'} ${member.isActive ? '' : 'opacity-60'}`}>
          {initials(member)}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${selected ? 'font-bold' : 'font-semibold'} ${member.isActive ? '' : 'text-neutral-600'}`}>
            {member.firstName} {member.lastName}
            {isSelf && <span className="font-normal text-neutral-500"> (you)</span>}
          </span>
          <span className="block truncate text-sm text-neutral-600">
            {ROLE_LABELS[member.role]} · {signedInLine(member.lastSignInAt)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusPills member={member} />
        </span>
      </Link>
    </li>
  )
}
