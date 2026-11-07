import { Link } from 'react-router'
import { buttonOnDark, buttonOnLight } from '../components/buttons'
import { ArrowDownIcon, ArrowRightIcon } from '../components/icons'
import { ToothNumbers } from '../components/ToothNumbers'
import { PRODUCT_NAME } from '../config'
import { useAuthStore } from '../features/auth/authStore'

// Everything said here must be true today. Features that don't exist yet go under
// "Coming next", and there are no customer, price or availability claims.

const WORKING_NOW = [
  ['Patient records', 'Register, search, edit and archive patients. Archived records are kept, never deleted.'],
  ['3D dental chart', 'Each tooth’s condition on a model of the mouth you can turn and zoom.'],
  ['Staff roles', 'Admins, dentists, receptionists and assistants, each with the access their job needs.'],
  ['Audit log', 'Who looked at or changed a patient’s record, and when.'],
] as const

const COMING_NEXT = [
  ['Appointments', 'A calendar for each dentist that won’t allow double bookings.'],
  ['Tooth history', 'Treatments and notes on each tooth, over time.'],
  ['Billing', 'Payments by cash, GCash, Maya, bank transfer or HMO, with printable statements. Statements are not official BIR invoices.'],
  ['Staff accounts', 'Admins add staff, reset passwords and unlock accounts themselves.'],
] as const

const PROTECTIONS = [
  ['Clinics are kept apart', 'Each clinic sees only its own patients. The database itself refuses anything else, even if the app’s code has a mistake.'],
  ['Every look is logged', 'Opening, changing or archiving a record is logged with who did it and when, including the old and new values.'],
  ['Safe on shared computers', 'Sign-ins end after 12 hours, accounts lock after 5 wrong passwords, and signing out clears the screen.'],
] as const

