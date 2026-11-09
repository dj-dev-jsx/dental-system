import type { SVGProps } from 'react'

// Extra line icons for the patient pages and sign-in, on the same 20 x 20 grid and 1.75
// stroke as components/icons.tsx, so they sit together.
type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

export const EyeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M1.75 10S4.75 4.25 10 4.25 18.25 10 18.25 10 15.25 15.75 10 15.75 1.75 10 1.75 10Z" />
    <circle cx="10" cy="10" r="2.5" />
  </Icon>
)

export const EyeOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8.2 4.45A8 8 0 0 1 10 4.25C15.25 4.25 18.25 10 18.25 10a14 14 0 0 1-2.1 2.9M5.4 5.6C3 7.2 1.75 10 1.75 10S4.75 15.75 10 15.75a7.6 7.6 0 0 0 4.1-1.2M8.25 8.3a2.5 2.5 0 0 0 3.45 3.45M2.5 2.5l15 15" />
  </Icon>
)

export const MailIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.25" y="4.25" width="15.5" height="11.5" rx="2" />
    <path d="m2.75 5.25 7.25 5.5 7.25-5.5" />
  </Icon>
)

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.75" y="8.75" width="12.5" height="8.5" rx="2" />
    <path d="M6.75 8.75V6.5a3.25 3.25 0 0 1 6.5 0v2.25" />
  </Icon>
)

/** A tick that can draw itself in (pathLength 1, with the tick-draw class). */
export const TickIcon = ({ draw, ...props }: IconProps & { draw?: boolean }) => (
  <Icon {...props}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" pathLength={1} className={draw ? 'tick-draw' : undefined} />
  </Icon>
)
