import type { StaffRole } from '../auth/authStore'

/** One staff account, as GET /staff returns it. */
export type StaffMember = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: StaffRole
  isActive: boolean
  /** While this is in the future, the account is locked after too many wrong passwords. */
  lockedUntil: string | null
  mustChangePassword: boolean
  createdAt: string
  /** The moment of their latest successful sign-in, or null if they never have. */
  lastSignInAt: string | null
}

/** What GET /staff can be asked, kept in the address bar so a filtered list can be shared. */
export type StaffStatus = 'active' | 'deactivated' | 'all'
export type StaffSort = 'name' | 'role' | 'lastSignInAt'
export type StaffQuery = {
  search: string
  status: StaffStatus
  role: StaffRole | ''
  sort: StaffSort
  dir: 'asc' | 'desc'
}

export type NewStaffInput = {
  email: string
  firstName: string
  lastName: string
  role: StaffRole
}

export type StaffChanges = Partial<Pick<StaffMember, 'firstName' | 'lastName' | 'role' | 'isActive'>>

/** Answer to creating an account or resetting a password. Shown once, never stored. */
export type TemporaryPassword = { temporaryPassword: string }
