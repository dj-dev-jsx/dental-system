import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, notifySessionEnded } from '../../lib/api'
import type { Scan, ScanInput, ScanPin, ScanPins, ScanViewSettings, ScanViewSettingsInput } from './types'

// Nothing here imports three.js, so the patient record can use it without loading the viewer.

const key = (patientId: string) => ['scans', patientId] as const

export function useScans(patientId: string) {
  return useQuery({
    queryKey: key(patientId),
    queryFn: () => api<{ items: Scan[] }>(`/patients/${patientId}/scans`).then((r) => r.items),
  })
}

const pinsKey = (patientId: string, scanId: string) => ['scans', patientId, 'pins', scanId] as const

/** The teeth marked on a scan. Anyone on staff can read them. */
export function useScanPins(patientId: string, scanId: string, enabled = true) {
  return useQuery({
    queryKey: pinsKey(patientId, scanId),
    queryFn: () => api<ScanPins>(`/patients/${patientId}/scans/${scanId}/pins`),
    enabled,
  })
}

/** Replaces all the marked teeth on a scan at once. */
export function useSaveScanPins(patientId: string, scanId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (pins: ScanPin[]) => api<ScanPins>(`/patients/${patientId}/scans/${scanId}/pins`, { method: 'PUT', json: { pins } }),
    onSuccess: (saved) => {
      client.setQueryData(pinsKey(patientId, scanId), saved)
      client.setQueryData<Scan[]>(key(patientId), (old) => old?.map((s) => (s.id === scanId ? { ...s, pinCount: saved.items.length } : s)))
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: key(patientId) })
    },
  })
}

const viewKey = (patientId: string, scanId: string) => ['scans', patientId, 'view', scanId] as const

/** How the scan is shown when it opens. Anyone on staff can read it. */
export function useScanViewSettings(patientId: string, scanId: string) {
  return useQuery({
    queryKey: viewKey(patientId, scanId),
    queryFn: () => api<ScanViewSettings>(`/patients/${patientId}/scans/${scanId}/view-settings`),
  })
}

/** Saves how the scan is shown, for everyone (dentists and admins). */
export function useSaveScanViewSettings(patientId: string, scanId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (settings: ScanViewSettingsInput) =>
      api<ScanViewSettings>(`/patients/${patientId}/scans/${scanId}/view-settings`, { method: 'PUT', json: settings }),
    onSuccess: (saved) => client.setQueryData(viewKey(patientId, scanId), saved),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: key(patientId) })
    },
  })
}

export function scanFileUrl(patientId: string, scanId: string) {
  return `/api/v1/patients/${patientId}/scans/${scanId}/file`
}

export function useWithdrawScan(patientId: string, scanId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => api<Scan>(`/patients/${patientId}/scans/${scanId}/withdraw`, { method: 'POST', json: { reason } }),
    onSuccess: (scan) => replaceScan(client, patientId, scan),
    onError: (error) => {
      // Someone else withdrew it first: show it as withdrawn.
      if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: key(patientId) })
    },
  })
}

function replaceScan(client: ReturnType<typeof useQueryClient>, patientId: string, scan: Scan) {
  client.setQueryData<Scan[]>(key(patientId), (old) => (old ? old.map((s) => (s.id === scan.id ? scan : s)) : old))
}

export function addScanToCache(client: ReturnType<typeof useQueryClient>, patientId: string, scan: Scan) {
  client.setQueryData<Scan[]>(key(patientId), (old) =>
    [scan, ...(old ?? []).filter((s) => s.id !== scan.id)].sort((a, b) => b.scannedOn.localeCompare(a.scannedOn) || b.createdAt.localeCompare(a.createdAt)),
  )
  void client.invalidateQueries({ queryKey: key(patientId) })
}

/**
 * Sends the file with a real progress report (fetch can't report uploads, XMLHttpRequest can).
 * Same address and cookie as the rest of the API. Abort the signal to cancel.
 */
export function uploadScan(patientId: string, input: ScanInput, onProgress: (sent: number, total: number) => void, signal: AbortSignal): Promise<Scan> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('title', input.title)
    if (input.note) form.append('note', input.note)
    if (input.scannedOn) form.append('scannedOn', input.scannedOn)
    form.append('file', input.file, input.file.name) // last, so the server has the fields first

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/v1/patients/${patientId}/scans`)
    xhr.responseType = 'text'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total)
    }
    xhr.onload = () => {
      let body: unknown
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = undefined
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(input.file.size, input.file.size)
        resolve(body as Scan)
        return
      }
      if (xhr.status === 401) notifySessionEnded()
      reject(new ApiError(xhr.status, xhr.statusText, body))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Could not reach the server'))
    xhr.ontimeout = () => reject(new ApiError(0, 'Could not reach the server'))
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
    xhr.send(form)
  })
}
