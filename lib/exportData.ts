/**
 * Exportar la información de la tienda a Excel (solo navegador).
 *  · contactRows: renglones de contactos con su estado comercial.
 *  · downloadStoreWorkbook: un solo archivo con Contactos, Historial comercial,
 *    Agenda, Cotizaciones y Catálogos, pedido por partes a /api/data/export.
 *  · downloadSummaryWorkbook: el periodo que se ve en Acumulado, por vendedor,
 *    con cada cotización y cada venta del periodo.
 *  · downloadOpportunitiesWorkbook: las cotizaciones abiertas de Oportunidades.
 *  · downloadCampaignWorkbook / downloadCampaignsWorkbook: resultados de una
 *    campaña o de todas las del periodo (Campañas de Mkt → Resultados).
 */
import { fmtPhone, normalizePhone } from './phone'
import { FAILURE_KINDS, type CampaignBucket, type CampaignDetail, type CampaignRecipient, type CampaignSummary } from './campaignKinds'
import { dayInZone } from './datetime'
import { GOAL_KEYS, GOAL_LABELS, KIND_LABELS, resultLabel, statusInfo, type ActivityKind, type DayCounts, type Goals } from './commercial'
import { STATUS_INFO, displayStatus, fmtMoney, fmtQty, isFilled, type QuoteItem, type QuoteStatus } from './quotes'

type Row = Record<string, any>
type Sheet = { name: string; rows: Row[] }

const REMINDER_LABELS: Record<string, string> = {
  task: 'Tarea', call: 'Llamada', email: 'Correo', whatsapp: 'WhatsApp', meeting: 'Reunión',
}

/** "2026-10-15T14:05:00" → "2026-10-15 14:05" (hora local para fechas con zona) */
function dateTime(iso: unknown, local = true) {
  if (typeof iso !== 'string' || !iso) return ''
  if (!local) return iso.slice(0, 16).replace('T', ' ')
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const amount = (v: unknown) => (v === null || v === undefined || v === '' ? '' : Number(v))

/** `timezone`: la de la tienda, para que la fecha de registro sea su día (no el de UTC). */
export const contactRows = (list: Row[], timezone?: string) => list.map(c => ({
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
  'Fecha registro':   dayInZone(c.created_at, timezone),
}))

export type SummaryData = {
  period: string; offset: number; from: string; end: string
  totals: DayCounts; prev: DayCounts; goals: Goals; compliance: number; prevCompliance: number
  people: { name: string; counts: DayCounts; goals: Goals; compliance: number }[]
  quotedOutcome?: { open: number; won: number; lost: number }
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
  ...(d.quotedOutcome ? [
    { 'Indicador': 'Cotizado por cerrar', 'Este periodo': d.quotedOutcome.open, 'Periodo anterior': '' as number | string, 'Meta': '' },
    { 'Indicador': 'Cotizado vendido', 'Este periodo': d.quotedOutcome.won, 'Periodo anterior': '' as number | string, 'Meta': '' },
    { 'Indicador': 'Cotizado perdido', 'Este periodo': d.quotedOutcome.lost, 'Periodo anterior': '' as number | string, 'Meta': '' },
  ] : []),
  { 'Indicador': 'Monto vendido', 'Este periodo': d.totals.sold, 'Periodo anterior': d.prev.sold, 'Meta': '' },
  { 'Indicador': 'Cumplimiento %', 'Este periodo': percent(d.compliance), 'Periodo anterior': percent(d.prevCompliance), 'Meta': 100 },
]

type AmountItem = { client: string; seller: string; amount: number; at: string; status?: 'abierta' | 'ganada' | 'perdida' }
const OUTCOME_LABEL = { abierta: 'Abierta', ganada: 'Ganada', perdida: 'Perdida' } as const

/** Cada cotización o venta del periodo (lo mismo que «Ver clientes» en Acumulado). */
async function amountItems(d: SummaryData, kind: 'quoted' | 'sold'): Promise<AmountItem[]> {
  const r = await fetch(`/api/data/commercial/summary/detail?period=${d.period}&offset=${d.offset}&kind=${kind}`, { cache: 'no-store' })
  const body: { items?: AmountItem[]; error?: string } = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error || 'No se pudo preparar el detalle')
  return body.items ?? []
}

