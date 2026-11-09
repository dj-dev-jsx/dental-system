import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Patient } from '../patients/types'
import type { AccountMatch, PatientAccount } from './types'

const keys = {
  matches: (accountId: string) => ['patient-accounts', 'matches', accountId] as const,
}

/**
 * Linking or registering changes the account's requests (they get a patient), the patient
 * lists and the record's online account line, so all of those are fetched again. Returned,
 * so the step counts as done only once the request on screen shows the patient.
 */
function refreshAfterLink(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    queryClient.invalidateQueries({ queryKey: ['patients'] }),
    queryClient.invalidateQueries({ queryKey: ['patient-accounts'] }),
  ])
}

/** The account as the person filled it in, with whether they confirmed their email. */
export function usePatientAccount(accountId: string) {
  return useQuery({
    queryKey: ['patient-accounts', 'one', accountId],
    queryFn: () => api<PatientAccount>(`/patient-accounts/${accountId}`),
    staleTime: 0,
  })
}

/** Current patients who might be this account holder: same birth date and a similar name, or the same phone or email. */
export function useAccountMatches(accountId: string, enabled = true) {
  return useQuery({
    queryKey: keys.matches(accountId),
    queryFn: () => api<{ items: AccountMatch[] }>(`/patient-accounts/${accountId}/matches`),
    enabled,
    staleTime: 0,
  })
}

/** "This is them": ties the account to an existing record, and its waiting requests to that patient. */
export function useLinkAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, patientId }: { accountId: string; patientId: string }) =>
      api<PatientAccount>(`/patient-accounts/${accountId}/link`, { method: 'POST', json: { patientId } }),
    onSuccess: () => refreshAfterLink(queryClient),
  })
}

/** Registers the account holder as a new patient from what they typed, and links them. */
export function useCreatePatientFromAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => api<{ patientId: string }>(`/patient-accounts/${accountId}/create-patient`, { method: 'POST' }),
    onSuccess: () => refreshAfterLink(queryClient),
  })
}

/**
 * Admins only: the account stops being this patient's. The record is updated in place rather
 * than fetched again, because opening a record is logged.
 */
export function useUnlinkAccount(patientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => api<PatientAccount>(`/patient-accounts/${accountId}/unlink`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData<Patient>(['patients', 'one', patientId], (patient) => patient && { ...patient, onlineAccount: null })
      void queryClient.invalidateQueries({ queryKey: ['patients', 'history', patientId] })
      void queryClient.invalidateQueries({ queryKey: ['appointments'], predicate: (query) => query.queryKey[1] !== 'one' })
    },
  })
}
