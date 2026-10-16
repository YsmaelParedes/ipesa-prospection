/**
 * Exportar la información de la tienda a Excel (solo navegador).
 *  · leadRows: renglones de leads (botón Exportar de Leads y descarga completa).
 *  · downloadStoreWorkbook: un solo archivo con Contactos, Leads, Historial,
 *    Agenda y Catálogos, pedido por partes a /api/data/export.
 */
import { normalizePhone } from './phone'

type Row = Record<string, any>
type Sheet = { name: string; rows: Row[] }

const ACTIVITY_LABELS: Record<string, string> = {
  call: 'Llamada', email: 'Correo', whatsapp: 'WhatsApp', quote: 'Cotización', meeting: 'Reunión', visit: 'Visita', note: 'Nota',
}
const REMINDER_LABELS: Record<string, string> = {
  task: 'Tarea', call: 'Llamada', email: 'Correo', whatsapp: 'WhatsApp', meeting: 'Reunión',
}

const day = (iso: unknown) => (typeof iso === 'string' && iso ? iso.slice(0, 10) : '')
/** "2026-10-15T14:05:00" → "2026-10-15 14:05" (hora local para fechas con zona) */
function dateTime(iso: unknown, local = true) {
  if (typeof iso !== 'string' || !iso) return ''
  if (!local) return iso.slice(0, 16).replace('T', ' ')
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const amount = (v: unknown) => (v === null || v === undefined || v === '' ? '' : Number(v))

export const contactRows = (list: Row[]) => list.map(c => ({
  'Nombre':         c.name || '',
  'Teléfono':       normalizePhone(c.phone),
  'Correo':         c.email || '',
  'Empresa':        c.company || '',
  'Segmento':       c.segment || '',
  'Canal':          c.acquisition_channel || '',
  'Dirección':      c.address || '',
  'C.P.':           c.postal_code || '',
  'Fecha registro': day(c.created_at),
}))

/** `owner` = nombre del vendedor (owner_name en la app, user_name en la exportación completa). */
export const leadRows = (list: Row[]) => list.map(l => ({
  'Nombre':    l.name || '',
  'Teléfono':  normalizePhone(l.phone),
  'Correo':    l.email || '',
  'Segmento':  l.segmento || '',
  'Canal':     l.canal || '',
  'Estado':    l.estado || '',
  'Monto':     amount(l.monto),
  'Fecha':     day(l.fecha),
  'Vendedor':  l.owner_name ?? l.user_name ?? '',
  'Notas':     l.notas || '',
  'Creado':    day(l.created_at),
}))

async function writeWorkbook(filename: string, sheets: Sheet[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const sh of sheets) {
    // Una hoja vacía igual lleva su encabezado
    const ws = sh.rows.length ? XLSX.utils.json_to_sheet(sh.rows) : XLSX.utils.aoa_to_sheet([['Sin registros']])
    XLSX.utils.book_append_sheet(wb, ws, sh.name)
  }
  XLSX.writeFile(wb, filename)
}

export async function downloadLeads(list: Row[], filtered: boolean) {
  await writeWorkbook(`leads${filtered ? '-filtrados' : ''}-${new Date().toLocaleDateString('en-CA')}.xlsx`, [{ name: 'Leads', rows: leadRows(list) }])
}

async function fetchPart(part: string): Promise<Row[]> {
  const out: Row[] = []
  let from: number | null = 0
  while (from !== null) {
    const r: Response = await fetch(`/api/data/export?part=${part}&from=${from}`, { cache: 'no-store' })
    const d: { rows?: Row[]; next?: number | null; error?: string } = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'No se pudo exportar la información')
    out.push(...(d.rows ?? []))
    from = d.next ?? null
  }
  return out
}

/** Todo lo de la tienda en un archivo. `onStep` avisa qué parte se está descargando. */
export async function downloadStoreWorkbook(slug: string, onStep?: (label: string) => void) {
  onStep?.('Contactos'); const contacts = await fetchPart('contacts')
  onStep?.('Leads'); const leads = await fetchPart('leads')
  onStep?.('Historial'); const activities = await fetchPart('activities')
  onStep?.('Agenda'); const reminders = await fetchPart('reminders')
  onStep?.('Catálogos'); const catalogs = await fetchPart('catalogs')

  const leadName = new Map(leads.map(l => [l.id, l.name]))
  await writeWorkbook(`${slug}-informacion-${new Date().toLocaleDateString('en-CA')}.xlsx`, [
    { name: 'Contactos', rows: contactRows(contacts) },
    { name: 'Leads', rows: leadRows(leads) },
    { name: 'Historial de leads', rows: activities.map(a => ({
      'Lead':        leadName.get(a.lead_id) ?? '',
      'Tipo':        ACTIVITY_LABELS[a.type] ?? a.type ?? '',
      'Descripción': a.description || '',
      'Monto':       amount(a.amount),
      'Fecha':       dateTime(a.activity_date),
      'Registró':    a.user_name || '',
    })) },
    { name: 'Agenda', rows: reminders.map(r => ({
      'Fecha y hora':  dateTime(r.reminder_date, false),   // hora de la tienda, sin zona
      'Lead':          r.lead_name || leadName.get(r.lead_id) || '',
      'Nota':          r.nota || '',
      'Tipo':          REMINDER_LABELS[r.type] ?? r.type ?? '',
      'Hecho':         r.completado ? 'Sí' : 'No',
      'Hecho el':      dateTime(r.completado_at),
      'Responsable':   r.user_name || '',
    })) },
    { name: 'Catálogos', rows: catalogs.map(c => ({ 'Tipo': c.type === 'segment' ? 'Segmento' : 'Canal', 'Valor': c.label })) },
  ])
  return { contacts: contacts.length, leads: leads.length, activities: activities.length, reminders: reminders.length }
}
