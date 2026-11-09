import { useEffect, useState } from 'react'
import { api } from './api'

/** The clinic's public details, from GET /site. Hours are minutes after midnight, Philippine time. */
export type Site = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  opensAt: number
  closesAt: number
  onlineBookingEnabled: boolean
}

let cached: Promise<Site> | null = null

/** Asks GET /site once per page load and shares the answer. Rejects if the server can't be reached. */
export function loadSite(): Promise<Site> {
  cached ??= api<Site>('/site').catch((error: unknown) => {
    cached = null // ask again next time
    throw error
  })
  return cached
}

/** The clinic's name, hours and contact details. Null until it answers, or if the server can't be reached. */
export function useSite() {
  const [site, setSite] = useState<Site | null>(null)
  useEffect(() => {
    let live = true
    loadSite()
      .then((value) => live && setSite(value))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return site
}
