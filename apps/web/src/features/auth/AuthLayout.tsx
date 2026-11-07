import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PRODUCT_NAME } from '../../config'

const PRIVACY_NOTE =
  'Patient records are confidential health information under the Data Privacy Act. Sign out when you leave a shared computer.'

/**
 * The frame around the sign-in screens: a clinic photograph on the left (a band across the
 * top on phones), and a white panel for the form, where the tooth panel sits after sign-in.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-white text-neutral-950 lg:flex-row">
      <div className="relative isolate flex h-40 shrink-0 flex-col justify-between overflow-hidden bg-neutral-950 px-5 py-4 text-white sm:h-52 lg:h-auto lg:flex-1 lg:px-10 lg:py-9">
        <img
          src="/images/clinic-room-1920.jpg"
          srcSet="/images/clinic-room-960.jpg 960w, /images/clinic-room-1920.jpg 1920w"
          sizes="(min-width: 1024px) calc(100vw - 28rem), 100vw"
          width={1920}
          height={1284}
          alt=""
          className="absolute inset-0 -z-20 size-full object-cover object-[40%_55%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(10_10_10/0.7)_0%,rgb(10_10_10/0.35)_35%,rgb(10_10_10/0.45)_65%,rgb(10_10_10/0.85)_100%)]"
        />
        <Link to="/" className="self-start font-semibold tracking-[-0.01em] lg:text-lg">
          {PRODUCT_NAME}
        </Link>
        <p className="hidden max-w-md text-sm/6 text-white/85 lg:block">{PRIVACY_NOTE}</p>
      </div>

      <main className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10 lg:w-[28rem] lg:flex-none lg:px-12">
        <div className="mx-auto w-full max-w-sm">{children}</div>
        <p className="mx-auto mt-10 w-full max-w-sm text-xs/5 text-neutral-500 lg:hidden">
          {PRIVACY_NOTE}
        </p>
      </main>
    </div>
  )
}
