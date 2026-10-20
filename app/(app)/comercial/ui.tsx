import { cleanAddress, parseColonia } from '@/lib/address'
import type { CommercialContact } from '@/lib/commercial'

export { PriorityChip, StatusChip, fmtDay, nextLabel } from '@/components/CommercialUI'

export type Member = { user_id: string; name: string; role: string }
export type CommercialData = {
  today: string; uid: string; salesTeam: boolean
  team: Member[]
  contacts: CommercialContact[]
}

export const money = (n: number | string | null | undefined) => `$${Number(n || 0).toLocaleString('es-MX')}`

/** Negocio: la empresa si la hay; si no, el nombre. */
export const bizName = (c: Pick<CommercialContact, 'company' | 'name'>) => c.company?.trim() || c.name
/** Contacto: el nombre cuando el negocio es la empresa. */
export const personName = (c: Pick<CommercialContact, 'company' | 'name'>) => (c.company?.trim() && c.company.trim() !== c.name ? c.name : '')
export const coloniaOf = (c: Pick<CommercialContact, 'colonia' | 'address'>) => c.colonia?.trim() || parseColonia(c.address) || ''
export const addressOf = (c: Pick<CommercialContact, 'address'>) => cleanAddress(c.address)

const svg = (d: React.ReactNode, size = 14) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }} aria-hidden="true">{d}</svg>
)
export const Ico = {
  close:    () => svg(<path d="M18 6 6 18M6 6l12 12" />, 18),
  phone:    () => svg(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z" />),
  mail:     () => svg(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>),
  search:   () => svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, 16),
  chevron:  () => svg(<path d="m9 18 6-6-6-6" />),
  check:    () => svg(<path d="m5 13 4 4L19 7" />),
  user:     () => svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  edit:     () => svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>),
  next:     () => svg(<path d="M5 12h14M13 6l6 6-6 6" />),
  whatsapp: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }} aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z" /></svg>
  ),
}
