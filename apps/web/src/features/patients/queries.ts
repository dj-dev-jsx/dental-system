import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { AuditEntry, Page, Patient, PatientInput, PatientListQuery, PatientSummary } from './types'

// React Query keeps server data in a cache, keyed by these arrays. A screen asks for a key;
// if it's cached and fresh it shows at once, otherwise it's fetched. After a change we
// update or "invalidate" the affected keys so every screen shows the new data.
const keys = {
  lists: ['patients', 'list'] as const,
  list: (query: PatientListQuery) => ['patients', 'list', query] as const,
  one: (id: string) => ['patients', 'one', id] as const,
  history: (id: string) => ['patients', 'history', id] as const,
}

/** `enabled: false` waits, such as until something is typed in a search box. */
export function usePatients(query: PatientListQuery, { enabled = true } = {}) {
  const params = new URLSearchParams({ page: String(query.page) })
  if (query.search) params.set('search', query.search)
  if (query.archived) params.set('archived', 'true')
  return useQuery({
    queryKey: keys.list(query),
    queryFn: () => api<Page<PatientSummary>>(`/patients?${params}`),
    // Keeps showing the last results while the next search or page loads, instead of a blank.
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Opening a record is logged by the API, so this isn't refetched more than it needs to be. */
export function usePatient(id: string) {
  return useQuery({ queryKey: keys.one(id), queryFn: () => api<Patient>(`/patients/${id}`) })
}

/** The audit log for one patient. Admins only: the API refuses everyone else. */
export function usePatientHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.history(id),
    queryFn: () => api<Page<AuditEntry>>(`/audit-logs?entityId=${id}&limit=50`),
    enabled,
  })
}

export function useCreatePatient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PatientInput) => api<Patient>('/patients', { method: 'POST', json: input }),
    onSuccess: (patient) => {
      // Cache the new record, so opening it next doesn't need another request.
      queryClient.setQueryData(keys.one(patient.id), patient)
      void queryClient.invalidateQueries({ queryKey: keys.lists })
    },
  })
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PatientInput) => api<Patient>(`/patients/${id}`, { method: 'PATCH', json: input }),
    onSuccess: (patient) => {
      queryClient.setQueryData(keys.one(id), patient)
      void queryClient.invalidateQueries({ queryKey: keys.lists })
      void queryClient.invalidateQueries({ queryKey: keys.history(id) })
    },
  })
}

export function useSetArchived(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (archive: boolean) =>
      api(`/patients/${id}/${archive ? 'archive' : 'restore'}`, { method: 'POST' }),
    onSuccess: (_result, archive) => {
      // Updated here rather than fetched again, because every fetch is logged as a view.
      queryClient.setQueryData<Patient>(keys.one(id), (patient) =>
        patient && { ...patient, archivedAt: archive ? new Date().toISOString() : null },
      )
      void queryClient.invalidateQueries({ queryKey: keys.lists })
      void queryClient.invalidateQueries({ queryKey: keys.history(id) })
    },
  })
}
