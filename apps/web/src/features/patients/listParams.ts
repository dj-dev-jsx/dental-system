import { useLocation } from 'react-router'
import type { PatientSort, SortDirection } from './types'

// The patients workspace keeps the list's search, sort and Current/Archived view in the
// address (?search=…&sort=…&dir=…&archived=true). The record beside the list shares that
// address, so every link inside the workspace carries the query string along, and the list
// is still as you left it when you come back to it.

/** The first pick of a sort reads the way people expect: A to Z, soonest first, latest visit first. */
export const FIRST_DIRECTION: Record<PatientSort, SortDirection> = { name: 'asc', nextAppointment: 'asc', lastVisit: 'desc' }
export const SORT_LABELS: Record<PatientSort, string> = { name: 'Name', nextAppointment: 'Next appointment', lastVisit: 'Last visit' }
const SORTS = Object.keys(FIRST_DIRECTION) as PatientSort[]

export function readListParams(params: URLSearchParams) {
  const search = params.get('search')?.trim() ?? ''
  const archived = params.get('archived') === 'true'
  const sortParam = params.get('sort') as PatientSort | null
  const sort: PatientSort = sortParam && SORTS.includes(sortParam) ? sortParam : 'name'
  const dirParam = params.get('dir')
  const dir: SortDirection = dirParam === 'asc' || dirParam === 'desc' ? dirParam : FIRST_DIRECTION[sort]
  return { search, archived, sort, dir }
}

/** Turns a workspace path into a link that keeps the list's search, sort and view. */
export function useWorkspaceLink() {
  const { search } = useLocation()
  return (path: string) => `${path}${search}`
}
