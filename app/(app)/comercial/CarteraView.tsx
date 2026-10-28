'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import { NO_ANSWER_LIMIT } from '@/lib/commercial'
import { Select } from '@/components/Select'
import { avatarColors } from './ContactPanel'
import type { Opened } from './HoyView'
import { Filters, StatusChip, bizName, initials, whenOf, type ListContact, type Member } from './ui'
import s from './comercial.module.css'

type Stage = 'nuevo' | 'contactado' | 'cotizacion' | 'cliente' | 'no_contesta'
type Data = { today: string; contacts: ListContact[]; total: number; offset: number; team: Member[]; counts: Record<Stage, number> }

const STAGES: [Stage, string, string][] = [
  ['nuevo', 'Prospectos', 'var(--c-cyan-ink)'],
  ['contactado', 'Contactados', 'var(--c-teal-ink)'],
  ['cotizacion', 'En cotización', 'var(--warning-fill)'],
  ['cliente', 'Clientes', 'var(--success)'],
  ['no_contesta', 'No contesta', 'var(--danger)'],
]
const TONE = { late: s.late, soon: s.soon, fresh: s.fresh, later: s.later }

/**
 * Cartera: toda la base comercial con su avance. Las cajas de arriba filtran
 * por avance; se combina con zona, segmento y (administradores) responsable.
 * Al tocar un cliente se abre su ficha para registrar.
 */
export function CarteraView({ uid, isAdmin, zones, segments, zone, segment, onZone, onSegment, onOpen }: {
  uid: string
  isAdmin: boolean
  zones: string[]
  segments: string[]
  zone: string
  segment: string
  onZone: (v: string) => void
  onSegment: (v: string) => void
  onOpen: (o: Opened) => void
}) {
  const [stage, setStage] = useState<Stage | ''>('')
  const [owner, setOwner] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const url = useCallback((offset = 0) => {
    const qs = new URLSearchParams()
    if (stage) qs.set('stage', stage)
    if (zone) qs.set('zone', zone)
    if (segment) qs.set('segment', segment)
    if (owner) qs.set('owner', owner)
    if (search) qs.set('q', search)
    if (offset) qs.set('offset', String(offset))
    const str = qs.toString()
    return `/api/data/commercial/portfolio${str ? `?${str}` : ''}`
  }, [stage, zone, segment, owner, search])

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(url())
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d); setError('')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar la cartera')
    }
  }, [url])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['contact', 'commercial'], load)

  async function loadMore() {
    if (!data) return
    setLoadingMore(true)
    try {
      const r = await apiFetch(url(data.contacts.length))
      if (r.ok) {
        const more: Data = await r.json()
        setData(d => d ? { ...d, contacts: [...d.contacts, ...more.contacts.filter(c => !d.contacts.some(x => x.id === c.id))], total: more.total } : d)
      }
    } finally { setLoadingMore(false) }
  }

  const ownerFilter = isAdmin && data && data.team.length > 1 && (
    <div className={s.segmentPick}>
      <Select value={owner} onChange={setOwner} aria-label="Responsable"
        options={[{ value: '', label: 'Todos los responsables' }, { value: 'me', label: 'Míos' }, { value: 'none', label: 'Sin asignar' },
          ...data.team.filter(m => m.user_id !== uid).map(m => ({ value: m.user_id, label: m.name }))]} />
    </div>
  )

  const ownerLabel = (c: ListContact) => !c.owner_id ? 'Sin asignar' : c.owner_id === uid ? 'Tú' : (c.owner_name ?? 'Otra persona')

  return (
    <>
      <div className={s.funnel} role="group" aria-label="Avance">
        {STAGES.map(([key, label, color]) => (
          <button key={key} type="button" className={`${s.fbox} ${s.press}`} aria-pressed={stage === key} onClick={() => setStage(st => st === key ? '' : key)}>
            <small>{label}</small>
            <b className={s.num}>{data ? data.counts[key].toLocaleString('es-MX') : '—'}</b>
            <i style={{ background: color }} />
          </button>
        ))}
      </div>

      <Filters zones={zones} segments={segments} zone={zone} segment={segment} onZone={onZone} onSegment={onSegment}
        query={query} onQuery={setQuery} placeholder="Buscar en la cartera: negocio o teléfono" extra={ownerFilter}
        active={!!(zone || segment || owner || stage || query)}
        onClear={() => { onZone(''); onSegment(''); setOwner(''); setStage(''); setQuery('') }} />

      <div className={`${s.elev} ${s.listCard}`}>
        {error ? <div className={s.emptyList} role="alert">{error}</div>
          : !data ? <div className={s.emptyList}>Cargando…</div>
          : data.contacts.length === 0 ? <div className={s.emptyList}>Nadie coincide con estos filtros.</div>
          : (
            <>
              <div className={`${s.pRow} ${s.pHead}`} aria-hidden="true">
                <span /><span>Cliente</span><span className={s.optional}>Próximo paso</span>
                <span className={s.optional}>Responsable</span><span className={s.optional}>Cuándo</span><span>Avance</span>
              </div>
              {data.contacts.map(c => {
                const [bg, fg] = avatarColors(c.commercial_status)
                const when = whenOf(c, data.today)
                return (
                  <button key={c.id} type="button" className={s.pRow} onClick={() => onOpen({ id: c.id })}>
                    <span className={s.avatar} style={{ background: bg, color: fg }} aria-hidden="true">{initials(bizName(c))}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className={s.name}>{bizName(c)}</span>
                      <span className={s.meta}>
                        {[c.segment, c.zone].filter(Boolean).join(' · ') || (c.phone ? '' : 'Sin teléfono')}
                        {c.no_answer_streak >= NO_ANSWER_LIMIT && <span className={`${s.tag} ${s.tagWarn}`}>No contesta · {c.no_answer_streak}</span>}
                      </span>
                    </span>
                    <span className={`${s.optional} ${s.meta}`} style={{ margin: 0 }}>{c.next_action || (c.last_activity_at ? '—' : 'Primer contacto')}</span>
                    <span className={`${s.optional} ${s.meta}`} style={{ margin: 0 }}>{ownerLabel(c)}</span>
                    <span className={`${s.optional} ${s.when} ${TONE[when.tone]}`}>{when.label}</span>
                    <span><StatusChip value={c.commercial_status} /></span>
                  </button>
                )
              })}
              {data.contacts.length < data.total && (
                <button className={`${s.loadMore} ${s.press}`} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Cargando…' : `Ver más (${(data.total - data.contacts.length).toLocaleString('es-MX')} más)`}
                </button>
              )}
            </>
          )}
      </div>
    </>
  )
}
