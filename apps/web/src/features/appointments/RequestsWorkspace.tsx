import { type KeyboardEvent, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { CloseIcon } from '../../components/icons'
import { Segmented } from '../../components/Segmented'
import { DetailEmpty, SplitView } from '../../components/SplitView'
import { Pill } from '../../components/Table'
import { errorMessage } from '../../lib/api'
import { addDays, dentistName, formatDayShort, formatTimeRange, manilaDate, todayInManila } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useDeclinedRequests, useRequests } from './queries'
import { NotLinkedPill, OnlinePill } from './RequesterPills'
import { whoName } from './requester'
import type { Appointment } from './types'
import { overdueReason, queueOrder, waitingFor } from './waiting'

/** What was just done, so the request leaving the queue doesn't look like it vanished. */
export type Done = { appointment: Appointment; action: 'confirmed' | 'declined' }
export type RequestsView = 'waiting' | 'declined'

/** What the selected request's pane gets from the list beside it. */
export type RequestsContext = {
  view: RequestsView
  /** The request from the list already loaded, if it is there (fetching one is logged). */
  find: (id: string) => Appointment | undefined
  /** Called after confirming or declining: remembers what was done and opens the next request. */
  onDone: (done: Done) => void
  done: Done | null
  clearDone: () => void
  /** Where the list is, with its filters, for the phone's Back link. */
  listPath: string
  loading: boolean
}

const WIDE = '(min-width: 1024px)'
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
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

/**
 * Requests as a work queue: the list on the left, the selected request on the right. On a wide
 * screen the most urgent request opens by itself, and answering one opens the next, so the
 * receptionist can work straight down the queue.
 */
