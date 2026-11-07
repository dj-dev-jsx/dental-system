import { keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Appointment, AppointmentChanges, Dentist, NewAppointment } from './types'

type Range = { from: string; to: string; dentistId: string }

const keys = {
  all: ['appointments'] as const,
  schedule: (range: Range) => ['appointments', 'schedule', range] as const,
  requests: ['appointments', 'requests'] as const,
  requestCount: ['appointments', 'requestCount'] as const,
  one: (id: string) => ['appointments', 'one', id] as const,
  patient: (patientId: string) => ['appointments', 'patient', patientId] as const,
  dentists: ['dentists'] as const,
}

/**
 * After any change, every list that might show the appointment is fetched again. The
 * appointment itself is updated from the answer instead, because fetching it is logged.
 * Returned, so a change counts as done only once the calendar shows it.
 */
function refreshAfterChange(queryClient: QueryClient, appointment: Appointment) {
  queryClient.setQueryData(keys.one(appointment.id), appointment)
  return queryClient.invalidateQueries({
    queryKey: keys.all,
    predicate: (query) => query.queryKey[1] !== 'one',
  })
}

/** Confirmed appointments and waiting requests on these Philippine dates (both included). */
export function useSchedule(range: Range) {
  const params = new URLSearchParams({ from: range.from, to: range.to, status: 'REQUESTED,CONFIRMED' })
  if (range.dentistId) params.set('dentistId', range.dentistId)
  return useQuery({
    queryKey: keys.schedule(range),
    queryFn: () => api<{ items: Appointment[] }>(`/appointments?${params}`),
    // Keeps the last days on screen while the next ones load, instead of flashing empty.
    placeholderData: keepPreviousData,
  })
}

export function useRequests() {
  return useQuery({
    queryKey: keys.requests,
    queryFn: () => api<{ items: Appointment[]; total: number }>('/appointments/requests'),
  })
}

/** How many requests are waiting, checked every minute for the number in the menu. */
export function useRequestCount() {
  return useQuery({
    queryKey: keys.requestCount,
    queryFn: () => api<{ count: number }>('/appointments/requests/count'),
    refetchInterval: 60_000,
  })
}

export function useAppointment(id: string) {
  return useQuery({ queryKey: keys.one(id), queryFn: () => api<Appointment>(`/appointments/${id}`) })
}

export function usePatientAppointments(patientId: string) {
  return useQuery({
    queryKey: keys.patient(patientId),
    queryFn: () => api<{ items: Appointment[] }>(`/patients/${patientId}/appointments`),
  })
}

/** The clinic's dentists rarely change, so this list is kept for ten minutes. */
export function useDentists() {
  return useQuery({
    queryKey: keys.dentists,
    queryFn: () => api<{ items: Dentist[] }>('/dentists'),
    staleTime: 10 * 60_000,
  })
}

function useAppointmentMutation<Input>(send: (input: Input) => Promise<Appointment>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: (appointment) => refreshAfterChange(queryClient, appointment),
  })
}

export const useCreateAppointment = () =>
  useAppointmentMutation((input: NewAppointment) =>
    api<Appointment>('/appointments', { method: 'POST', json: input }),
  )

export const useUpdateAppointment = () =>
  useAppointmentMutation(({ id, ...changes }: AppointmentChanges & { id: string }) =>
    api<Appointment>(`/appointments/${id}`, { method: 'PATCH', json: changes }),
  )

/** Confirms a request, possibly at another time or with another dentist. */
export const useConfirmAppointment = () =>
  useAppointmentMutation(({ id, ...changes }: { id: string; dentistId: string; startsAt: string; endsAt: string }) =>
    api<Appointment>(`/appointments/${id}/confirm`, { method: 'POST', json: changes }),
  )

/** Declines a request or cancels an appointment, with an optional note saying why. */
export const useCloseAppointment = () =>
  useAppointmentMutation(({ id, action, note }: { id: string; action: 'decline' | 'cancel'; note?: string }) =>
    api<Appointment>(`/appointments/${id}/${action}`, { method: 'POST', json: note ? { note } : {} }),
  )