function FeatureList({ title, items }: { title: string; items: readonly (readonly [string, string])[] }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <dl className="mt-4 border-t border-neutral-950">
        {items.map(([name, description]) => (
          <div key={name} className="grid gap-1 border-b border-neutral-200 py-5 sm:grid-cols-[11rem_1fr] sm:gap-8">
            <dt className="font-semibold">{name}</dt>
            <dd className="text-neutral-600">{description}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function LandingPage() {
  const signedIn = useAuthStore((store) => store.state.status === 'signedIn')
  const action = signedIn ? { to: '/app', label: 'Open the app' } : { to: '/sign-in', label: 'Sign in' }

  return (
    <div className="bg-white text-neutral-950">
      <section className="relative isolate flex min-h-svh flex-col overflow-hidden bg-neutral-950 text-white">
        <img
          src="/images/xray-lightbox-2400.jpg"
          srcSet="/images/xray-lightbox-1200.jpg 1200w, /images/xray-lightbox-2400.jpg 2400w"
          sizes="100vw"
          width={2400}
          height={1600}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 -z-20 size-full object-cover object-[32%_30%]"
        />
        {/* Darkens the top for the menu, and the bottom and left for the headline, leaving the
            films lit. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(10_10_10/0.8)_0%,rgb(10_10_10/0.1)_24%,rgb(10_10_10/0.25)_42%,rgb(10_10_10/0.88)_70%,#0a0a0a_100%),linear-gradient(to_right,rgb(10_10_10/0.5)_0%,rgb(10_10_10/0.15)_40%,transparent_60%)]"
        />

        <nav className="flex items-center justify-between gap-6 px-5 py-5 sm:px-10">
          <Link to="/" className="text-lg font-semibold tracking-[-0.01em]">
            {PRODUCT_NAME}
          </Link>
          <div className="flex items-center gap-7">
            <a href="#chart" className="hidden text-sm font-medium text-white/80 hover:text-white sm:inline">
              The chart
            </a>
            <a href="#privacy" className="hidden text-sm font-medium text-white/80 hover:text-white sm:inline">
              Privacy
            </a>
            <Link to={action.to} className={`${buttonOnDark} h-10 px-4 text-sm`}>
              {action.label}
            </Link>
          </div>
        </nav>

        <div className="mt-auto px-5 pb-8 sm:px-10 sm:pb-10">
          <h1 className="max-w-[13ch] text-[clamp(3rem,7.4vw,6rem)] leading-[0.94] font-bold tracking-[-0.035em] text-balance">
            Every tooth, on record.
          </h1>
          <p className="mt-6 max-w-xl text-lg/7 text-pretty text-white/80">
            Patient records for small dental clinics, built around a 3D chart of the teeth. Click
            any tooth to see its condition.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link to={action.to} className={`${buttonOnDark} h-12 px-6`}>
              {action.label}
            </Link>
            <a href="#chart" className="inline-flex items-center gap-2 font-medium text-white/85 hover:text-white">
              See the chart <ArrowDownIcon />
            </a>
          </div>
          <ToothNumbers rows="upper" tone="dark" scan className="mt-14 border-t border-white/25" />
        </div>
      </section>

      <section id="chart" className="bg-neutral-950 px-5 py-24 text-white sm:px-10 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-[16ch] text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.02] font-bold tracking-[-0.03em] text-balance">
            The chart is the record.
          </h2>
          <p className="mt-6 max-w-2xl text-lg/8 text-pretty text-neutral-300">
            Each patient’s teeth appear as a 3D model, numbered the FDI way from 11 to 48. Turn it,
            zoom in, and click a tooth to see its condition: healthy, decayed, filled, crowned,
            root canal, implant, missing or extracted.
          </p>
          <figure className="mt-14 sm:mt-20">
            <img
              src="/images/chart-render-1200.webp"
              srcSet="/images/chart-render-800.webp 800w, /images/chart-render-1200.webp 1200w"
              sizes="(min-width: 896px) 896px, 100vw"
              width={1200}
              height={1154}
              alt="The 3D dental chart: upper and lower teeth inside a faint outline of the skull."
              loading="lazy"
              className="mx-auto h-auto w-full max-w-4xl"
            />
            <ToothNumbers rows="both" tone="dark" className="mx-auto mt-10 max-w-3xl" />
            <figcaption className="mx-auto mt-6 max-w-xl text-center text-sm/6 text-neutral-400">
              The chart as it appears in the app, shown here in black and white. In the app, each
              condition has its own colour.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
          <div>
            <h2 className="max-w-[14ch] text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.02] font-bold tracking-[-0.03em] text-balance">
              Made for small clinics.
            </h2>
            <p className="mt-6 max-w-md text-lg/8 text-pretty text-neutral-600">
              A few staff, shared computers at the front desk, and an internet connection that
              isn’t always fast. That’s who this is built for, in the Philippines.
            </p>
          </div>
          <div className="flex flex-col gap-14">
            <FeatureList title="Working now" items={WORKING_NOW} />
            <FeatureList title="Coming next" items={COMING_NEXT} />
          </div>
        </div>
      </section>

      <section id="privacy" className="bg-neutral-950 px-5 py-24 text-white sm:px-10 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-[18ch] text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.02] font-bold tracking-[-0.03em] text-balance">
            Health records stay with the clinic.
          </h2>
          <p className="mt-6 max-w-2xl text-lg/8 text-pretty text-neutral-300">
            Under the Data Privacy Act, dental records are sensitive personal information. These
            protections are built in from the first version.
          </p>
          <ul className="mt-16 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {PROTECTIONS.map(([title, text]) => (
              <li key={title} className="border-t border-white/25 pt-6">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-neutral-300">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-5 pt-24 pb-16 sm:px-10 sm:pt-32">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 border-t border-neutral-950 pt-12 md:flex-row md:items-end">
          <div>
            <h2 className="text-[clamp(2.25rem,4.6vw,3.75rem)] leading-[1.02] font-bold tracking-[-0.03em]">
              Clinic staff
            </h2>
            <p className="mt-4 max-w-md text-lg/8 text-pretty text-neutral-600">
              Sign in with the email and password your clinic gave you.
            </p>
          </div>
          <Link to={action.to} className={`${buttonOnLight} h-12 px-6`}>
            {action.label} <ArrowRightIcon />
          </Link>
        </div>
      </section>

      <footer className="px-5 pb-10 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-neutral-200 pt-6 text-sm/6 text-neutral-500 md:flex-row md:justify-between">
          <p>
            <span className="font-semibold text-neutral-950">{PRODUCT_NAME}</span> is a working
            name. In development: not yet for real patient records.
          </p>
          <p>
            Photos by{' '}
            <a className="underline underline-offset-3 hover:text-neutral-950" href="https://unsplash.com/@jonathanborba">
              Jonathan Borba
            </a>{' '}
            and{' '}
            <a className="underline underline-offset-3 hover:text-neutral-950" href="https://unsplash.com/@benyamin_bohlouli">
              Benyamin Bohlouli
            </a>{' '}
            on Unsplash.
          </p>
        </div>
      </footer>
    </div>
  )
}
