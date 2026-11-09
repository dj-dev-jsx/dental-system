import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router'
import { commonMessage, isRateLimited, portalApi } from './api'
import { EMAIL_RATE_LIMITED } from './auth-messages'
import { problemLink, secondaryButton, textLink } from './ui'

// Pieces the sign-in, booking and email-link screens share.

/** "Send the link again", with what happened under it. */
export function ResendLink({ email, tone = 'light', label = 'Send the link again' }: { email: string; tone?: 'light' | 'dark'; label?: string }) {
  const resend = useMutation({ mutationFn: () => portalApi.resendVerification(email) })
  const button =
    tone === 'dark'
      ? `${problemLink} disabled:cursor-wait disabled:opacity-70`
      : secondaryButton

  return (
    <div className={tone === 'dark' ? 'mt-2' : ''}>
      <button type="button" onClick={() => resend.mutate()} disabled={resend.isPending || !email} className={button}>
        {resend.isPending ? 'Sending…' : label}
      </button>
      <p role="status" className={`text-[0.9375rem]/6 ${tone === 'dark' ? 'mt-1 text-white/85' : 'mt-3 text-neutral-700'}`}>
        {resend.isSuccess && `Sent again to ${email}. It can take a minute or two to arrive.`}
        {resend.isError && (isRateLimited(resend.error) ? EMAIL_RATE_LIMITED : commonMessage(resend.error))}
      </p>
    </div>
  )
}

/** The account exists and the password was right, but the email was never confirmed. */
export function UnverifiedProblemBody({ email }: { email: string }) {
  return (
    <>
      <p>
        Confirm your email first. When you signed up, we emailed a link to <strong className="font-semibold">{email}</strong>.
        Open it, then sign in.
      </p>
      <ResendLink email={email} tone="dark" />
    </>
  )
}

export function ForgotPasswordLink({ email, tone = 'dark' }: { email?: string; tone?: 'light' | 'dark' }) {
  return (
    <Link
      to="/forgot-password"
      state={email ? { email } : undefined}
      className={tone === 'dark' ? problemLink : textLink}
    >
      Forgot your password?
    </Link>
  )
}
