import { type Ref, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertIcon, ArrowRightIcon, CloseIcon, PlusIcon, SearchIcon } from '../components/icons'
import { usePatients } from '../features/patients/queries'
import type { PatientSummary } from '../features/patients/types'
import { ageLabel, fullName } from '../lib/format'

const SHOWN = 6
const MIN_LENGTH = 2

type Option = { kind: 'patient'; patient: PatientSummary } | { kind: 'all' } | { kind: 'new' }

/** Waits until typing pauses, so each key press isn't a request (and a logged search). */
function useDebounced(value: string, ms: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return settled
}

type Props = {
  /** Lets the top bar focus the box from the "/" shortcut. */
  inputRef?: Ref<HTMLInputElement>
  autoFocus?: boolean
  /** Phones: a way to fold the box away again. */
  onClose?: () => void
}

/**
 * Find a patient from anywhere: by name or phone, as a combobox. Up to six matches drop down
 * under the box; Enter opens the highlighted one, or the full list when none is highlighted.
 */
export function GlobalSearch({ inputRef, autoFocus = false, onClose }: Props) {
  const navigate = useNavigate()
  const id = useId()
  const listId = `${id}-list`
  const root = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const settled = useDebounced(text.trim(), 250)
  const term = settled.length >= MIN_LENGTH ? settled : ''
  const results = usePatients({ search: term, page: 1, archived: false, sort: 'name', dir: 'asc' }, { enabled: term !== '' })

  const typed = text.trim().length >= MIN_LENGTH
  // Still typing, or the answer for the last search is still on screen while the next loads.
  const waiting = typed && (text.trim() !== settled || results.isFetching)
  const patients = term && results.data && !results.isPlaceholderData ? results.data.items.slice(0, SHOWN) : []
  const answered = Boolean(term && results.isSuccess && !results.isPlaceholderData && text.trim() === settled)
  const options: Option[] = answered
    ? patients.length > 0
      ? [...patients.map((patient) => ({ kind: 'patient' as const, patient })), { kind: 'all' as const }]
      : [{ kind: 'new' as const }]
    : []
  const showList = open && typed

  // A new answer starts with nothing highlighted, so Enter means "see all".
  const [lastAnswer, setLastAnswer] = useState(results.data)
  if (results.data !== lastAnswer) {
    setLastAnswer(results.data)
    setActive(-1)
  }

  function reset() {
    setText('')
    setOpen(false)
    setActive(-1)
  }

  function choose(option: Option | undefined) {
    const search = text.trim()
    if (!option) {
      if (search.length < MIN_LENGTH) return
      navigate(`/app/patients?${new URLSearchParams({ search })}`)
    } else if (option.kind === 'patient') navigate(`/app/patients/${option.patient.id}`)
    else if (option.kind === 'all') navigate(`/app/patients?${new URLSearchParams({ search })}`)
    else navigate('/app/patients/new')
    reset()
    onClose?.()
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (options.length === 0) return
      const by = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        const next = current + by
        if (next < -1) return options.length - 1
        if (next >= options.length) return -1
        return next
      })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(active >= 0 ? options[active] : undefined)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (showList) setOpen(false)
      else if (text) reset()
      else onClose?.()
    }
  }

  const optionId = (index: number) => `${id}-option-${index}`
  const total = results.data?.total ?? 0
  const status = !typed
    ? ''
    : waiting
      ? 'Searching…'
      : results.isError
        ? 'Couldn’t search.'
        : answered
          ? patients.length === 0
            ? 'No patients found.'
            : `${total === 1 ? '1 patient' : `${total} patients`} found.`
          : ''

  return (
    <div
      ref={root}
      className="relative w-full"
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
          setActive(-1)
        }
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        Search patients by name or phone
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-neutral-500" />
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder="Search patients by name or phone"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="peer h-10 w-full rounded-md border border-transparent bg-neutral-100 pr-10 pl-10 text-[0.9375rem] text-neutral-950 transition-colors duration-150 outline-none placeholder:text-neutral-500 hover:bg-neutral-200/70 focus:border-neutral-950 focus:bg-white focus:ring-3 focus:ring-neutral-950/10 [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button
          type="button"
          onClick={() => {
            reset()
            root.current?.querySelector('input')?.focus()
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded text-neutral-500 outline-neutral-950 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2"
        >
          <CloseIcon className="size-4" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 hidden h-5 min-w-5 -translate-y-1/2 place-items-center rounded-sm border border-neutral-300 bg-white px-1 font-sans text-xs font-medium text-neutral-500 peer-focus:hidden lg:grid"
        >
          /
        </kbd>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {/* The list is always in the page, so aria-controls points at something; it's hidden while closed. */}
      <div
        className={`drop-in absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-md border border-neutral-950 bg-white text-neutral-950 ${showList ? '' : 'hidden'}`}
      >
        {answered && patients.length === 0 && (
          <p className="px-3 pt-3 pb-1 text-sm text-neutral-600">
            No patients match “{text.trim()}”. Check the spelling, or try a phone number.
          </p>
        )}
        <ul id={listId} role="listbox" aria-label="Patients" className="py-1">
          {options.map((option, index) => (
            <li
              key={option.kind === 'patient' ? option.patient.id : option.kind}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // Keeps focus in the box, so the list doesn't close before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option)}
              className={`cursor-pointer px-3 ${index === active ? 'bg-neutral-100' : ''} ${option.kind !== 'patient' ? 'mt-1 border-t border-neutral-200' : ''}`}
            >
              {option.kind === 'patient' ? (
                <div className="flex items-baseline gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{fullName(option.patient)}</span>
                  <span className="shrink-0 text-sm text-neutral-500 tabular-nums">
                    {ageLabel(option.patient.birthDate)}
                    {option.patient.phone && <span className="hidden sm:inline"> · {option.patient.phone}</span>}
                  </span>
                </div>
              ) : option.kind === 'all' ? (
                <div className="flex items-center gap-2 py-2.5 text-sm font-semibold">
                  <span className="min-w-0 flex-1 truncate">
                    See all {total > SHOWN ? `${total} ` : ''}results for “{text.trim()}”
                  </span>
                  <ArrowRightIcon className="size-4 shrink-0" />
                </div>
              ) : (
                <div className="flex items-center gap-2 py-2.5 text-sm font-semibold">
                  <PlusIcon className="size-4 shrink-0" />
                  <span>Register a new patient</span>
                </div>
              )}
            </li>
          ))}
        </ul>
        {!answered && !results.isError && (
          <div className="space-y-2.5 px-3 py-3" aria-hidden="true">
            <div className="h-4 w-3/5 rounded-sm bg-neutral-100" />
            <div className="h-4 w-2/5 rounded-sm bg-neutral-100" />
          </div>
        )}
        {results.isError && !waiting && (
          <div className="flex items-start gap-3 px-3 py-3 text-sm">
            <AlertIcon className="mt-0.5 shrink-0" />
            <p className="min-w-0 flex-1">Couldn’t search. Check the connection and try again.</p>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void results.refetch()}
              className="shrink-0 font-semibold underline underline-offset-3 outline-neutral-950 focus-visible:outline-2"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
