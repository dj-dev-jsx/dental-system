/** The clinic's settings, as GET /clinic returns them. */
export type Clinic = {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  /** Opening and closing time, in minutes after midnight, Philippine time (420 = 7:00 AM). */
  opensAt: number
  closesAt: number
  /** How long a new appointment lasts unless staff pick another length, in minutes. */
  defaultVisitMinutes: number
  /** When the settings were last saved. */
  updatedAt: string
}

/** What PATCH /clinic accepts: any of the fields, only the ones that changed. */
export type ClinicInput = Partial<Omit<Clinic, 'id' | 'updatedAt'>>
