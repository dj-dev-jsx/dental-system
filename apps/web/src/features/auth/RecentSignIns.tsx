import { buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { Pill } from '../../components/Table'
import { errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { type MyActivity, useMyActivity } from './activity'

const FAILURE_REASONS: Record<string, string> = {
  WRONG_PASSWORD: 'Wrong password',
  ACCOUNT_LOCKED: 'The account was locked',
  ACCOUNT_DEACTIVATED: 'The account was deactivated',
}

function describe(item: MyActivity) {
  if (item.action === 'LOGIN_SUCCEEDED') return { title: 'Signed in', flag: null }
  if (item.action === 'PASSWORD_CHANGED') return { title: 'Password changed', flag: null }
  return { title: (item.reason && FAILURE_REASONS[item.reason]) || 'Sign-in refused', flag: 'Failed attempt' }
}

/** Your own recent sign-ins, so a stranger on a shared computer can be spotted. */
export function RecentSignIns() {
  const { data, isPending, isError, error, refetch } = useMyActivity()

  return (
    <section aria-labelledby="recent-heading">
      <h2 id="recent-heading" className="text-lg font-semibold">
        Your recent sign-ins
      </h2>
      <p className="mt-1 text-sm text-neutral-600">If you see a sign-in that wasn’t you, change your password now and tell your clinic admin.</p>
      <div className="mt-3 border-t border-neutral-950">
        {isError ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ErrorBox className="flex-1">{errorMessage(error)}</ErrorBox>
            <button type="button" onClick={() => void refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        ) : isPending ? (
          <div aria-busy="true" aria-label="Loading recent sign-ins">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex justify-between border-b border-neutral-200 py-3.5">
                <div className="h-4 w-28 rounded bg-neutral-100" />
                <div className="h-4 w-40 rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <p className="py-6 text-neutral-600">Nothing recorded yet.</p>
        ) : (
          <ul>
            {data.items.map((item) => {
              const { title, flag } = describe(item)
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-neutral-200 py-3">
                  <span className="flex items-center gap-2.5">
                    <span className={flag ? 'font-semibold' : ''}>{title}</span>
                    {flag && <Pill tone="outline">{flag}</Pill>}
                  </span>
                  <time dateTime={item.createdAt} className="text-sm text-neutral-600">
                    {formatDateTime(item.createdAt)}
                  </time>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
