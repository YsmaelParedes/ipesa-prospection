'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Avatar, TipoChip } from '@/components/CrmUI'
import { WaIcon } from '@/components/WhatsAppUI'
import { fmtPhone } from '@/lib/phone'
import { csvStamp, downloadCsv } from '@/lib/csv'
import { PERSON_STATES, PERSON_STATE_ORDER, type CampaignPerson, type PersonState } from '@/lib/campaignKinds'

type Filter = 'all' | PersonState

const PAGE = 100
const STATE_CLASS: Record<PersonState, string> = {
  replied: 'replied', read: 'read', delivered: 'delivered', pending: 'pending',
  meta_limit: 'limit', failed: 'failed', no_whatsapp: 'nowa', opt_out: 'optout',
}
const TILE_TONE: Partial<Record<PersonState, string>> = { replied: 'good', meta_limit: 'warn', failed: 'bad', no_whatsapp: 'bad' }

const tplName = (t: string) => `«${t.replace(/_/g, ' ')}»`
const day = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

function noteFor(p: CampaignPerson): string {
  const tpl = tplName(p.lastTemplate)
  switch (p.state) {
    case 'no_whatsapp': {
      const times = p.noWhatsAppFailures === 1 ? 'Meta lo rechazó 1 vez' : `Meta lo rechazó ${p.noWhatsAppFailures} veces seguidas`
      return `${times} (último: ${day(p.lastFailedAt ?? p.lastSentAt)}) · puede ser un teléfono fijo`
    }
    case 'replied':    return `Respondió el ${day(p.repliedAt ?? p.lastUpdatedAt)} · último envío: ${tpl}`
    case 'read':       return `Leyó ${tpl} el ${day(p.lastUpdatedAt)}`
    case 'delivered':  return `Recibió ${tpl} el ${day(p.lastUpdatedAt)}, aún no lo lee`
    case 'pending':    return `Se le envió ${tpl} el ${day(p.lastSentAt)} · Meta aún no confirma la entrega`
    case 'meta_limit': return `${tpl} no se entregó el ${day(p.lastSentAt)} por un límite temporal de Meta`
    case 'failed':     return `${tpl} no se entregó el ${day(p.lastSentAt)}${p.error ? ` · ${p.error}` : ''}`
    case 'opt_out':    return `Pidió no recibir campañas · último envío: ${tpl}`
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Resultados por persona: cómo le fue a cada número con las campañas
══════════════════════════════════════════════════════════════════════════ */
export function WhatsAppCampaignPeople({ onOpenChat }: { onOpenChat: (phone: string) => void }) {
  const [people, setPeople] = useState<CampaignPerson[] | null>(null)
  const [error, setError]   = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [shown, setShown]   = useState(PAGE)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/whatsapp/campaigns/people')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d })
      .then(d => { if (!cancelled) setPeople(d.people ?? []) })
      .catch(e => { if (!cancelled) setError(e?.message || 'No se pudieron cargar los resultados por persona') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { setShown(PAGE) }, [filter, search])

  const counts = useMemo(() => {
    const map = new Map<PersonState, number>()
    for (const p of people ?? []) map.set(p.state, (map.get(p.state) ?? 0) + 1)
    return map
  }, [people])

  const inFilter = useMemo(() => (people ?? []).filter(p => filter === 'all' || p.state === filter), [people, filter])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return q ? inFilter.filter(p => (p.name ?? '').toLowerCase().includes(q) || (digits.length >= 3 && p.phone.includes(digits))) : inFilter
  }, [inFilter, search])

  const head = (
    <div className="wa-results-head">
      <div>
        <div className="wa-results-title">Resultados por persona</div>
        <div className="wa-results-sub">Cómo le fue a cada número con tus campañas en el último año</div>
      </div>
    </div>
  )

  if (error) return <>{head}<div className="wa-card wa-empty small"><WaIcon.alert size={20} />{error}</div></>
  if (!people) return <>{head}<div className="wa-card wa-empty small"><span className="wa-spinner" /></div></>
  if (people.length === 0) return <>{head}<div className="wa-card wa-empty small"><WaIcon.user size={26} /> Aún no le has enviado campañas a nadie.</div></>

  const exportList = () => downloadCsv(
    `campanas-por-persona-${filter === 'all' ? 'todos' : filter}-${csvStamp(new Date().toISOString()).slice(0, 10)}.csv`,
    ['Nombre', 'Teléfono', 'Segmento', 'Estado', 'Detalle', 'Plantillas enviadas', 'Último envío', 'Fecha del último envío'],
    visible.map(p => [
      p.name ?? '', fmtPhone(p.phone), p.segment ?? '', PERSON_STATES[p.state].chip, noteFor(p),
      String(p.sends), p.lastTemplate.replace(/_/g, ' '), csvStamp(p.lastSentAt),
    ]),
  )
  const copyPhones = async () => {
    try {
      await navigator.clipboard.writeText(visible.map(p => p.phone).join('\n'))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* sin permiso del portapapeles */ }
  }

  return (
    <>
      {head}

      <div className="wa-person-tiles" role="tablist" aria-label="Filtrar por resultado">
        <button role="tab" aria-selected={filter === 'all'} className={`wa-person-tile ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <span>Todos</span><strong>{people.length}</strong><small>números</small>
        </button>
        {PERSON_STATE_ORDER.filter(s => counts.get(s)).map(s => (
          <button key={s} role="tab" aria-selected={filter === s} className={`wa-person-tile ${TILE_TONE[s] ?? ''} ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            <span>{PERSON_STATES[s].label}</span><strong>{counts.get(s)}</strong><small>{pct(counts.get(s) ?? 0, people.length)}%</small>
          </button>
        ))}
      </div>

      {filter === 'no_whatsapp' && (
        <div className="wa-person-note bad">
          <strong>Ya no se les envía nada.</strong> Campañas los deja fuera y la Bandeja pide confirmación antes de mandarles una plantilla. No se borran: pueden ser teléfonos fijos, así que puedes llamarles. Si alguno te escribe por WhatsApp, sale solo de esta lista.
        </div>
      )}
      {filter === 'meta_limit' && (
        <div className="wa-person-note">
          Meta no les entregó por un límite temporal de mensajes de marketing. Puedes volver a intentarlo en unos días desde Campañas, con el filtro <strong>Historial → Límite de Meta</strong>.
        </div>
      )}

      <div className="wa-card">
        <div className="wa-list-head">
          <label className="wa-search">
            <WaIcon.search />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre o teléfono…" aria-label="Buscar persona" />
            {search && <button onClick={() => setSearch('')} className="wa-clear" aria-label="Limpiar búsqueda">×</button>}
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="wa-empty small">Nadie coincide con esta búsqueda.</div>
        ) : (
          <div className="wa-recips">
            {visible.slice(0, shown).map(p => (
              <div className="wa-recip" key={p.phone}>
                <Avatar name={p.name || p.phone} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div className="wa-recip-name">{p.name || fmtPhone(p.phone)}</div>
                  <div className="wa-recip-sub">{p.name ? fmtPhone(p.phone) : 'No está en Contactos'}{p.segment && <TipoChip value={p.segment} small />}</div>
                </div>
                <div className="wa-recip-state">
                  <span>
                    <span className={`wa-state ${STATE_CLASS[p.state]}`}>{PERSON_STATES[p.state].chip}</span>
                    <span className="wa-recip-count">{p.sends === 1 ? '1 plantilla' : `${p.sends} plantillas`}</span>
                  </span>
                  <span className="wa-recip-note">{noteFor(p)}</span>
                </div>
                <div className="wa-recip-actions">
                  {p.state === 'no_whatsapp' ? (
                    <a className="wa-icon-link" href={`tel:${p.phone}`} title="Llamar" aria-label="Llamar"><WaIcon.phone size={15} /></a>
                  ) : (
                    <button className="wa-icon-link" title="Abrir chat" aria-label="Abrir chat" onClick={() => onOpenChat(p.phone)}><WaIcon.chat size={15} /></button>
                  )}
                  {p.contactId && <Link className="wa-icon-link" href={`/contactos?id=${p.contactId}`} title="Ver ficha del contacto" aria-label="Ver ficha del contacto"><WaIcon.user size={15} /></Link>}
                </div>
              </div>
            ))}
          </div>
        )}

        {visible.length > shown && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--line)' }}>
            <button className="wa-link-btn" onClick={() => setShown(s => s + PAGE)}>Mostrar {Math.min(PAGE, visible.length - shown)} más ({visible.length - shown} restantes)</button>
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
          <button className="btn btn-ghost" onClick={exportList}>Exportar {filter === 'all' && !search ? 'lista' : `estos ${visible.length}`} (CSV)</button>
          <button className="btn btn-ghost" onClick={copyPhones}>{copied ? 'Copiados ✓' : `Copiar ${visible.length === 1 ? 'el número' : `los ${visible.length} números`}`}</button>
        </div>
      )}
    </>
  )
}
