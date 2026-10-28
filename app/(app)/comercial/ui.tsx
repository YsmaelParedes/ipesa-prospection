import { useEffect, useState } from 'react'
import { cleanAddress, parseColonia } from '@/lib/address'
import type { CommercialContact, DayCounts, Goals } from '@/lib/commercial'

export { PriorityChip, StatusChip, fmtDay, nextLabel } from '@/components/CommercialUI'

export type Member = { user_id: string; name: string; role: string }

/** Contacto en las listas: con el monto de su última cotización cuando la tiene. */
export type ListContact = CommercialContact & { quote_amount?: number | null }

/** GET /api/data/commercial — la lista de "Hoy". */
export type TodayData = {
  today: string; uid: string; isAdmin: boolean; salesTeam: boolean
  zones: string[]; segments: string[]; goals: Goals; counts: DayCounts
  due: ListContact[]; fresh: ListContact[]; freshTotal: number; offset: number
  /** Sin teléfono ("Para visita"): los primeros y cuántos hay. */
  visit: ListContact[]; visitTotal: number
}

export const money = (n: number | string | null | undefined) => `$${Number(n || 0).toLocaleString('es-MX')}`
export const pct = (n: number) => `${Math.round(n * 100)} %`

/** Negocio: la empresa si la hay; si no, el nombre. */
export const bizName = (c: Pick<CommercialContact, 'company' | 'name'>) => c.company?.trim() || c.name
/** Contacto: el nombre cuando el negocio es la empresa. */
export const personName = (c: Pick<CommercialContact, 'company' | 'name'>) => (c.company?.trim() && c.company.trim() !== c.name ? c.name : '')
export const coloniaOf = (c: Pick<CommercialContact, 'colonia' | 'address'>) => c.colonia?.trim() || parseColonia(c.address) || ''
export const addressOf = (c: Pick<CommercialContact, 'address'>) => cleanAddress(c.address)

/** Iniciales del negocio para el cuadrito de color. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w.length > 2 || /\d/.test(w))
  return ((words[0]?.[0] ?? name[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase()
}

/** Pantalla ancha (computadora): lista y ficha lado a lado. */
export function useWide(min = 1100): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${min}px)`)
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [min])
  return wide
}

const svg = (d: React.ReactNode, size = 14) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flexShrink: 0 }} aria-hidden="true">{d}</svg>
)
export const Ico = {
  close:    () => svg(<path d="M18 6 6 18M6 6l12 12" />, 18),
  phone:    ({ size = 15 }: { size?: number } = {}) => svg(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z" />, size),
  chat:     ({ size = 15 }: { size?: number } = {}) => svg(<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" />, size),
  pin:      ({ size = 14 }: { size?: number } = {}) => svg(<><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>, size),
  mail:     () => svg(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>),
  search:   () => svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, 16),
  check:    () => svg(<path d="m5 13 4 4L19 7" />),
  user:     () => svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  next:     () => svg(<path d="M5 12h14M13 6l6 6-6 6" />),
  calendar: () => svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  edit:     () => svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>),
}