export async function downloadSummaryWorkbook(d: SummaryData) {
  const label = d.from === d.end ? d.from : `${d.from}-a-${d.end}`
  const [quoted, sold] = await Promise.all([amountItems(d, 'quoted'), amountItems(d, 'sold')])
  await writeWorkbook(`acumulado-${label}.xlsx`, [
    { name: 'Por vendedor', rows: summaryPeopleRows(d) },
    { name: 'Resumen', rows: summaryTotalsRows(d) },
    { name: 'Cotizaciones', rows: quoted.map(q => ({
      'Fecha': dateTime(q.at), 'Cliente': q.client, 'Vendedor': q.seller, 'Monto': q.amount,
      'Estado': q.status ? OUTCOME_LABEL[q.status] : '',
    })) },
    { name: 'Ventas', rows: sold.map(v => ({ 'Fecha': dateTime(v.at), 'Cliente': v.client, 'Vendedor': v.seller, 'Monto': v.amount })) },
  ])
}

export type OpportunityRow = {
  name: string; company: string | null; phone: string | null; segment: string | null; zone: string | null
  owner_name: string | null; quote_amount: number; quoted_at: string | null; probability: number
  days_idle: number | null; next_action: string | null; next_action_at: string | null
}

/** Las cotizaciones abiertas que se ven en Oportunidades (con el filtro aplicado). */
export async function downloadOpportunitiesWorkbook(list: OpportunityRow[], today: string) {
  await writeWorkbook(`oportunidades-${today}.xlsx`, [{
    name: 'Oportunidades',
    rows: list.map(o => ({
      'Cliente': o.company?.trim() || o.name,
      'Contacto': o.company?.trim() ? o.name : '',
      'Teléfono': normalizePhone(o.phone),
      'Segmento': o.segment ?? '',
      'Zona': o.zone ?? '',
      'Vendedor': o.owner_name ?? 'Sin asignar',
      'Cotizado el': dateTime(o.quoted_at).slice(0, 10),
      'Monto': o.quote_amount,
      'Probabilidad %': Math.round(o.probability * 100),
      'Días sin contacto': o.days_idle ?? '',
      'Próximo seguimiento': o.next_action_at ? o.next_action || 'Dar seguimiento' : 'Sin seguimiento',
      'Fecha': o.next_action_at ?? '',
    })),
  }])
}

/* ── Campañas de Mkt ──────────────────────────────────────────────────────── */
const CAMPAIGN_STATE: Record<CampaignBucket, string> = { read: 'Leído', delivered: 'Entregado', pending: 'Pendiente', failed: 'No entregado' }
const templateName = (t: string) => t.replace(/_/g, ' ')
/** Por qué no le llegó (como en la pantalla de la campaña). */
const failReason = (r: CampaignRecipient) =>
  r.bucket !== 'failed' ? '' : r.kind && r.kind !== 'other' ? FAILURE_KINDS[r.kind].title : r.error ?? ''

const campaignRow = (c: CampaignSummary) => ({
  'Campaña': templateName(c.template), 'A quién': c.label ?? '', 'Fecha': dateTime(c.startedAt),
  'Destinatarios': c.total, 'Leídos': c.read, 'Entregados': c.delivered, 'Pendientes': c.pending,
  'No entregados': c.failed, 'Respondieron': c.replied,
})
const recipientRow = (r: CampaignRecipient) => ({
  'Nombre': r.name ?? '', 'Teléfono': fmtPhone(r.phone), 'Segmento': r.segment ?? '',
  'Estado': CAMPAIGN_STATE[r.bucket], 'Motivo': failReason(r), 'Respondió': r.replied ? 'Sí' : 'No',
  'Enviado': dateTime(r.sentAt), 'Última actualización': dateTime(r.updatedAt),
})

