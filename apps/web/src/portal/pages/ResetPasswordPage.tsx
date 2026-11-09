import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { commonMessage, errorCode, isRateLimited, portalApi } from '../api'
import { meKey } from '../session'
import { Lead, NarrowColumn, PasswordField, PortalPage, primaryButton, Problem, ScreenHeading } from '../ui'
import { usePortalTitle } from '../clinic-context'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tooShort, setTooShort] = useState(false)

  const reset = useMutation({
    mutationFn: (newPassword: string) => portalApi.resetPassword(token, newPassword),
    onSuccess: () => {
      // Every session of the account ended, this device's too.
      queryClient.setQueryData(meKey(), null)
      navigate('/sign-in', {
        replace: true,
        state: { notice: 'Your password is changed. Sign in with the new one.' },
      })
    },
  })

  const expired = !token || errorCode(reset.error) === 'TOKEN_INVALID'
  usePortalTitle(expired ? 'Link expired' : 'Choose a new password')
  if (expired) {
    return (
      <PortalPage>
        <NarrowColumn>
          <ScreenHeading key="expired">This link has expired</ScreenHeading>
          <Lead>
            Links to change a password work for 1 hour, and only once. Ask for a new one, and use the newest email.
          </Lead>
          <Link to="/forgot-password" className={`${primaryButton} mt-8`}>
            Get a new link
          </Link>
        </NarrowColumn>
      </PortalPage>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(new FormData(event.currentTarget).get('newPassword') ?? '')
    if (password.length < 10) {
      setTooShort(true)
      event.currentTarget.querySelector<HTMLInputElement>('[name="newPassword"]')?.focus()
      return
    }
    setTooShort(false)
    reset.mutate(password)
  }

  const failure = reset.isError
    ? isRateLimited(reset.error)
      ? 'Too many tries from this device. Wait 10 minutes, then try again.'
      : commonMessage(reset.error)
    : null

  return (
    <PortalPage>
      <NarrowColumn>
        <ScreenHeading>Choose a new password</ScreenHeading>
        <Lead>You’ll sign in with it from now on. Anyone signed in to your account elsewhere will be signed out.</Lead>
        <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
          <PasswordField
            label="New password"
            name="newPassword"
            autoComplete="new-password"
            error={tooShort ? 'Use at least 10 characters.' : undefined}
            hint="At least 10 characters. A few words together is easy to remember."
          />
          {failure && <Problem>{failure}</Problem>}
          <button type="submit" disabled={reset.isPending} className={`${primaryButton} mt-1`}>
            {reset.isPending ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </NarrowColumn>
    </PortalPage>
  )
}
