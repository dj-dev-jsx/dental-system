import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PRODUCT_NAME } from '../../config'

const PRIVACY_NOTE =
  'Patient records are confidential health information under the Data Privacy Act. Sign out when you leave a shared computer.'

/**
 * The frame around the sign-in screens: a clinic photograph on the left, and a white panel for
 * the form, where the tooth panel sits after sign-in. On phones the photograph is a band across
 * the top and the panel rises over its lower edge like a sheet.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-neutral-950 text-neutral-950 selection:bg-neutral-950 selection:text-white lg:flex-row lg:bg-white">
      <div className="relative isolate flex h-48 shrink-0 flex-col justify-between overflow-hidden bg-neutral-950 px-5 pt-5 pb-10 text-white sm:h-60 sm:px-10 lg:h-auto lg:flex-1 lg:px-12 lg:py-10">
        <img
          src="/images/clinic-room-1920.jpg"
          srcSet="/images/clinic-room-960.jpg 960w, /images/clinic-room-1920.jpg 1920w"
          sizes="(min-width: 1024px) calc(100vw - 32rem), 100vw"
          width={1920}
          height={1284}
          alt=""
          className="absolute inset-0 -z-20 size-full object-cover object-[40%_55%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(10_10_10/0.7)_0%,rgb(10_10_10/0.3)_40%,rgb(10_10_10/0.45)_65%,rgb(10_10_10/0.9)_100%)]"
        />
        <Link
          to="/"
          className="flex items-center gap-2.5 self-start rounded-lg font-semibold tracking-[-0.01em] outline-white focus-visible:outline-2 focus-visible:outline-offset-4 lg:text-lg"
        >
          <span aria-hidden="true" className="size-2.5 rounded-full bg-white ring-4 ring-white/25" />
          {PRODUCT_NAME}
        </Link>
        <p className="hidden max-w-md text-sm/6 text-white/85 lg:block">{PRIVACY_NOTE}</p>
      </div>

      <main className="relative -mt-6 flex flex-1 flex-col rounded-t-3xl bg-white px-5 pt-9 pb-10 sm:px-10 lg:mt-0 lg:w-[32rem] lg:flex-none lg:justify-center lg:rounded-none lg:px-16 lg:py-12">
        <div className="mx-auto w-full max-w-sm">{children}</div>
        <p className="mx-auto mt-10 w-full max-w-sm text-xs/5 text-neutral-500 lg:hidden">{PRIVACY_NOTE}</p>
      </main>
    </div>
  )
}
