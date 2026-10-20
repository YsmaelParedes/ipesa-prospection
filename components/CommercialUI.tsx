import { addDays, priorityInfo, statusInfo } from '@/lib/commercial'
import { MESES } from '@/lib/datetime'

export function fmtDay(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

/** "Vencido · 3 oct", "Hoy", "Mañana", "En 3 días", "12 nov" (con su tono de follow-chip). */
export function nextLabel(next: string | null, today: string): { tone: 'overdue' | 'today' | 'scheduled' | 'none'; label: string } {
  if (!next) return { tone: 'none', label: 'Sin fecha' }
  if (next < today) return { tone: 'overdue', label: `Vencido · ${fmtDay(next)}` }
  if (next === today) return { tone: 'today', label: 'Hoy' }
  if (next === addDays(today, 1)) return { tone: 'scheduled', label: 'Mañana' }
  for (let n = 2; n < 7; n++) if (next === addDays(today, n)) return { tone: 'scheduled', label: `En ${n} días` }
  return { tone: 'scheduled', label: fmtDay(next) }
}

/** Estado comercial del contacto (Nuevo, Interés, Cotización, Cliente…). */
export function StatusChip({ value }: { value: string }) {
  const info = statusInfo(value)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: info.bg, color: info.color,
    }}>{info.label}</span>
  )
}

/** Prioridad del contacto; la media no se muestra para no llenar de etiquetas. */
export function PriorityChip({ value, showMedia = false }: { value: string | null | undefined; showMedia?: boolean }) {
  if (!value || (value === 'media' && !showMedia)) return null
  const info = priorityInfo(value)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: info.bg, color: info.color,
    }}>Prioridad {info.label.toLowerCase()}</span>
  )
}
