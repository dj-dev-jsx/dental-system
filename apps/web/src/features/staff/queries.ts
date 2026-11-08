import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { NewStaffInput, StaffChanges, StaffMember, StaffQuery, TemporaryPassword } from './types'

const key = ['staff'] as const

/** All staff accounts. Admins only: the API refuses everyone else. */
export function useStaff(query: StaffQuery) {
  return useQuery({
    queryKey: [...key, query],
    queryFn: () => {
      const params = new URLSearchParams({ status: query.status, sort: query.sort, dir: query.dir })
      if (query.search) params.set('search', query.search)
      if (query.role) params.set('role', query.role)
      return api<{ items: StaffMember[] }>(`/staff?${params}`)
    },
    // Keep showing the old rows (dimmed) while a new filter loads, instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  })
}

// Every change refetches the list, so the table (and the status words in it) stay true.
function useRefresh() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: key })
}

/**
 * The temporary passwords these calls return are handed to the screen once and are NOT
 * written to the query cache: mutation results are only kept in the mutation itself, and the
 * mutation is dropped (gcTime 0) as soon as the screen that used it goes away, so the
 * password isn't kept around in memory.
 */
export function useCreateStaff() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: NewStaffInput) =>
      api<{ user: StaffMember } & TemporaryPassword>('/staff', { method: 'POST', json: input }),
    onSuccess: refresh,
    gcTime: 0,
  })
}

export function useUpdateStaff() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: StaffChanges }) =>
      api<StaffMember>(`/staff/${id}`, { method: 'PATCH', json: changes }),
    onSuccess: refresh,
  })
}

export function useResetPassword() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) => api<TemporaryPassword>(`/staff/${id}/reset-password`, { method: 'POST' }),
    onSuccess: refresh,
    gcTime: 0,
  })
}

export function useUnlockStaff() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) => api<StaffMember>(`/staff/${id}/unlock`, { method: 'POST' }),
    onSuccess: refresh,
  })
}
