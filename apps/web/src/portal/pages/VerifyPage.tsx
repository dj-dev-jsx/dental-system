import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { commonMessage, errorCode, isRateLimited, type Me, type PortalAppointment, portalApi } from '../api'
import { RequestSent } from '../booking/outcomes'
import { appointmentsKey, meKey } from '../session'
import { Field, Lead, LoadFailed, LoadingLine, NarrowColumn, Notice, PortalPage, primaryButton, Problem, ScreenHeading, textLink } from '../ui'
import { usePortalTitle } from '../clinic-context'
import { EMAIL_RATE_LIMITED } from '../auth-messages'

// /verify?token=… — the link in the "confirm your email" message. Opening it
// confirms the email, signs the patient in on this device, and sends the waiting request.
// The token works once, so the result is kept in the page's history state and the token
// leaves the address.

type Verified = { account: Me; request: PortalAppointment | null }

export default function VerifyPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const token = params.get('token') ?? ''
  const kept = (location.state as { verified?: Verified } | null)?.verified

  // A query rather than an effect, so React's double start in development (and a second
  // render) share one request: a second request would find the token already used.
  const verify = useQuery({
    queryKey: ['portal', 'verify', token],
    queryFn: () => portalApi.verify(token),
    enabled: Boolean(token) && !kept,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (!verify.data) return
    queryClient.setQueryData(meKey(), verify.data.account)
    void queryClient.invalidateQueries({ queryKey: appointmentsKey() })
    navigate({ search: '' }, { replace: true, state: { verified: verify.data } })
  }, [verify.data, navigate, queryClient])

  const result = kept ?? verify.data
  const expired = !token || errorCode(verify.error) === 'TOKEN_INVALID'
  usePortalTitle(result ? (result.request ? 'Request sent' : 'Email confirmed') : expired ? 'Link expired' : 'Confirming your email')

  if (result) {
    return (
      <PortalPage>
        <NarrowColumn>
          {result.request ? <RequestSent appointment={result.request} email={result.account.email} /> : <ConfirmedNoRequest />}
        </NarrowColumn>
      </PortalPage>
    )
  }

  if (!token || errorCode(verify.error) === 'TOKEN_INVALID') {
    return (
      <PortalPage>
        <NarrowColumn>
          <ExpiredLink />
        </NarrowColumn>
      </PortalPage>
    )
  }

  if (verify.isError) {
    return (
      <PortalPage>
        <NarrowColumn>
          <ScreenHeading>We couldn’t confirm your email yet</ScreenHeading>
          <div className="mt-6">
            <LoadFailed
              message="We couldn’t reach the clinic’s booking system. Check your internet connection, then try again."
              onRetry={() => void verify.refetch()}
              retrying={verify.isFetching}
            />
          </div>
        </NarrowColumn>
      </PortalPage>
    )
  }

  return (
    <PortalPage>
      <NarrowColumn>
        <div aria-busy="true">
          <ScreenHeading>Confirming your email…</ScreenHeading>
          <div className="mt-6">
            <LoadingLine />
          </div>
        </div>
      </NarrowColumn>
    </PortalPage>
  )
}

function ConfirmedNoRequest() {
  return (
    <div>
      <ScreenHeading>Your email is confirmed</ScreenHeading>
      <Lead>
        You’re signed in. If you were booking a time, it passed while the link waited, so the request wasn’t sent. Choose a
        new time.
      </Lead>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <Link to="/book" className={primaryButton}>
          Book an appointment
        </Link>
        <Link to="/appointments" className={`${textLink} inline-flex min-h-11 items-center justify-center`}>
          My appointments
        </Link>
      </div>
    </div>
  )
}

function ExpiredLink() {
  const [email, setEmail] = useState('')
  const [invalid, setInvalid] = useState(false)
  const resend = useMutation({ mutationFn: (address: string) => portalApi.resendVerification(address) })

  function submit(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setInvalid(true)
    setInvalid(false)
    resend.mutate(address)
  }

  return (
    <div>
      <ScreenHeading>This link has expired</ScreenHeading>
      <Lead>
        Confirmation links work for 24 hours, and only once. If you already opened it, your email is confirmed:{' '}
        <Link to="/sign-in" className={textLink}>
          sign in
        </Link>{' '}
        to see your request.
      </Lead>
      <h2 className="mt-10 text-lg font-semibold">Get a new link</h2>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-5">
        <Field label="Email you signed up with" error={invalid ? 'Enter an email address like name@example.com.' : undefined}>
          {(props) => (
            <input
              {...props}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        {resend.isError && <Problem>{isRateLimited(resend.error) ? EMAIL_RATE_LIMITED : commonMessage(resend.error)}</Problem>}
        {resend.isSuccess && (
          <Notice>
            If {resend.variables} has an account here that still needs confirming, a new link is on its way. Open the newest
            email.
          </Notice>
        )}
        <button type="submit" disabled={resend.isPending} className={primaryButton}>
          {resend.isPending ? 'Sending…' : 'Send a new link'}
        </button>
      </form>
    </div>
  )
}
