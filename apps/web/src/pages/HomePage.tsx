import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRightIcon, SignOutIcon } from '../components/icons'
import { ToothNumbers } from '../components/ToothNumbers'
import { PRODUCT_NAME } from '../config'
import { useAuthStore } from '../features/auth/authStore'
import { api, ApiError } from '../lib/api'
import { type Site, useSite } from '../lib/useSite'
import { hoursLabel } from '../portal/format'

// The clinic's website. Everything said here comes from the clinic's settings (GET /site) or is
// how booking actually works; there are no services, reviews or photos of a room that isn't
// theirs. The x-ray photo is a stock photo, credited in the footer.

const STEPS = [
  ['Choose a day and time', 'Pick what the visit is for, a dentist if you like, and a free time.'],
  ['Confirm your email', 'The first time, we email you a link. Your request reaches the clinic once you open it.'],
  ['The clinic answers', 'Staff confirm your visit, change the time, or decline it, and email you either way.'],
] as const

const telOf = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

const ink = 'font-semibold text-neutral-950 underline underline-offset-4 decoration-neutral-400 decoration-[1.5px] outline-neutral-950 hover:decoration-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm'

/** The signed-in patient's first name on this browser: null if nobody is, or while asking. */
function usePatientName(enabled: boolean) {
  const [signedIn, setSignedIn] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    api<{ firstName: string }>('/portal/me')
      .then((me) => live && setSignedIn(me.firstName))
      .catch(() => live && setSignedIn(null))
    return () => {
      live = false
    }
  }, [enabled])
  return signedIn
}

/** Ends the patient's session, then reloads the page so nothing stays in memory on a shared device. */
async function patientSignOut() {
  try {
    await api('/portal/logout', { method: 'POST' })
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error
  }
  window.location.replace('/')
}

function HeaderAction({ site }: { site: Site | null }) {
  const staff = useAuthStore((store) => store.state.status === 'signedIn')
  const patient = usePatientName(Boolean(site?.onlineBookingEnabled))
  const [failed, setFailed] = useState(false)
  const [to, label] = staff ? ['/app', 'Open the staff app'] : patient ? ['/appointments', 'My appointments'] : ['/sign-in', 'Sign in']
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        to={to}
        className="inline-flex h-11 shrink-0 items-center rounded-full border border-white/35 px-4 text-[0.9375rem] font-semibold whitespace-nowrap text-white outline-white transition-colors duration-150 hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {label}
      </Link>
      {patient && !staff && (
        <button
          type="button"
          aria-label={failed ? 'Couldn’t sign out. Try again' : 'Sign out'}
          title={failed ? 'Couldn’t sign out. Try again' : 'Sign out'}
          onClick={() => {
            setFailed(false)
            patientSignOut().catch(() => setFailed(true))
          }}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-[0.9375rem] font-semibold text-white/85 outline-white transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-2 sm:px-3.5"
        >
          <SignOutIcon className="size-[1.125rem]" />
          <span className="hidden sm:inline">{failed ? 'Try again' : 'Sign out'}</span>
        </button>
      )}
    </div>
  )
}

