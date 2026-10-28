'use client'

import { useCallback, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import type { ResultChoice } from '@/lib/commercial'
import { Select } from '@/components/Select'
import type { Opened } from './HoyView'
import { bizName, fmtDay, localDay, money, type ListContact } from './ui'
import s from './comercial.module.css'

type Opportunity = ListContact & { owner_name: string | null; quote_amount: number; quoted_at: string | null; probability: number; days_idle: number | null }
type Data = { today: string; team: boolean; opportunities: Opportunity[]; totals: { open: number; quoted: number; expected: number; stale: number } }

/**
 * Oportunidades: cotizaciones abiertas, la más vieja primero. "Ganada" y
 * "Perdida" abren el registro con el resultado ya elegido (Venta / No
 * interesado); "Seguimiento" lo abre para anotar cualquier otro avance.
 */
export function OportunidadesView({ isAdmin, segments, onOpen }: { isAdmin: boolean; segments: string[]; onOpen: (o: Opened) => void }) {
  const [team, setTeam] = useState(false)
  const [segment, setSegment] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/data/commercial/opportunities${team ? '?scope=team' : ''}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d); setError('')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudieron cargar las oportunidades')
    }
  }, [team])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['commercial'], load)

  const open = (o: Opportunity, result?: ResultChoice) => onOpen({ id: o.id, result })

  // Con segmento elegido se filtra aquí mismo y los totales se recalculan igual que en el servidor
  const view = useMemo(() => {
    if (!data || !segment) return data
    const opportunities = data.opportunities.filter(o => o.segment === segment)
    const quoted = opportunities.reduce((sum, o) => sum + o.quote_amount, 0)
    return {
      ...data, opportunities,
      totals: {
        open: opportunities.length, quoted,
        expected: Math.round(opportunities.reduce((sum, o) => sum + o.quote_amount * o.probability, 0)),
        stale: opportunities.filter(o => (o.days_idle ?? 0) > 7).length,
      },
    }
  }, [data, segment])

  if (error) return <div className={`${s.elev} ${s.emptyList}`} role="alert">{error}</div>
  if (!view) return <div className={`${s.elev} ${s.emptyList}`}>Cargando…</div>
  const { totals } = view

  return (
    <>
      <div className={s.kpis}>
        <div className={`${s.elev} ${s.kpi}`}><small>Cotizaciones abiertas</small><b className={s.num}>{totals.open}</b></div>
        <div className={`${s.elev} ${s.kpi}`}><small>Cotizado</small><b className={s.num}>{money(totals.quoted)}</b></div>
        <div className={`${s.elev} ${s.kpi}`}><small>Esperado (monto × probabilidad)</small><b className={s.num}>{money(totals.expected)}</b></div>
        <div className={`${s.elev} ${s.kpi}`}><small>Más de 7 días sin contacto</small><b className={s.num} style={{ color: totals.stale ? 'var(--danger)' : undefined }}>{totals.stale}</b></div>
      </div>

      {(isAdmin || segments.length > 0) && (
        <div className={s.filters}>
          {isAdmin && (
            <>
              <button className={`${s.pill} ${s.press}`} aria-pressed={!team} onClick={() => setTeam(false)}>Mías</button>
              <button className={`${s.pill} ${s.press}`} aria-pressed={team} onClick={() => setTeam(true)}>De todo el equipo</button>
            </>
          )}
          {segments.length > 0 && (
            <div className={s.segmentPick}>
              <Select value={segment} onChange={setSegment} aria-label="Segmento"
                options={[{ value: '', label: 'Todos los segmentos' }, ...segments.map(x => ({ value: x, label: x }))]} />
            </div>
          )}
        </div>
      )}

      <div className={`${s.elev} ${s.listCard}`}>
        {view.opportunities.length === 0 ? (
          <div className={s.emptyList}>
            {segment ? 'No hay cotizaciones abiertas de este segmento.' : <>No hay cotizaciones abiertas. Cuando registres «Cotización enviada», aparecen aquí para darles seguimiento.</>}
          </div>
        ) : (
          <>
            <div className={`${s.oppRow} ${s.oppHead}`} aria-hidden="true">
              <span>Cliente</span>
              <span className={s.optional}>{team ? 'Vendedor' : 'Zona'}</span>
              <span className={s.optional}>Cotizado el</span>
              <span className={s.optional}>Sin contacto</span>
              <span className={`${s.right} ${s.optional}`}>Monto</span>
              <span className={`${s.right} ${s.optional}`}>Prob.</span>
              <span />
            </div>
            {view.opportunities.map(o => {
              const stale = (o.days_idle ?? 0) > 7
              return (
                <div key={o.id} className={s.oppRow}>
                  <span style={{ minWidth: 0 }}>
                    <span className={s.name}>{bizName(o)}</span>
                    <span className={s.meta}>
                      <span>{[o.segment, o.zone].filter(Boolean).join(' · ')}</span>
                      <b className={`${s.num} ${s.mobileOnly}`}>{money(o.quote_amount)}</b>
                      {o.days_idle !== null && <span className={s.mobileOnly} style={{ color: stale ? 'var(--danger)' : undefined }}>{o.days_idle === 0 ? 'Hoy' : `${o.days_idle} días sin contacto`}</span>}
                    </span>
                  </span>
                  <span className={s.optional}>{team ? (o.owner_name ?? 'Sin asignar') : (o.zone ?? '—')}</span>
                  <span className={`${s.optional} ${s.num}`}>{o.quoted_at ? fmtDay(localDay(o.quoted_at)) : '—'}</span>
                  <span className={`${s.optional} ${s.num}`} style={{ color: stale ? 'var(--danger)' : undefined, fontWeight: stale ? 800 : undefined }}>
                    {o.days_idle === null ? '—' : `${o.days_idle} días`}
                  </span>
                  <span className={`${s.right} ${s.optional} ${s.num}`}><b>{money(o.quote_amount)}</b></span>
                  <span className={`${s.right} ${s.optional}`}><span className={`${s.prob} ${s.num}`}>{Math.round(o.probability * 100)} %</span></span>
                  <span className={s.oppActs}>
                    <button className={`${s.win} ${s.press}`} onClick={() => open(o, 'venta')}>✓ Ganada</button>
                    <button className={`${s.lose} ${s.press}`} onClick={() => open(o, 'no_interesado')}>Perdida</button>
                    <button className={`${s.follow} ${s.press}`} onClick={() => open(o)}>Seguimiento</button>
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}
