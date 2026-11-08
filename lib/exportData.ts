/**
 * Exportar la información de la tienda a Excel (solo navegador).
 *  · contactRows: renglones de contactos con su estado comercial.
 *  · downloadStoreWorkbook: un solo archivo con Contactos, Historial comercial,
 *    Agenda y Catálogos, pedido por partes a /api/data/export.
 *  · downloadSummaryWorkbook: el periodo que se ve en Acumulado, por vendedor.
 */
import { normalizePhone } from './phone'
import { GOAL_KEYS, GOAL_LABELS, KIND_LABELS, resultLabel, statusInfo, type ActivityKind, type DayCounts, type Goals } from './commercial'

type Row = Record<string, any>
type Sheet = { name: string; rows: Row[] }

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
  'Nombre':           c.name || '',
  'Teléfono':         normalizePhone(c.phone),
  'Correo':           c.email || '',
  'Empresa':          c.company || '',
  'Segmento':         c.segment || '',
  'Canal':            c.acquisition_channel || '',
  'Dirección':        c.address || '',
  'Colonia':          c.colonia || '',
  'C.P.':             c.postal_code || '',
  'Estado comercial': c.commercial_status ? statusInfo(c.commercial_status).label : '',
  'Responsable':      c.owner_name ?? '',
  'Próxima acción':   c.next_action_at ? c.next_action || '' : '',
  'Fecha próxima':    c.next_action_at || '',
  'Última nota':      c.last_note || '',
  'Fecha registro':   day(c.created_at),
}))

export type SummaryData = {
  period: string; from: string; end: string
  totals: DayCounts; prev: DayCounts; goals: Goals; compliance: number; prevCompliance: number
  people: { name: string; counts: DayCounts; goals: Goals; compliance: number }[]
}

const percent = (ratio: number) => Math.round(ratio * 100)
const countsRow = (name: string, c: DayCounts, ratio: number) => ({
  'Vendedor': name,
  // Correos junto a Llamadas, como en la tabla de Acumulado
  ...Object.fromEntries(GOAL_KEYS.flatMap(k => k === 'calls' ? [[GOAL_LABELS[k], c[k]], ['Correos', c.emails ?? 0]] : [[GOAL_LABELS[k], c[k]]])),
  'Monto cotizado': c.quoted,
  'Monto vendido': c.sold,
  'Cumplimiento %': percent(ratio),
})

/** Un renglón por vendedor y el total de la tienda (incluye a quien ya no está en el equipo). */
export const summaryPeopleRows = (d: SummaryData) => [
  ...d.people.map(p => countsRow(p.name, p.counts, p.compliance)),
  countsRow('Total de la tienda', d.totals, d.compliance),
]

/** Los indicadores de la tienda contra el periodo anterior y la meta. */
export const summaryTotalsRows = (d: SummaryData) => [
  ...GOAL_KEYS.map(k => ({ 'Indicador': GOAL_LABELS[k], 'Este periodo': d.totals[k], 'Periodo anterior': d.prev[k], 'Meta': d.goals[k] as number | string })),
  { 'Indicador': 'Correos', 'Este periodo': d.totals.emails ?? 0, 'Periodo anterior': d.prev.emails ?? 0, 'Meta': '' },
  { 'Indicador': 'Monto cotizado', 'Este periodo': d.totals.quoted, 'Periodo anterior': d.prev.quoted, 'Meta': '' },
  { 'Indicador': 'Monto vendido', 'Este periodo': d.totals.sold, 'Periodo anterior': d.prev.sold, 'Meta': '' },
  { 'Indicador': 'Cumplimiento %', 'Este periodo': percent(d.compliance), 'Periodo anterior': percent(d.prevCompliance), 'Meta': 100 },
]

export async function downloadSummaryWorkbook(d: SummaryData) {
  const label = d.from === d.end ? d.from : `${d.from}-a-${d.end}`
  await writeWorkbook(`acumulado-${label}.xlsx`, [
    { name: 'Por vendedor', rows: summaryPeopleRows(d) },
    { name: 'Resumen', rows: summaryTotalsRows(d) },
  ])
}

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
  onStep?.('Historial comercial'); const activities = await fetchPart('activities')
  onStep?.('Agenda'); const reminders = await fetchPart('reminders')
  onStep?.('Catálogos'); const catalogs = await fetchPart('catalogs')

  const contactName = new Map(contacts.map(c => [c.id, c.company?.trim() || c.name]))
  await writeWorkbook(`${slug}-informacion-${new Date().toLocaleDateString('en-CA')}.xlsx`, [
    { name: 'Contactos', rows: contactRows(contacts) },
    { name: 'Historial comercial', rows: activities.map(a => ({
      'Fecha':          dateTime(a.created_at),
      'Cliente':        contactName.get(a.contact_id) ?? '',
      'Tipo':           KIND_LABELS[a.kind as ActivityKind] ?? a.kind ?? '',
      'Resultado':      resultLabel(a.result),
      'Nota':           a.note || '',
      'Monto cotizado': amount(a.quote_amount),
      'Monto vendido':  amount(a.sale_amount),
      'Próxima acción': a.next_action || '',
      'Fecha próxima':  a.next_action_at || '',
      'Registró':       a.user_name || '',
    })) },
    { name: 'Agenda', rows: reminders.map(r => ({
      'Fecha y hora':  dateTime(r.reminder_date, false),   // hora de la tienda, sin zona
      'Cliente':       r.lead_name || '',
      'Nota':          r.nota || '',
      'Tipo':          REMINDER_LABELS[r.type] ?? r.type ?? '',
      'Hecho':         r.completado ? 'Sí' : 'No',
      'Hecho el':      dateTime(r.completado_at),
      'Responsable':   r.user_name || '',
    })) },
    { name: 'Catálogos', rows: catalogs.map(c => ({ 'Tipo': c.type === 'segment' ? 'Segmento' : 'Canal', 'Valor': c.label })) },
  ])
  return { contacts: contacts.length, activities: activities.length, reminders: reminders.length }
}
