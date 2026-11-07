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