export default function HomePage() {
  const site = useSite()
  const name = site?.name ?? PRODUCT_NAME
  const booking = site?.onlineBookingEnabled ?? false
  const patientName = usePatientName(booking)

  useEffect(() => {
    document.title = name
  }, [name])

  const details: [string, ReactNode][] = []
  if (site) details.push(['Opening hours', hoursLabel(site.opensAt, site.closesAt)])
  if (site?.address) details.push(['Address', <span className="whitespace-pre-line">{site.address}</span>])
  if (site?.phone) {
    details.push([
      'Phone',
      <a href={telOf(site.phone)} className={ink}>
        {site.phone}
      </a>,
    ])
  }
  if (site?.email) {
    details.push([
      'Email',
      <a href={`mailto:${site.email}`} className={`${ink} font-normal [overflow-wrap:anywhere]`}>
        {site.email}
      </a>,
    ])
  }

  return (
    <div className="flex min-h-full flex-col bg-white text-neutral-950 selection:bg-neutral-950 selection:text-white">
      <section className="relative isolate overflow-hidden bg-neutral-950 text-white selection:bg-white selection:text-neutral-950">
        <img
          src="/images/xray-lightbox-2400.jpg"
          srcSet="/images/xray-lightbox-1200.jpg 1200w, /images/xray-lightbox-2400.jpg 2400w"
          sizes="100vw"
          width={2400}
          height={1600}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 -z-20 size-full object-cover object-[32%_30%] opacity-70"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(10_10_10/0.85)_0%,rgb(10_10_10/0.35)_30%,rgb(10_10_10/0.6)_60%,#0a0a0a_100%),linear-gradient(to_right,rgb(10_10_10/0.6)_0%,transparent_65%)]"
        />
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-[4.5rem] sm:px-10">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-lg font-bold tracking-[-0.02em] outline-white focus-visible:outline-2 focus-visible:outline-offset-4 sm:text-[1.0625rem]">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-white ring-4 ring-white/25" />
            <span className="truncate">{name}</span>
          </Link>
          <HeaderAction site={site} />
        </header>

        <div className="mx-auto max-w-6xl px-5 pt-16 pb-8 sm:px-10 sm:pt-32 sm:pb-10">
          <h1 className="max-w-[12ch] text-[clamp(2.75rem,8vw,5.75rem)] leading-[0.95] font-bold tracking-[-0.035em] text-balance">{name}</h1>
          {patientName && <p className="mt-6 text-lg font-semibold text-white">Welcome back, {patientName}.</p>}
          <p className={`${patientName ? 'mt-2' : 'mt-6'} max-w-xl text-lg/7 text-pretty text-white/85`}>
            {booking
              ? 'A dental clinic. Ask for an appointment online at a time that suits you, and we confirm it by email.'
              : 'A dental clinic. To book a visit, call us or drop by during opening hours.'}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
            {booking ? (
              <Link to="/book" className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-white px-7 text-[1.0625rem] font-semibold text-neutral-950 outline-white transition-colors duration-150 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2">
                Book an appointment <ArrowRightIcon />
              </Link>
            ) : (
              site?.phone && (
                <a href={telOf(site.phone)} className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-white px-7 text-[1.0625rem] font-semibold text-neutral-950 outline-white transition-colors duration-150 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2">
                  Call {site.phone}
                </a>
              )
            )}
          </div>
          {patientName && booking && (
            <p className="mt-4 text-[0.9375rem] text-white/85">
              <Link to="/appointments" className="font-semibold text-white underline underline-offset-4 outline-white hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2">
                See my appointments
              </Link>
            </p>
          )}
          {site && !booking && <p className="mt-4 text-[0.9375rem] text-white/75">Online booking is closed for now.</p>}
          <ToothNumbers rows="upper" tone="dark" scan className="mt-14 border-t border-white/25 sm:mt-20" />
        </div>
      </section>

      <main id="main" className="px-5 py-16 sm:px-10 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-2 lg:gap-20">
          <section aria-labelledby="visit-heading">
            <h2 id="visit-heading" className="text-2xl font-bold tracking-[-0.02em]">
              Visiting the clinic
            </h2>
            {site ? (
              <dl className="mt-5 border-t border-neutral-950">
                {details.map(([label, value]) => (
                  <div key={label} className="grid gap-1 border-b border-neutral-200 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
                    <dt className="text-sm font-semibold text-neutral-600 sm:text-base sm:font-normal">{label}</dt>
                    <dd className="text-[1.0625rem]">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="appear-late mt-5 text-neutral-500">Loading…</p>
            )}
          </section>

          {booking ? (
            <section aria-labelledby="how-heading">
              <h2 id="how-heading" className="text-2xl font-bold tracking-[-0.02em]">
                How booking online works
              </h2>
              <ol className="mt-5 border-t border-neutral-950">
                {STEPS.map(([title, text], i) => (
                  <li key={title} className="grid grid-cols-[2rem_1fr] gap-x-4 border-b border-neutral-200 py-5">
                    <span className="grid size-8 place-items-center rounded-full bg-neutral-950 text-[0.9375rem] font-bold text-white tabular-nums" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-[1.0625rem] font-semibold">{title}</h3>
                      <p className="mt-1 text-pretty text-neutral-600">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-pretty text-neutral-600">
                A booking is a request until the clinic confirms it.
                {site?.phone && (
                  <>
                    {' '}
                    For anything urgent, call{' '}
                    <a href={telOf(site.phone)} className={`${ink} whitespace-nowrap`}>
                      {site.phone}
                    </a>
                    .
                  </>
                )}
              </p>
              <p className="mt-4 text-pretty text-neutral-600">
                Booked before?{' '}
                <Link to="/sign-in" className={ink}>
                  Sign in
                </Link>{' '}
                to see or cancel your appointments.
              </p>
            </section>
          ) : (
            site && (
              <section aria-labelledby="book-heading">
                <h2 id="book-heading" className="text-2xl font-bold tracking-[-0.02em]">
                  Booking a visit
                </h2>
                <p className="mt-5 border-t border-neutral-950 pt-5 text-[1.0625rem]/7 text-pretty text-neutral-600">
                  Online booking is closed for now.{' '}
                  {site.phone ? (
                    <>
                      Call{' '}
                      <a href={telOf(site.phone)} className={`${ink} whitespace-nowrap`}>
                        {site.phone}
                      </a>{' '}
                      to book, or visit during opening hours.
                    </>
                  ) : (
                    'Visit the clinic during opening hours to book.'
                  )}
                </p>
              </section>
            )
          )}
        </div>
      </main>

      <footer className="mt-auto px-5 pb-10 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 border-t border-neutral-200 pt-6 text-sm/6 text-neutral-600 md:flex-row md:justify-between">
          <div>
            <p className="font-semibold text-neutral-950">{name}</p>
            <p>
              Staff,{' '}
              <Link to="/sign-in" className="underline underline-offset-3 outline-neutral-950 hover:text-neutral-950 focus-visible:outline-2">
                sign in here
              </Link>
              .
            </p>
          </div>
          <div className="max-w-md text-neutral-500">
            <p>Your details are kept by {name} and used only for your care and appointments, under the Data Privacy Act of 2012.</p>
            <p className="mt-2">
              Photo by{' '}
              <a className="underline underline-offset-3 hover:text-neutral-950" href="https://unsplash.com/@jonathanborba">
                Jonathan Borba
              </a>{' '}
              on Unsplash.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