/** Una campaña: su resumen y cada destinatario con su estado y motivo. */
export async function downloadCampaignWorkbook(c: CampaignDetail) {
  await writeWorkbook(`campana-${c.template}-${dateTime(c.startedAt).slice(0, 10)}.xlsx`, [
    { name: 'Resumen', rows: [campaignRow(c)] },
    { name: 'Destinatarios', rows: c.recipients.map(recipientRow) },
  ])
}

/** Hojas del Excel de varias campañas: un resumen y cada destinatario de cada campaña. */
export const campaignsSheets = (list: CampaignDetail[]): Sheet[] => [
  { name: 'Resumen', rows: list.map(campaignRow) },
  { name: 'Destinatarios', rows: list.flatMap(c => c.recipients.map(r => ({
    'Campaña': templateName(c.template), 'Fecha de la campaña': dateTime(c.startedAt), ...recipientRow(r),
  }))) },
]

/** Las campañas del periodo en un archivo. */
export async function downloadCampaignsWorkbook(list: CampaignDetail[], label: string) {
  await writeWorkbook(`campanas-${label}.xlsx`, campaignsSheets(list))
}

/** Una tabla en una hoja (encabezados y renglones tal como se ven). */
export async function downloadTableWorkbook(filename: string, sheet: string, head: string[], rows: (string | number)[][]) {
  await writeWorkbook(filename, [{ name: sheet, rows: rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) }])
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
export async function downloadStoreWorkbook(slug: string, onStep?: (label: string) => void, timezone?: string) {
  onStep?.('Contactos'); const contacts = await fetchPart('contacts')
  onStep?.('Historial comercial'); const activities = await fetchPart('activities')
  onStep?.('Agenda'); const reminders = await fetchPart('reminders')
  onStep?.('Cotizaciones'); const quotes = await fetchPart('quotes')
  onStep?.('Catálogos'); const catalogs = await fetchPart('catalogs')

  const contactName = new Map(contacts.map(c => [c.id, c.company?.trim() || c.name]))
  const today = dayInZone(new Date().toISOString(), timezone)
  await writeWorkbook(`${slug}-informacion-${new Date().toLocaleDateString('en-CA')}.xlsx`, [
    { name: 'Contactos', rows: contactRows(contacts, timezone) },
    { name: 'Historial comercial', rows: activities.map(a => ({
      'Fecha':          dateTime(a.created_at),
      // Contacto borrado: el nombre que tenía (sus ventas y llamadas siguen contando)
      'Cliente':        (a.contact_id && contactName.get(a.contact_id)) || (a.contact_name ? `${a.contact_name} (borrado)` : ''),
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
    { name: 'Cotizaciones', rows: quotes.map(q => ({
      'Folio':        q.folio ?? 'Subida',
      'Fecha':        q.issued_on || '',
      'Válida hasta': q.valid_until || '',
      'Cliente':      q.client_name || '',
      'Teléfono':     q.client_phone || '',
      'Correo':       q.client_email || '',
      'Productos':    q.file_name ? `Archivo subido: ${q.file_name}` : ((q.items ?? []) as QuoteItem[]).filter(isFilled)
        .map(i => [fmtQty(i.quantity), i.unit, i.description, `a ${fmtMoney(i.price)}`].filter(Boolean).join(' ')).join(' | '),
      'Subtotal':     amount(q.subtotal),
      'Descuento':    amount(q.discount),
      'IVA':          amount(q.tax),
      'Total':        amount(q.total),
      'Estado':       STATUS_INFO[displayStatus(q.status as QuoteStatus, q.valid_until, today)]?.label ?? q.status,
      'Enviada':      dateTime(q.sent_at),
      'Vista por el cliente': dateTime(q.viewed_at),
      'Hizo':         q.user_name || '',
      'Condiciones':  q.notes || '',
    })) },
    { name: 'Catálogos', rows: catalogs.map(c => ({ 'Tipo': c.type === 'segment' ? 'Segmento' : 'Canal', 'Valor': c.label })) },
  ])
  return { contacts: contacts.length, activities: activities.length, reminders: reminders.length, quotes: quotes.length }
}
