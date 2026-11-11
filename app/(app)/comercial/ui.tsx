import { useEffect, useState } from 'react'
import { cleanAddress, parseColonia } from '@/lib/address'
import type { CommercialContact, DayCounts, Goals } from '@/lib/commercial'
import { Select, type SelectOption } from '@/components/Select'
import { fmtDay } from '@/components/CommercialUI'
import s from './comercial.module.css'
import { X, ChevronRight, Phone, MessageCircle, MapPin, Mail, Search, Check, User, ArrowRight, Calendar, SquarePen, type LucideIcon } from 'lucide-react'

export { PriorityChip, StatusChip, fmtDay, nextLabel } from '@/components/CommercialUI'

export type Member = { user_id: string; name: string; role: string }

/** Contacto en las listas: con el monto de su última cotización cuando la tiene. */
export type ListContact = CommercialContact & { quote_amount?: number | null }

/** GET /api/data/commercial — la lista de "Hoy". */
export type TodayData = {
  today: string; uid: string; isAdmin: boolean; salesTeam: boolean; reports: boolean
  zones: string[]; segments: string[]; goals: Goals; counts: DayCounts
  due: ListContact[]; fresh: ListContact[]; freshTotal: number; offset: number
  /** Cuántos pendientes hay en total (la lista trae hasta 500). */
  dueTotal: number
  /** Sin teléfono ("Para visita"): los primeros y cuántos hay. */
  visit: ListContact[]; visitTotal: number
  /** Con búsqueda: coincidencias en toda la base. */
  found: ListContact[] | null
}

/** Cuándo le toca: "Hace 3 días", "Ayer", "Hoy", "30 oct" o "Nuevo". */
export function whenOf(c: ListContact, today: string): { label: string; tone: 'late' | 'soon' | 'fresh' | 'later' } {
  if (!c.next_action_at) return c.last_activity_at ? { label: 'Sin fecha', tone: 'later' } : { label: 'Nuevo', tone: 'fresh' }
  if (c.next_action_at === today) return { label: 'Hoy', tone: 'soon' }
  if (c.next_action_at > today) return { label: fmtDay(c.next_action_at), tone: 'later' }
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${c.next_action_at}T12:00:00Z`)) / 86_400_000)
  return { label: days === 1 ? 'Ayer' : `Hace ${days} días`, tone: 'late' }
}

/** Zona, segmento (y lo que se agregue), buscador y "Quitar filtros". */
export function Filters({ zones, segments, zone, segment, onZone, onSegment, query, onQuery, placeholder, extra, active, onClear }: {
  zones: string[]; segments: string[]
  zone: string; segment: string
  onZone: (v: string) => void; onSegment: (v: string) => void
  query: string; onQuery: (v: string) => void; placeholder: string
  extra?: React.ReactNode
  /** Hay algún filtro puesto (para mostrar "Quitar filtros"). */
  active: boolean
  onClear: () => void
}) {
  const opts = (all: string, list: string[]): SelectOption[] => [{ value: '', label: all }, ...list.map(x => ({ value: x, label: x }))]
  return (
    <div className={s.filters}>
      {zones.length > 0 && (
        <div className={s.segmentPick}><Select value={zone} onChange={onZone} aria-label="Zona" options={opts('Todas las zonas', zones)} /></div>
      )}
      {segments.length > 0 && (
        <div className={s.segmentPick}><Select value={segment} onChange={onSegment} aria-label="Segmento" options={opts('Todos los segmentos', segments)} /></div>
      )}
      {extra}
      {active && <button type="button" className={`${s.clear} ${s.press}`} onClick={onClear}>Quitar filtros</button>}
      <label className={s.search}>
        <Ico.search />
        <input type="search" value={query} onChange={e => onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
    </div>
  )
}

/** Cuándo toca, para una frase: "hoy", "mañana", "en 3 días (30 oct)", "el 12 nov" o "vencido desde el 3 oct". */
export function whenPhrase(day: string, today: string): string {
  if (day < today) return `vencido desde el ${fmtDay(day)}`
  if (day === today) return 'hoy'
  const days = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (days === 1) return 'mañana'
  return days < 7 ? `en ${days} días (${fmtDay(day)})` : `el ${fmtDay(day)}`
}

/** Día (AAAA-MM-DD) de un instante, en la hora de quien lo ve (no en UTC: de noche cae al día siguiente). */
export const localDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

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

/* Iconos de Lucide con el tamaño de siempre de cada uno */
const ico = (Icon: LucideIcon, size = 14) => <Icon size={size} style={{ flexShrink: 0 }} aria-hidden="true" />
export const Ico = {
  close:    () => ico(X, 18),
  chevron:  () => ico(ChevronRight, 14),
  phone:    ({ size = 15 }: { size?: number } = {}) => ico(Phone, size),
  chat:     ({ size = 15 }: { size?: number } = {}) => ico(MessageCircle, size),
  pin:      ({ size = 14 }: { size?: number } = {}) => ico(MapPin, size),
  mail:     ({ size = 15 }: { size?: number } = {}) => ico(Mail, size),
  search:   () => ico(Search, 16),
  check:    () => ico(Check),
  user:     () => ico(User),
  next:     () => ico(ArrowRight),
  calendar: () => ico(Calendar),
  edit:     () => ico(SquarePen),
}
