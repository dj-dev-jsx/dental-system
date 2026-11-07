import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { FormField } from '../../components/FormField'
import { fieldAria, inputClass, inputErrorClass } from '../../components/forms'
import { SearchIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { formatDate, fullName, listName } from '../../lib/format'
import { usePatients } from '../patients/queries'

/** The patient a new booking is for, as the picker shows them. */
export type ChosenPatient = { id: string; name: string; detail: string }

type PickerProps = {
  chosen: ChosenPatient | null
  onChoose: (patient: ChosenPatient | null) => void
  error?: string
}

/** Finds the patient by name or mobile number. Archived patients can't be booked, so they aren't listed. */
export function PatientPicker({ chosen, onChoose, error }: PickerProps) {
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const changeRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const moveFocus = useRef<'change' | 'search' | null>(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    // After choosing or clearing, keep the cursor where the person is working.
    if (moveFocus.current === 'change') changeRef.current?.focus()
    if (moveFocus.current === 'search') searchRef.current?.focus()
    moveFocus.current = null
  }, [chosen])

  const results = usePatients({ search, page: 1, archived: false }, { enabled: search.length > 0 })

  // Waits until typing pauses, so each keystroke isn't its own search (and audit log line).
  function changeSearch(value: string) {
    setDraft(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSearch(value.trim()), 300)
  }

  if (chosen) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{chosen.name}</p>
          {chosen.detail && <p className="text-sm text-neutral-600">{chosen.detail}</p>}
        </div>
        <button
          ref={changeRef}
          type="button"
          onClick={() => {
            moveFocus.current = 'search'
            onChoose(null)
          }}
          className={`${buttonOutline} h-9 px-4 text-sm`}
        >
          Choose another patient
        </button>
      </div>
    )
  }

  const items = results.data?.items.slice(0, 6) ?? []
  return (
    <div className="max-w-xl">
      <FormField id="patient-search" label="Find the patient" hint="Type part of their name or mobile number." error={error}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500" />
          <input
            ref={searchRef}
            id="patient-search"
            type="search"
            value={draft}
            onChange={(event) => changeSearch(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={`${error ? inputErrorClass : inputClass} pl-10`}
            {...fieldAria('patient-search', error, 'hint')}
          />
        </div>
      </FormField>

      <div aria-live="polite">
        {search && results.isError && <ErrorBox className="mt-3">{errorMessage(results.error)}</ErrorBox>}
        {search && results.data && (
          items.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">
              No current patients match “{search}”.{' '}
              <Link to="/app/patients/new" className="font-semibold text-neutral-950 underline underline-offset-3">
                Register a new patient
              </Link>
            </p>
          ) : (
            <ul className={`mt-3 border-t border-neutral-950 ${results.isPlaceholderData ? 'opacity-50' : ''}`} aria-label="Matching patients">
              {items.map((patient) => {
                const detail = [`Born ${formatDate(patient.birthDate)}`, patient.phone].filter(Boolean).join(' · ')
                return (
                  <li key={patient.id} className="border-b border-neutral-200">
                    <button
                      type="button"
                      onClick={() => {
                        moveFocus.current = 'change'
                        onChoose({ id: patient.id, name: fullName(patient), detail })
                      }}
                      className="flex w-full flex-wrap items-baseline justify-between gap-x-4 px-2 py-2.5 text-left outline-neutral-950 hover:bg-neutral-50 focus-visible:outline-2"
                    >
                      <span className="font-semibold">{listName(patient)}</span>
                      <span className="text-sm text-neutral-600">{detail}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        )}
        {search && results.data && results.data.total > items.length && (
          <p className="mt-2 text-sm text-neutral-500">More patients match. Type more of the name to narrow it down.</p>
        )}
      </div>
    </div>
  )
}
