/**
 * Fechas en hora LOCAL del navegador. Los recordatorios se guardan como
 * "YYYY-MM-DDTHH:MM:SS" sin zona (la hora de México tal cual la eligió el
 * usuario), así que aquí nunca se convierte a UTC.
 */

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const pad = (n: number) => String(n).padStart(2, '0')

/** Date → "YYYY-MM-DDTHH:MM" (valor de un <input type="datetime-local">). */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const localNow = () => toLocalInput(new Date())

/** "YYYY-MM-DDTHH:MM" → formato que espera la API ("…:SS"). */
export const toDbLocal = (v: string) => (v.length === 16 ? `${v}:00` : v)

/** Atajos para programar un seguimiento sin abrir el calendario. */
export type QuickWhen = '1h' | 'tomorrow' | '3days' | 'monday'
export const QUICK_WHEN: { key: QuickWhen; label: string }[] = [
  { key: '1h',       label: 'En 1 hora' },
  { key: 'tomorrow', label: 'Mañana 9:00' },
  { key: '3days',    label: 'En 3 días' },
  { key: 'monday',   label: 'Próximo lunes' },
]
export function quickDate(when: QuickWhen, from = new Date()): string {
  const d = new Date(from)
  if (when === '1h') {
    d.setHours(d.getHours() + 1)
  } else {
    if (when === 'tomorrow') d.setDate(d.getDate() + 1)
    if (when === '3days')    d.setDate(d.getDate() + 3)
    if (when === 'monday')   d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
    d.setHours(9, 0, 0, 0)
  }
  return toLocalInput(d)
}

export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
export const isOverdue = (iso: string, now = new Date()) => new Date(iso).getTime() < now.getTime()

/** ¿Vence hoy o ya venció? (lo que hay que atender en el día) */
export function isDueToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso)
  return d.getTime() < now.getTime() || isSameDay(d, now)
}

/** Cuándo toca un recordatorio: "En 45 min", "Hoy · 16:00", "Mañana · 9:00", "Hace 2 días · 9:00", "12 oct · 9:00". */
export function fmtDue(iso: string, now = new Date()): string {
  const d    = new Date(iso)
  const diff = d.getTime() - now.getTime()
  const abs  = Math.abs(diff)
  const past = diff < 0
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  if (abs <= 45_000) return '¡Ahora!'
  const mins  = Math.floor(abs / 60_000)
  const hours = Math.floor(abs / 3_600_000)
  if (mins < 60) return past ? `Hace ${mins} min` : `En ${mins} min`
  if (hours < 6) {
    const label = mins % 60 ? `${hours} h ${mins % 60} min` : `${hours} h`
    return past ? `Hace ${label}` : `En ${label}`
  }
  if (isSameDay(d, now)) return `Hoy · ${time}`
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  if (isSameDay(d, tomorrow)) return `Mañana · ${time}`
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return `Ayer · ${time}`
  const days = Math.max(1, Math.round(abs / 86_400_000))
  if (past) return `Hace ${days} día${days !== 1 ? 's' : ''}`
  if (days < 7) return `En ${days} días · ${time}`
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${time}`
}

/** Cuándo pasó algo: "Ahora mismo", "Hace 5 min", "Hoy · 13:20", "Ayer · 9:10", "Hace 3 días", "12 oct". */
export function fmtAgo(iso: string, now = new Date()): string {
  const d    = new Date(iso)
  const diff = now.getTime() - d.getTime()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (diff < 60_000) return 'Ahora mismo'
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`
  if (isSameDay(d, now)) return `Hoy · ${time}`
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return `Ayer · ${time}`
  const days = Math.floor(diff / 86_400_000)
  if (days < 7) return `Hace ${days} días`
  return `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`
}

/** Saludo según la hora. */
export function greetingFor(date = new Date()): string {
  const h = date.getHours()
  if (h >= 6 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/* ── Servidor: la hora de la tienda (el servidor corre en UTC) ─────────── */

export const DEFAULT_TZ = 'America/Mexico_City'

const zoneFormats = new Map<string, Intl.DateTimeFormat>()
function zoneFormat(tz: string): Intl.DateTimeFormat {
  let f = zoneFormats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    zoneFormats.set(tz, f)
  }
  return f
}

/**
 * `date` como "YYYY-MM-DDTHH:MM:SS" en la zona `tz`: el mismo formato que
 * reminder_date, así que ambos se comparan como texto.
 */
export function zonedIso(date: Date, tz = DEFAULT_TZ): string {
  let f: Intl.DateTimeFormat
  try { f = zoneFormat(tz) } catch { f = zoneFormat(DEFAULT_TZ) }  // zona inválida en la tienda
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(date)) p[part.type] = part.value
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

/** reminder_date tal como llega de la base → "YYYY-MM-DDTHH:MM:SS". */
export const naiveIso = (v: unknown) => toDbLocal(String(v).slice(0, 19))
