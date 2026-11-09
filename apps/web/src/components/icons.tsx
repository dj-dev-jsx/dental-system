import type { SVGProps } from 'react'

// A few line icons drawn for this app, all on the same 20 x 20 grid and stroke, so they match.
type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const ArrowDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 4v12M5 11l5 5 5-5" />
  </Icon>
)

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </Icon>
)

export const ArrowLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M16 10H4M9 5l-5 5 5 5" />
  </Icon>
)

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
)

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={8.75} cy={8.75} r={5} />
    <path d="M12.5 12.5 16 16" />
  </Icon>
)

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={10} cy={10} r={7.25} />
    <path d="M10 6.25v4.5M10 13.6v.15" />
  </Icon>
)

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={10} cy={10} r={7.25} />
    <path d="M10 9.25v4.5M10 6.4v.15" />
  </Icon>
)

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4.5 6.5 10l5.5 5.5" />
  </Icon>
)

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 4.5 13.5 10 8 15.5" />
  </Icon>
)

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Icon>
)

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
  </Icon>
)

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x={3.25} y={4.25} width={13.5} height={12.5} rx={2} />
    <path d="M3.25 8.25h13.5M7 2.75v3M13 2.75v3" />
  </Icon>
)

export const InboxIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.25 11.25 5.4 4.9a1.5 1.5 0 0 1 1.42-1.02h6.36a1.5 1.5 0 0 1 1.42 1.02l2.15 6.35v3.5a1.5 1.5 0 0 1-1.5 1.5H4.75a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M3.25 11.25h3.5l1 2h4.5l1-2h3.5" />
  </Icon>
)

export const PeopleIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={7.75} cy={7} r={2.75} />
    <path d="M2.75 16.25c.4-2.6 2.4-4.25 5-4.25s4.6 1.65 5 4.25" />
    <path d="M12.5 4.5a2.75 2.75 0 0 1 0 5M14.25 12.3c1.6.55 2.7 1.9 3 3.95" />
  </Icon>
)

export const ToothIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 5.1C8.6 3.9 7.4 3.4 6 3.5 4 3.7 3 5.3 3.1 7.4c.1 2 1 3.1 1.5 4.6.5 1.6.6 4.6 2.1 4.6 1.6 0 1.4-3.6 3.3-3.6s1.7 3.6 3.3 3.6c1.5 0 1.6-3 2.1-4.6.5-1.5 1.4-2.6 1.5-4.6.1-2.1-.9-3.7-2.9-3.9-1.4-.1-2.6.4-4 1.6z" />
  </Icon>
)

export const ListIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" />
    <path d="M3.75 5.5h.01M3.75 10h.01M3.75 14.5h.01" strokeWidth={2.25} />
  </Icon>
)

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={10} cy={10} r={7.25} />
    <path d="M10 6v4.25l2.75 1.75" />
  </Icon>
)

export const PersonIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={10} cy={7} r={3} />
    <path d="M4.5 16.5c.5-2.9 2.6-4.75 5.5-4.75s5 1.85 5.5 4.75" />
  </Icon>
)

/** Staff: two people with a badge line, to tell it from the patients' icon. */
export const UsersIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={10} cy={6.5} r={3} />
    <path d="M4 16.5c.45-3 2.55-4.75 6-4.75s5.55 1.75 6 4.75z" />
    <path d="M8.5 14.25h3" />
  </Icon>
)

/** Clinic settings: three sliders. */
export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 5.5h1.75M8.75 5.5h7.75M3.5 10h7.75M14.75 10h1.75M3.5 14.5h3.25M10.25 14.5h6.25" />
    <circle cx={7} cy={5.5} r={1.75} />
    <circle cx={13} cy={10} r={1.75} />
    <circle cx={8.5} cy={14.5} r={1.75} />
  </Icon>
)

export const CopyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x={7} y={7} width={9.25} height={9.25} rx={1.75} />
    <path d="M13 7V5.25a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5v6.25a1.5 1.5 0 0 0 1.5 1.5H7" />
  </Icon>
)

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
)

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 8 10 13.5 15.5 8" />
  </Icon>
)

/** Today, the home page: a sun with its rays. */
export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx={10} cy={10} r={3.25} />
    <path d="M10 2.75v1.5M10 15.75v1.5M2.75 10h1.5M15.75 10h1.5M4.87 4.87l1.06 1.06M14.07 14.07l1.06 1.06M4.87 15.13l1.06-1.06M14.07 5.93l1.06-1.06" />
  </Icon>
)

/** Sign out: a door with an arrow leaving it. */
export const SignOutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8.25 16.25h-3a1.5 1.5 0 0 1-1.5-1.5v-9.5a1.5 1.5 0 0 1 1.5-1.5h3" />
    <path d="M12.5 6.5 16 10l-3.5 3.5M16 10H8" />
  </Icon>
)

/** Opens somewhere else, such as a page in a new tab: an arrow out of a box. */
export const ExternalIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5M14.5 11.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4" />
  </Icon>
)
