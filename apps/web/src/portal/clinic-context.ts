import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect } from 'react'
import { type ClinicInfo, portalApi } from './api'

type ClinicContextValue = { clinic: ClinicInfo }

export const ClinicContext = createContext<ClinicContextValue | null>(null)

/** The clinic's booking details (name, hours, dentists), for every patient page. */
export function useClinic(): ClinicContextValue {
  const value = useContext(ClinicContext)
  if (!value) throw new Error('useClinic is only for the patient pages')
  return value
}

export const clinicKey = () => ['portal', 'info'] as const

export function useClinicInfo() {
  return useQuery({ queryKey: clinicKey(), queryFn: () => portalApi.info(), staleTime: 5 * 60_000 })
}

/** Sets the tab's title to "Page · Clinic name". */
export function usePortalTitle(title: string) {
  const { clinic } = useClinic()
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · ${clinic.name}`
    return () => {
      document.title = previous
    }
  }, [title, clinic.name])
}
