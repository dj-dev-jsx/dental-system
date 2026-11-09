import { useInfiniteQuery } from '@tanstack/react-query'
import { type ReactNode, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { compactInputClass } from '../../components/forms'
import { Page, PageHeader } from '../../components/Page'
import { Pill } from '../../components/Table'
import { api, errorMessage } from '../../lib/api'
import { addDays, formatDayLong, formatDayShort, manilaDate, todayInManila } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useStaff } from '../staff/queries'
import { actorName, actorRole } from './actor'
import { type ActivityEntry, changesOf, emphasis, failureReason, KIND_GROUPS, sentence, subjectLink } from './activityText'

const LIMIT = 50
const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

type Result = { items: ActivityEntry[]; total: number; page: number; limit: number }

function dayHeading(day: string, today: string) {
  if (day === today) return 'Today'
  if (day === addDays(today, -1)) return 'Yesterday'
  return formatDayLong(day)
}

/**
 * Who did what, newest first, grouped by day. Routine lookups (lists, a record opened again)
 * are hidden unless asked for, though they are still kept. Admins only, because the log
 * itself holds patient details. It can't be edited, even from here.
 */
export default function ActivityPage() {
  useDocumentTitle('Activity log')
  const [params, setParams] = useSearchParams()
  const person = params.get('person') ?? ''
  const kind = params.get('kind') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const routine = params.get('routine') === '1'
  const staff = useStaff({ search: '', status: 'all', role: '', sort: 'name', dir: 'asc' })
  const filtered = Boolean(person || kind || from || to)

  const log = useInfiniteQuery({
    queryKey: ['audit', { person, kind, from, to, routine }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ page: String(pageParam), limit: String(LIMIT) })
      if (person) query.set('actorUserId', person)
      const group = KIND_GROUPS.find((g) => g.value === kind)
      if (group) query.set('actions', group.actions.join(','))
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      if (!routine) query.set('excludeRoutine', 'true')
      return api<Result>(`/audit-logs?${query}`)
    },
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  })

  function update(changes: Record<string, string | null>) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  }

  const today = todayInManila()
  const days = useMemo(() => {
    const groups: { day: string; entries: ActivityEntry[] }[] = []
    for (const entry of log.data?.pages.flatMap((page) => page.items) ?? []) {
      const day = manilaDate(entry.createdAt)
      const last = groups[groups.length - 1]
      if (last?.day === day) last.entries.push(entry)
      else groups.push({ day, entries: [entry] })
    }
    return groups
  }, [log.data])

  const shown = days.reduce((sum, d) => sum + d.entries.length, 0)
  const total = log.data?.pages[0]?.total ?? 0

  return (
    <Page>
      <PageHeader
        title="Activity log"
        description="Every sign-in, and every patient record and appointment opened or changed. Nobody can edit or delete these lines."
      />

      <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-neutral-950 pt-4">
        <Filter id="activity-person" label="Person">
          <select id="activity-person" value={person} onChange={(e) => update({ person: e.target.value || null })} className={compactInputClass}>
            <option value="">Everyone</option>
            {staff.data?.items.map((member) => (
              <option key={member.id} value={member.id}>
                {member.firstName} {member.lastName}
              </option>
            ))}
          </select>
        </Filter>
        <Filter id="activity-kind" label="Kind">
          <select id="activity-kind" value={kind} onChange={(e) => update({ kind: e.target.value || null })} className={compactInputClass}>
            <option value="">All activity</option>
            {KIND_GROUPS.map((group) => (
              <option key={group.value} value={group.value}>
                {group.label}
              </option>
            ))}
          </select>
        </Filter>
        <Filter id="activity-from" label="From">
          <input id="activity-from" type="date" value={from} max={to || today} onChange={(e) => update({ from: e.target.value || null })} className={compactInputClass} />
        </Filter>
        <Filter id="activity-to" label="To">
          <input id="activity-to" type="date" value={to} min={from || undefined} max={today} onChange={(e) => update({ to: e.target.value || null })} className={compactInputClass} />
        </Filter>
        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={routine} onChange={(e) => update({ routine: e.target.checked ? '1' : null })} className="size-4 accent-neutral-950" />
          Show routine lookups
        </label>
        {filtered && (
          <button type="button" onClick={() => update({ person: null, kind: null, from: null, to: null })} className="h-9 text-sm font-semibold underline underline-offset-3 hover:no-underline">
            Clear filters
          </button>
        )}
      </div>

      {log.isError && !log.data ? (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ErrorBox className="flex-1">{errorMessage(log.error)}</ErrorBox>
          <button type="button" onClick={() => void log.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
            Try again
          </button>
        </div>
      ) : log.isPending ? (
        <div className="mt-6 border-t border-neutral-950" aria-busy="true" aria-label="Loading the activity log">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex gap-8 border-b border-neutral-200 py-3.5">
              <div className="h-4 w-14 rounded bg-neutral-100" />
              <div className="h-4 w-36 rounded bg-neutral-100" />
              <div className="h-4 w-72 max-w-full rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="mt-6 border-t border-neutral-200 py-12">
          <p className="text-lg font-semibold">{filtered ? 'Nothing matches these filters' : 'Nothing to show yet'}</p>
          <p className="mt-1 text-neutral-600">
            {filtered ? 'Try another person, kind or dates.' : routine ? 'New activity will appear here.'  : 'Routine lookups are hidden. Turn them on to see every page opened.'}
          </p>
          {filtered && (
            <button type="button" onClick={() => update({ person: null, kind: null, from: null, to: null })} className={`${buttonOutline} mt-4 h-9 px-4 text-sm`}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={`mt-2 transition-opacity ${log.isFetching && !log.isFetchingNextPage ? 'opacity-50' : ''}`}>
            {days.map(({ day, entries }) => (
              <section key={day} aria-label={dayHeading(day, today)}>
                <h2 className="sticky top-0 z-10 border-b border-neutral-950 bg-white pt-5 pb-2 text-sm font-semibold">
                  {dayHeading(day, today)}
                  {(day === today || day === addDays(today, -1)) && <span className="font-normal text-neutral-500"> · {formatDayShort(day)}</span>}
                </h2>
                <ol>
                  {entries.map((entry) => (
                    <Line key={entry.id} entry={entry} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
            <p>
              Showing {shown} of {total} {total === 1 ? 'line' : 'lines'}
              {!routine && ' (routine lookups hidden)'}
            </p>
            {log.hasNextPage && (
              <button type="button" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()} className={`${buttonOutline} h-9 px-4`}>
                {log.isFetchingNextPage ? 'Loading…' : 'Load older'}
              </button>
            )}
            {log.isError && <span className="font-semibold text-neutral-950">Could not load more.</span>}
          </div>
        </>
      )}
    </Page>
  )
}

function Filter({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-600">
        {label}
      </label>
      {children}
    </div>
  )
}

function Line({ entry }: { entry: ActivityEntry }) {
  const { text, hasSubject } = sentence(entry)
  const to = subjectLink(entry)
  const flag = emphasis(entry)
  const changes = changesOf(entry)
  const reason = failureReason(entry)
  const subject = entry.subject
  return (
    <li className="grid gap-x-4 gap-y-0.5 border-b border-neutral-200 py-3 text-sm hover:bg-neutral-50 grid-cols-[4.75rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_13rem_minmax(0,1fr)_auto]">
      <time dateTime={entry.createdAt} className="text-neutral-500 tabular-nums">
        {TIME.format(new Date(entry.createdAt))}
      </time>
      <p>
        <span className="font-semibold">
          {actorName(entry.actor)}
        </span>
        <span className="text-neutral-500 sm:block">
          <span className="sm:hidden"> · </span>
          {actorRole(entry.actor)}
        </span>
      </p>
      <div className="col-start-2 min-w-0 sm:col-start-auto">
        <p>
          {text}
          {hasSubject && subject && to && (
            <>
              {' '}
              <Link to={to} className="font-semibold underline underline-offset-3 hover:no-underline">
                {subject.name}
              </Link>
              {subject.kind === 'appointment' && <span className="text-neutral-500">, {formatDayShort(manilaDate(subject.startsAt))}</span>}
            </>
          )}
          {reason && <span className="text-neutral-500"> ({reason})</span>}
        </p>
        {changes.length > 0 && (
          <ul className="mt-0.5 text-neutral-600">
            {changes.map((change) => (
              <li key={change.field}>
                {change.field}: {change.from} <span aria-label="to">→</span> {change.to}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="col-start-2 mt-1 sm:col-start-auto sm:mt-0 sm:justify-self-end">{flag && <Pill tone={flag.tone}>{flag.label}</Pill>}</div>
    </li>
  )
}
