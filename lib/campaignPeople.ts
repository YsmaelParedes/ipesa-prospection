/**
 * Resultados de campañas por persona y control de los números sin WhatsApp,
 * armados con los mensajes que ya guarda la app (whatsapp_messages): no hay
 * tablas nuevas. Un número "sin WhatsApp" no se borra (puede ser un teléfono
 * fijo útil para llamar): solo deja de recibir campañas. Solo servidor.
 */
import { getServerSupabase } from './supabase-server'
import { contactsForPhones } from './whatsappInbox'
import { bucketOf, failureKindOf, fetchPaged } from './campaignHistory'
import {
  PEOPLE_WINDOW_DAYS, REPLY_WINDOW_MS,
  type CampaignPerson, type FailureKind, type NoWhatsApp, type PersonState,
} from './campaignKinds'

export type ReachRow = {
  direction: string
  status: string
  error_message: string | null
  created_at: string
}

export type PersonRow = ReachRow & {
  phone: string
  template_name: string | null
  updated_at: string
}

const DAY = 24 * 60 * 60 * 1000
const PERSON_FIELDS = 'phone, direction, status, error_message, template_name, created_at, updated_at'

const sinceIso = () => new Date(Date.now() - PEOPLE_WINDOW_DAYS * DAY).toISOString()
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

// Rechazos que Meta solo da a usuarios de WhatsApp: el número sí existe
const REACHABLE_FAILURES = new Set<FailureKind>(['marketing_limit', 'opt_out'])

/**
 * ¿Lo último que dijo Meta de este número es que no tiene WhatsApp? Se
 * recorren sus mensajes del más nuevo al más viejo: una entrega, una lectura,
 * un mensaje del cliente o un rechazo que solo aplica a usuarios de WhatsApp
 * (como el límite de marketing) lo dejan disponible otra vez. Los fallos que
 * no dicen nada del número (plantilla, token, velocidad…) y los envíos que
 * Meta aún no confirma no cuentan.
 */
export function noWhatsAppOf(rows: readonly ReachRow[]): NoWhatsApp | null {
  const newestFirst = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  let failures = 0
  let lastFailedAt: string | null = null
  for (const r of newestFirst) {
    if (r.direction === 'inbound' || r.status === 'delivered' || r.status === 'read') break
    if (r.status !== 'failed') continue
    const kind = failureKindOf(r.error_message)
    if (kind === 'no_whatsapp') {
      failures++
      lastFailedAt ??= r.created_at
    } else if (REACHABLE_FAILURES.has(kind)) {
      break
    }
  }
  return lastFailedAt ? { failures, lastFailedAt } : null
}

/**
 * Cómo le fue a un número con las campañas, a partir de todos sus mensajes
 * del periodo. null si nunca se le mandó una plantilla.
 */
export function summarizePerson(rows: readonly PersonRow[], optOut: boolean): Omit<CampaignPerson, 'contactId' | 'name' | 'segment'> | null {
  const sorted = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const templates = sorted.filter(r => r.direction === 'outbound' && r.template_name)
  const last = templates[templates.length - 1]
  if (!last) return null

  // Respondió: escribió dentro de las 72 h siguientes a una plantilla que sí salió
  const inbound = sorted.filter(r => r.direction === 'inbound').map(r => Date.parse(r.created_at))
  let repliedMs: number | null = null
  for (const t of templates) {
    if (t.status === 'failed') continue
    const sent = Date.parse(t.created_at)
    for (const at of inbound) {
      if (at > sent && at - sent <= REPLY_WINDOW_MS && (repliedMs === null || at > repliedMs)) repliedMs = at
    }
  }

  const noWhatsApp = noWhatsAppOf(sorted)
  let state: PersonState
  if (optOut) state = 'opt_out'
  else if (noWhatsApp) state = 'no_whatsapp'
  else if (repliedMs !== null) state = 'replied'
  else {
    const bucket = bucketOf(last.status)
    if (bucket === 'failed') {
      const kind = failureKindOf(last.error_message)
      state = kind === 'marketing_limit' || kind === 'rate_limit' ? 'meta_limit' : 'failed'
    } else {
      state = bucket
    }
  }

  return {
    phone: last.phone,
    state,
    sends: templates.length,
    lastTemplate: last.template_name as string,
    lastSentAt: last.created_at,
    lastUpdatedAt: last.updated_at,
    repliedAt: repliedMs !== null ? new Date(repliedMs).toISOString() : null,
    error: last.status === 'failed' ? last.error_message : null,
    noWhatsAppFailures: noWhatsApp?.failures ?? 0,
    lastFailedAt: noWhatsApp?.lastFailedAt ?? null,
  }
}

/** Una fila por número al que se le mandó alguna plantilla en el último año (lo más reciente primero). */
export async function loadPeople(storeId: string): Promise<CampaignPerson[]> {
  const supabase = getServerSupabase()
  const since = sinceIso()
  const rows = await fetchPaged<PersonRow>((from, to) =>
    supabase.from('whatsapp_messages').select(PERSON_FIELDS)
      .eq('store_id', storeId).gte('created_at', since)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 50000)

  const byPhone = new Map<string, PersonRow[]>()
  for (const r of rows) {
    const list = byPhone.get(r.phone)
    if (list) list.push(r)
    else byPhone.set(r.phone, [r])
  }
  const sent = [...byPhone].filter(([, list]) => list.some(r => r.direction === 'outbound' && r.template_name))

  // Por teléfono actual: si a un contacto le corrigieron el número, el viejo ya no es suyo
  const contacts = await contactsForPhones(storeId, sent.map(([phone]) => phone))

  const people: CampaignPerson[] = []
  for (const [phone, list] of sent) {
    const contact = contacts.get(phone)
    const summary = summarizePerson(list, contact?.wa_opt_out ?? false)
    if (!summary) continue
    people.push({ ...summary, contactId: contact?.id ?? null, name: contact?.name ?? null, segment: contact?.segment ?? null })
  }
  return people.sort((a, b) => (a.lastSentAt < b.lastSentAt ? 1 : -1))
}

/** Para un solo número, justo antes de mandarle una plantilla. */
export async function noWhatsAppFor(storeId: string, phone: string): Promise<NoWhatsApp | null> {
  const { data, error } = await getServerSupabase().from('whatsapp_messages')
    .select('direction, status, error_message, created_at')
    .eq('store_id', storeId).eq('phone', phone).gte('created_at', sinceIso())
    .order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return noWhatsAppOf(data ?? [])
}

/** De estos números, los que no tienen WhatsApp según lo último que dijo Meta. */
export async function noWhatsAppAmong(storeId: string, phones: string[]): Promise<Set<string>> {
  const unique = [...new Set(phones)]
  if (!unique.length) return new Set()
  const supabase = getServerSupabase()
  const since = sinceIso()
  const parts = await Promise.all(chunks(unique, 150).map(part =>
    fetchPaged<ReachRow & { phone: string }>((from, to) =>
      supabase.from('whatsapp_messages').select('phone, direction, status, error_message, created_at')
        .eq('store_id', storeId).in('phone', part).gte('created_at', since)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
  ))
  const byPhone = new Map<string, ReachRow[]>()
  for (const r of parts.flat()) {
    const list = byPhone.get(r.phone)
    if (list) list.push(r)
    else byPhone.set(r.phone, [r])
  }
  return new Set([...byPhone].filter(([, list]) => noWhatsAppOf(list)).map(([phone]) => phone))
}
