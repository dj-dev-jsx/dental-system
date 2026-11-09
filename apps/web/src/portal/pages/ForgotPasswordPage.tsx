import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { commonMessage, isRateLimited, portalApi } from '../api'
import { Field, Lead, NarrowColumn, PortalPage, primaryButton, Problem, ScreenHeading, secondaryButton, textLink } from '../ui'
import { useClinic, usePortalTitle } from '../clinic-context'
import { EMAIL_RATE_LIMITED } from '../auth-messages'

// The answer is the same whether or not the email has an account here, on purpose: this
// page must not tell a stranger who is a patient of the clinic.

export default function ForgotPasswordPage() {
  const { clinic } = useClinic()
  usePortalTitle('Forgot your password?')
  const location = useLocation()
  const initialEmail = (location.state as { email?: string } | null)?.email ?? ''
  const [email, setEmail] = useState(initialEmail)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const send = useMutation({
    mutationFn: (address: string) => portalApi.forgotPassword(address),
    onSuccess: (_, address) => setSentTo(address),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setMissing(true)
    setMissing(false)
    send.mutate(address)
  }

  const failure = send.isError ? (isRateLimited(send.error) ? EMAIL_RATE_LIMITED : commonMessage(send.error)) : null

  if (sentTo) {
    return (
      <PortalPage>
        <NarrowColumn>
          <ScreenHeading key="sent">Check your email</ScreenHeading>
          <Lead>
            If <strong className="font-semibold [overflow-wrap:anywhere] text-neutral-950">{sentTo}</strong> has an account with{' '}
            {clinic.name}, we’ve sent it a link to choose a new password. The link works for 1 hour.
          </Lead>
          <p className="mt-4 text-pretty text-neutral-600">Can’t find it? Look in your spam or promotions folder.</p>
          {failure && <Problem className="mt-6">{failure}</Problem>}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <button type="button" className={secondaryButton} disabled={send.isPending} onClick={() => send.mutate(sentTo)}>
              {send.isPending ? 'Sending…' : 'Send it again'}
            </button>
            <Link to="/sign-in" className={`${textLink} inline-flex min-h-11 items-center justify-center`}>
              Back to sign in
            </Link>
          </div>
        </NarrowColumn>
      </PortalPage>
    )
  }

  return (
    <PortalPage>
      <NarrowColumn>
        <ScreenHeading>Forgot your password?</ScreenHeading>
        <Lead>Enter the email you booked with. We’ll send you a link to choose a new password.</Lead>
        <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
          <Field label="Email" error={missing ? 'Enter an email address like name@example.com.' : undefined}>
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
          {failure && <Problem>{failure}</Problem>}
          <button type="submit" disabled={send.isPending} className={`${primaryButton} mt-1`}>
            {send.isPending ? 'Sending…' : 'Send the link'}
          </button>
        </form>
        <p className="mt-8 border-t border-neutral-200 pt-6 text-[0.9375rem] text-neutral-600">
          Remembered it?{' '}
          <Link to="/sign-in" className={textLink}>
            Sign in
          </Link>
        </p>
      </NarrowColumn>
    </PortalPage>
  )
}