export default function RequestsWorkspace() {
  useDocumentTitle('Requests')
  const { id } = useParams<{ id?: string }>()
  const [params, setParams] = useSearchParams()
  const { search } = useLocation()
  const navigate = useNavigate()
  const wide = useWide()
  const view: RequestsView = params.get('view') === 'declined' ? 'declined' : 'waiting'

  const requests = useRequests()
  const today = todayInManila()
  // Declined requests whose day is in the last two weeks or the next four.
  const declined = useDeclinedRequests(addDays(today, -13), addDays(today, 28), view === 'declined')
  const [done, setDone] = useState<Done | null>(null)
  const [now] = useState(Date.now)

  const waiting = useMemo(() => queueOrder(requests.data?.items ?? [], now), [requests.data, now])
  const declinedItems = useMemo(() => declined.data?.items ?? [], [declined.data])
  const items = view === 'waiting' ? waiting : declinedItems
  const active = view === 'waiting' ? requests : declined
  const total = requests.data?.total
  const overdueCount = waiting.filter((r) => overdueReason(r, now)).length

  const pathTo = useCallback((requestId?: string) => `/app/requests${requestId ? `/${requestId}` : ''}${search}`, [search])

  // A wide screen never shows an empty pane while work waits: open the most urgent request.
  const first = waiting[0]?.id
  useEffect(() => {
    if (wide && !id && view === 'waiting' && first) void navigate(pathTo(first), { replace: true })
  }, [wide, id, view, first, navigate, pathTo])

  const find = useCallback(
    (requestId: string) => waiting.find((r) => r.id === requestId) ?? declinedItems.find((r) => r.id === requestId),
    [waiting, declinedItems],
  )

  const onDone = useCallback(
    (next: Done) => {
      setDone(next)
      // The list here is from before the answer: the next one is the request after it, or before it at the end.
      const at = waiting.findIndex((r) => r.id === next.appointment.id)
      const rest = waiting.filter((r) => r.id !== next.appointment.id)
      const following = rest[at === -1 ? 0 : Math.min(at, rest.length - 1)]
      void navigate(pathTo(following?.id), { replace: true, state: { answered: true } })
    },
    [waiting, navigate, pathTo],
  )

  function changeView(next: RequestsView) {
    setDone(null)
    const out = new URLSearchParams(params)
    if (next === 'declined') out.set('view', 'declined')
    else out.delete('view')
    const query = out.toString()
    // A different list: the open request belongs to the other one, so go back to the list itself.
    if (id) void navigate(`/app/requests${query ? `?${query}` : ''}`, { replace: true })
    else setParams(out, { replace: true })
  }

  const context: RequestsContext = {
    view,
    find,
    onDone,
    done,
    clearDone: () => setDone(null),
    listPath: pathTo(),
    loading: active.isPending,
  }

  const list = (
    <>
      <header className="shrink-0 border-b border-neutral-200 px-5 pt-6 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.02em]">Requests</h1>
          {total !== undefined && (
            <p className="text-sm text-neutral-600">
              {total === 0 ? 'None waiting' : `${total} waiting`}
              {overdueCount > 0 && (
                <>
                  , <span className="font-semibold text-neutral-950">{overdueCount} overdue</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="mt-4">
          <Segmented
            label="Show"
            value={view}
            onChange={changeView}
            options={[
              { value: 'waiting', label: <>Waiting{total !== undefined && <span className="font-normal tabular-nums opacity-70">{total}</span>}</> },
              { value: 'declined', label: 'Declined' },
            ]}
          />
        </div>
      </header>

      {/* On phones the pane isn't beside the list, so what was just done is said here too. */}
      {done && !id && (
        <div className="px-5 pt-4 lg:hidden">
          <DoneNotice done={done} onDismiss={() => setDone(null)} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active.isError ? (
          <div className="flex flex-col items-start gap-3 p-5">
            <ErrorBox className="w-full">{errorMessage(active.error)}</ErrorBox>
            <button type="button" onClick={() => void active.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        ) : active.isPending ? (
          <div aria-busy="true" aria-label="Loading requests">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="space-y-2 border-b border-neutral-200 px-5 py-4">
                <div className="h-4 w-40 rounded bg-neutral-100" />
                <div className="h-3.5 w-56 max-w-full rounded bg-neutral-100" />
                <div className="h-3.5 w-24 rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          view === 'waiting' ? (
            <>
              <div className="px-5 py-8 max-lg:hidden">
                <p className="font-semibold">Nothing waiting</p>
                <p className="mt-1 text-sm text-neutral-600">New requests from patients appear here.</p>
              </div>
              <div className="p-5 lg:hidden">
                <CaughtUp compact />
              </div>
            </>
          ) : (
            <div className="px-5 py-8">
              <p className="font-semibold">No declined requests</p>
              <p className="mt-1 text-sm text-neutral-600">Requests you decline show here when their day is in the last two weeks or still ahead.</p>
            </div>
          )
        ) : (
          <>
            <ul aria-label={view === 'waiting' ? 'Requests waiting for an answer' : 'Declined requests'} onKeyDown={moveWithArrows}>
              {items.map((request) => (
                <RequestRow key={request.id} request={request} to={pathTo(request.id)} selected={request.id === id} now={now} />
              ))}
            </ul>
            <p className="px-5 py-4 text-sm text-neutral-500">
              {view === 'waiting' && total !== undefined && total > items.length
                ? `Showing the first ${items.length} of ${total}. Answer these to see the rest.`
                : `${items.length} ${items.length === 1 ? 'request' : 'requests'}`}
            </p>
          </>
        )}
      </div>
    </>
  )

  return (
    <SplitView
      listLabel="Requests"
      list={list}
      showingDetail={Boolean(id)}
      detail={
        id ? (
          <Outlet context={context} />
        ) : (
          <NothingSelected view={view} done={done} onDismiss={() => setDone(null)} count={active.isPending ? null : items.length} onShowWaiting={() => changeView('waiting')} />
        )
      }
    />
  )
}

/** The right side with no request open: all caught up, or (in Declined) a hint to pick one. */
function NothingSelected({
  view,
  done,
  onDismiss,
  count,
  onShowWaiting,
}: {
  view: RequestsView
  done: Done | null
  onDismiss: () => void
  /** How many the list shows, or null while it loads. */
  count: number | null
  onShowWaiting: () => void
}) {
  // While the queue loads, or just before the most urgent request opens, the pane stays quiet.
  if (count === null || (view === 'waiting' && count > 0)) return <div className="flex-1" aria-busy="true" />
  return (
    <div className="flex flex-1 flex-col px-6 py-6 lg:px-10 lg:py-8">
      {done && <DoneNotice done={done} onDismiss={onDismiss} />}
      {view === 'waiting' ? (
        <div className={`flex flex-1 flex-col ${done ? 'mt-6' : ''}`}>
          <CaughtUp />
        </div>
      ) : (
        <DetailEmpty
          title={count > 0 ? 'Choose a declined request' : 'Nothing declined lately'}
          text={count > 0 ? 'Its details and the reason given to the patient show here.' : 'Requests still to answer are under Waiting.'}
          action={
            count === 0 && (
              <button type="button" onClick={onShowWaiting} className={`${buttonOutline} h-10 px-4 text-sm`}>
                Show waiting requests
              </button>
            )
          }
        />
      )}
    </div>
  )
}

/** The quiet photo shown when no request is waiting. */
function CaughtUp({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-neutral-950 text-white ${compact ? '' : 'flex flex-1 flex-col justify-end'}`}>
      <img
        src="/images/clinic-room-960.jpg"
        srcSet="/images/clinic-room-960.jpg 960w, /images/clinic-room-1920.jpg 1920w"
        sizes="(min-width: 1024px) 60rem, 100vw"
        alt=""
        className="absolute inset-0 size-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-linear-to-t from-neutral-950 via-neutral-950/70 to-neutral-950/10" />
      <div className={`relative px-6 sm:px-10 ${compact ? 'py-14' : 'py-12 sm:py-16'}`}>
        <h2 className="text-2xl font-bold tracking-[-0.02em]">No requests waiting</h2>
        <p className="mt-2 max-w-sm text-neutral-300">You’re all caught up. New requests from patients will appear here, and in the menu.</p>
      </div>
    </div>
  )
}

/** "Confirmed: Ana Cruz, Tue, Nov 10 at 9:00 – 9:30 AM with Dr. Jose Santos. See the day" */
export function DoneNotice({ done, onDismiss }: { done: Done; onDismiss: () => void }) {
  const { appointment, action } = done
  return (
    <div role="status" className="flex items-start gap-3 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          {action === 'confirmed' ? 'Confirmed' : 'Declined'}: {whoName(appointment)}
        </span>
        {action === 'confirmed' && (
          <>
            , {formatDayShort(manilaDate(appointment.startsAt))} at {formatTimeRange(appointment.startsAt, appointment.endsAt)}
            {appointment.dentist && ` with ${dentistName(appointment.dentist)}`}.{' '}
            <Link to={`/app/appointments?date=${manilaDate(appointment.startsAt)}`} className="font-semibold underline underline-offset-3 hover:no-underline">
              See the day
            </Link>
          </>
        )}
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 grid size-7 shrink-0 place-items-center rounded text-neutral-600 outline-neutral-950 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2">
        <CloseIcon className="size-4" />
      </button>
    </div>
  )
}

function RequestRow({ request, to, selected, now }: { request: Appointment; to: string; selected: boolean; now: number }) {
  const declined = request.status === 'DECLINED'
  const urgent = declined ? null : overdueReason(request, now)
  return (
    <li className="border-b border-neutral-200">
      <Link
        to={to}
        data-row
        aria-current={selected ? 'page' : undefined}
        className={`block px-5 py-3.5 outline-neutral-950 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 ${
          selected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
        }`}
      >
        <span className="flex items-center gap-2">
          <span className={`min-w-0 truncate ${selected ? 'font-bold' : 'font-semibold'} ${declined ? 'text-neutral-600' : ''}`}>{whoName(request)}</span>
          {urgent && <Pill tone="solid">{urgent}</Pill>}
          {declined && <Pill tone="muted">Declined</Pill>}
          {declined && request.source === 'ONLINE' && <OnlinePill />}
        </span>
        <span className="mt-0.5 block truncate text-sm text-neutral-600">
          {formatDayShort(manilaDate(request.startsAt))} · {formatTimeRange(request.startsAt, request.endsAt)} · {request.dentist ? dentistName(request.dentist) : 'Any dentist'}
        </span>
        {declined ? (
          request.statusNote && <span className="mt-1 block truncate text-sm text-neutral-500">{request.statusNote}</span>
        ) : (
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
            {waitingFor(request.createdAt, now)}
            {request.source === 'ONLINE' && <OnlinePill />}
            {request.patient === null && <NotLinkedPill />}
            {request.conflict && <Pill tone="outline">Clash</Pill>}
          </span>
        )}
      </Link>
    </li>
  )
}
