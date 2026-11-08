import { useEffect, useRef, useState } from 'react'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { CheckIcon, CopyIcon } from '../../components/icons'

type Props = {
  /** Who the password is for, such as "Ana Cruz". */
  name: string
  email: string
  password: string
  /** Called by "I've shared it". The screen then forgets the password. */
  onDismiss: () => void
}

/**
 * Shows a temporary password once, in a heavy ink border so it can't be missed. It stays until
 * dismissed, because closing it by accident would mean resetting the password again. The
 * password is only ever held in the parent's state: never in the address bar, the page title,
 * the query cache or the console.
 */
export function TemporaryPasswordPanel({ name, email, password, onDismiss }: Props) {
  const panel = useRef<HTMLElement>(null)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  // Move the cursor here when the panel appears, so keyboard and screen reader users find it.
  useEffect(() => {
    panel.current?.focus()
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopy('copied')
    } catch {
      // Clipboard access can be blocked (for example on an unsecured address).
      setCopy('failed')
    }
  }

  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-labelledby="temporary-password-heading"
      className="rounded-md border-2 border-neutral-950 p-5 outline-none focus-visible:ring-3 focus-visible:ring-neutral-950/10"
    >
      <h2 id="temporary-password-heading" className="text-lg font-semibold">
        Temporary password for {name}
      </h2>
      <p className="mt-1 max-w-2xl text-neutral-700">
        Give this to {name}. It is shown only once. They must choose a new password when they first sign in.
      </p>
      <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-[6rem_1fr] sm:gap-x-4">
        <dt className="text-neutral-600">Sign in with</dt>
        <dd className="break-all">{email}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="min-w-0 rounded-md bg-neutral-100 px-4 py-2.5 text-xl font-semibold tracking-wide break-all select-all">{password}</p>
        <button type="button" onClick={() => void handleCopy()} className={`${buttonOutline} h-11 px-4 text-sm`}>
          {copy === 'copied' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copy === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 min-h-5 text-sm text-neutral-600" role="status">
        {copy === 'copied' && 'Copied to the clipboard.'}
        {copy === 'failed' && 'Couldn’t copy. Select the password and copy it yourself.'}
      </p>
      <button type="button" onClick={onDismiss} className={`${buttonOnLight} mt-3 h-10 px-4 text-sm`}>
        I’ve shared it
      </button>
    </section>
  )
}
