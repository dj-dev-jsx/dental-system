import { FormField } from '../../components/FormField'
import { fieldAria, inputClass, inputErrorClass } from '../../components/forms'
import { dentistName, todayInManila } from '../../lib/format'
import type { FieldErrors } from './appointmentInput'
import type { Dentist } from './types'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180]

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = [hours === 1 ? '1 hour' : hours > 1 ? `${hours} hours` : '', rest ? `${rest} minutes` : '']
  return parts.filter(Boolean).join(' ')
}

const selectClass = (error?: string) => `${error ? inputErrorClass : inputClass} pr-8`

type DentistProps = {
  /** Keeps ids unique when several forms share a page, like the request list. */
  idPrefix?: string
  dentists: Dentist[]
  defaultValue?: string
  /** The appointment's dentist, shown even if they've since left the clinic. */
  current?: Dentist | null
  error?: string
}

export function DentistField({ idPrefix = '', dentists, defaultValue = '', current, error }: DentistProps) {
  const id = `${idPrefix}dentistId`
  const options = current && !dentists.some((dentist) => dentist.id === current.id) ? [...dentists, current] : dentists
  return (
    <FormField id={id} label="Dentist" error={error}>
      <select id={id} name="dentistId" defaultValue={defaultValue} className={selectClass(error)} {...fieldAria(id, error)}>
        <option value="" disabled>
          Choose a dentist
        </option>
        {options.map((dentist) => (
          <option key={dentist.id} value={dentist.id}>
            {dentistName(dentist)}
          </option>
        ))}
      </select>
    </FormField>
  )
}

type WhenProps = {
  idPrefix?: string
  defaults: { date: string; time: string; duration: number }
  errors: FieldErrors
}

/** Date, start time and length. Times are Philippine time, whatever this computer is set to. */
export function WhenFields({ idPrefix = '', defaults, errors }: WhenProps) {
  const durations = DURATIONS.includes(defaults.duration)
    ? DURATIONS
    : [...DURATIONS, defaults.duration].sort((a, b) => a - b)
  const ids = { date: `${idPrefix}date`, time: `${idPrefix}time`, duration: `${idPrefix}duration` }
  return (
    <>
      <FormField id={ids.date} label="Date" error={errors.date}>
        <input
          id={ids.date}
          name="date"
          type="date"
          min={todayInManila()}
          defaultValue={defaults.date}
          className={errors.date ? inputErrorClass : inputClass}
          {...fieldAria(ids.date, errors.date)}
        />
      </FormField>
      <FormField id={ids.time} label="Start time" error={errors.time}>
        <input
          id={ids.time}
          name="time"
          type="time"
          step={300}
          defaultValue={defaults.time}
          className={errors.time ? inputErrorClass : inputClass}
          {...fieldAria(ids.time, errors.time)}
        />
      </FormField>
      <FormField id={ids.duration} label="Length" error={errors.duration}>
        <select
          id={ids.duration}
          name="duration"
          defaultValue={String(defaults.duration)}
          className={selectClass(errors.duration)}
          {...fieldAria(ids.duration, errors.duration)}
        >
          {durations.map((minutes) => (
            <option key={minutes} value={minutes}>
              {durationLabel(minutes)}
            </option>
          ))}
        </select>
      </FormField>
    </>
  )
}
