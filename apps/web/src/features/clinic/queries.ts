import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Clinic, ClinicInput } from './types'

const key = ['clinic'] as const

/**
 * The clinic's settings. They rarely change, so they're kept for 10 minutes before being
 * asked for again; the calendar and the booking forms all share this one cached copy.
 */
export function useClinic() {
  return useQuery({
    queryKey: key,
    queryFn: () => api<Clinic>('/clinic'),
    staleTime: 10 * 60_000,
  })
}

/** Saves some of the settings (admins only). The answer is the whole updated clinic. */
export function useUpdateClinic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ClinicInput) => api<Clinic>('/clinic', { method: 'PATCH', json: input }),
    // Put the saved settings straight into the cache, so the calendar changes at once.
    onSuccess: (clinic) => queryClient.setQueryData(key, clinic),
  })
}
