import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { StaffRole } from '../auth/authStore'
import type { FdiCode } from './model/fdi'
import type { Condition, Surface } from './model/status'

// The shapes the API sends back. They mirror apps/api/src/chart/chart.service.ts.

export type ChartRecord = {
  id: string
  tooth: FdiCode
  /** Empty only on a correction that withdrew an entry. */
  condition: Condition | null
  surfaces: Surface[]
  note: string | null
  recordedAt: string
  createdAt: string
  correctsId: string | null
  correctionReason: string | null
  recordedBy: { id: string; firstName: string; lastName: string; role: StaffRole }
  appointment: { id: string; startsAt: string; endsAt: string } | null
  /** The correction that replaced this entry, if it was wrong. */
  correctedBy: { id: string } | null
}

export type ToothNow = { condition: Condition; surfaces: Surface[]; recordId: string; recordedAt: string }

export type Chart = { teeth: Partial<Record<FdiCode, ToothNow>>; records: ChartRecord[] }

export type NewFinding = {
  tooth: FdiCode
  condition: Condition
  surfaces: Surface[]
  note?: string
  appointmentId?: string
}

export type Correction = { condition: Condition | null; surfaces: Surface[]; note?: string; reason: string }

const chartKey = (patientId: string) => ['chart', patientId] as const

/** "Dr. Jose Santos" for a dentist, the plain name for anyone else. */
export function recordedByName(record: ChartRecord) {
  const { firstName, lastName, role } = record.recordedBy
  return role === 'DENTIST' ? `Dr. ${firstName} ${lastName}` : `${firstName} ${lastName}`
}

/**
 * Each tooth as it is now. The same rule as the API's currentTeeth(): newest finding first,
 * corrected entries don't count, and a withdrawn entry leaves the tooth as it was before it.
 */
export function currentTeeth(records: ChartRecord[]) {
  const ordered = [...records].sort(
    (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
  const teeth: Chart['teeth'] = {}
  for (const record of ordered) {
    if (record.correctedBy || record.condition === null || teeth[record.tooth]) continue
    teeth[record.tooth] = { condition: record.condition, surfaces: record.surfaces, recordId: record.id, recordedAt: record.recordedAt }
  }
  return teeth
}

/** Opening a chart is logged as a look at the patient's record, so it isn't refetched needlessly. */
export function useChart(patientId: string) {
  return useQuery({ queryKey: chartKey(patientId), queryFn: () => api<Chart>(`/patients/${patientId}/chart`) })
}

/**
 * Adds a new entry to the chart on screen without fetching it again (which would log another
 * look). A correction also marks the entry it replaces.
 */
function useAddToChart(patientId: string) {
  const queryClient = useQueryClient()
  return (record: ChartRecord) => {
    queryClient.setQueryData<Chart>(chartKey(patientId), (chart) => {
      if (!chart) return chart
      const records = [
        record,
        ...chart.records.map((entry) => (entry.id === record.correctsId ? { ...entry, correctedBy: { id: record.id } } : entry)),
      ]
      return { records, teeth: currentTeeth(records) }
    })
    void queryClient.invalidateQueries({ queryKey: ['patients', 'history', patientId] })
  }
}

export function useRecordFinding(patientId: string) {
  const add = useAddToChart(patientId)
  return useMutation({
    mutationFn: (finding: NewFinding) => api<ChartRecord>(`/patients/${patientId}/chart/records`, { method: 'POST', json: finding }),
    onSuccess: add,
  })
}

export function useCorrectEntry(patientId: string) {
  const add = useAddToChart(patientId)
  return useMutation({
    mutationFn: ({ recordId, ...correction }: Correction & { recordId: string }) =>
      api<ChartRecord>(`/patients/${patientId}/chart/records/${recordId}/correct`, { method: 'POST', json: correction }),
    onSuccess: add,
  })
}
