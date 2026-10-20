'use client'

import { useCallback, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import { COMMERCIAL_STATUSES, STAGE_PROBABILITY, STATUS_INFO, bucketOf, inQueue, type CommercialContact, type DayCounts } from '@/lib/commercial'
import { StatusChip, bizName, fmtDay, money } from './ui'
import s from './comercial.module.css'

type Month = {
  counts: DayCounts
  byResult: { result: string; label: string; count: number }[]
  bySegment: ({ segment: string } & DayCounts)[]
}
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Tablero comercial (hoja "Dashboard" del Excel). Dueño: la tienda completa; vendedor: lo suyo. */
export function ResumenTab({ contacts, today, salesTeam, isAdmin, onOpen, onGoTo }: {
  contacts: CommercialContact[]; today: string; salesTeam: boolean; isAdmin: boolean
  onOpen: (c: CommercialContact) => void
  onGoTo: (tab: 'hoy' | 'seguimiento' | 'base' | 'control') => void
}) {
  const [month, setMonth] = useState<Month | null>(null)
  const load = useCallback(async () => {
    if (!salesTeam) return
    const r = await apiFetch(`/api/data/commercial/control?date=${today}`).catch(() => null)
    if (r?.ok) setMonth((await r.json()).month)
  }, [today, salesTeam])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['commercial'], load)

  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(COMMERCIAL_STATUSES.map(st => [st, 0])) as Record<string, number>
    let queue = 0, overdue = 0, inPlay = 0
    for (const c of contacts) {
      byStatus[c.commercial_status] = (byStatus[c.commercial_status] ?? 0) + 1
      const b = bucketOf(c, today)
      if (inQueue(b)) queue++
      if (b === 'vencido') overdue++
      inPlay += (Number(c.potential_monthly) || 0) * (STAGE_PROBABILITY[c.commercial_status] ?? 0)
    }
    const upcoming = contacts.filter(c => bucketOf(c, today) === 'programado')
      .sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at))).slice(0, 6)
    return { byStatus, queue, overdue, inPlay, upcoming }
  }, [contacts, today])

  if (!salesTeam) {
    return (
      <div className={s.locked}>
        <strong>Tablero comercial</strong>
        Viene en los planes Galón y Cubeta: cifras del mes, embudo por etapa, resultados por segmento y el control diario de tu equipo.
      </div>
    )
  }

  const monthName = MONTHS[Number(today.slice(5, 7)) - 1]
  const funnel = COMMERCIAL_STATUSES.filter(st => st !== 'depurar' && st !== 'no_interesado')
  const maxFunnel = Math.max(1, ...funnel.map(st => stats.byStatus[st]))
  const c = month?.counts

  return (
    <div>
      <div className={s.money}>
        <button className={`${s.goal} ${s.clickable}`} onClick={() => onGoTo('hoy')}>
          <div className={s.goalLabel}>{isAdmin ? 'Pendientes hoy (equipo)' : 'Para llamar hoy'}</div>
          <div className={s.goalValue}>{stats.queue}</div>
          <div className={s.goalHint} style={stats.overdue ? { color: 'var(--danger)' } : undefined}>{stats.overdue ? `${stats.overdue} vencidas` : 'Ninguna vencida'}</div>
        </button>
        <div className={s.goal}>
          <div className={s.goalLabel}>Cotizado en {monthName}</div>
          <div className={s.goalValue}>{c ? money(c.quoted) : '—'}</div>
          <div className={s.goalHint}>{c ? `${c.quotes} cotizaci${c.quotes === 1 ? 'ón' : 'ones'}` : ''}</div>
        </div>
        <div className={s.goal}>
          <div className={s.goalLabel}>Vendido en {monthName}</div>
          <div className={s.goalValue}>{c ? money(c.sold) : '—'}</div>
          <div className={s.goalHint}>{c ? `${c.sales} venta${c.sales === 1 ? '' : 's'} · ${c.calls} llamadas` : ''}</div>
        </div>
        <button className={`${s.goal} ${s.clickable}`} onClick={() => onGoTo('seguimiento')}>
          <div className={s.goalLabel}>En juego</div>
          <div className={s.goalValue}>{money(Math.round(stats.inPlay))}</div>
          <div className={s.goalHint}>potencial × probabilidad</div>
        </button>
      </div>

      <div className={s.split2}>
        <div className={s.panel}>
          <h4>Embudo comercial</h4>
          <div className="barchart">
            {funnel.map(st => (
              <div className="bar-row" key={st}>
                <div className="bar-label"><span className="dot" style={{ background: STATUS_INFO[st].color }}></span>{STATUS_INFO[st].label}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(stats.byStatus[st] / maxFunnel) * 100}%`, background: STATUS_INFO[st].color }}></div></div>
                <div className="bar-value">{stats.byStatus[st]}</div>
              </div>
            ))}
          </div>
          <div className={s.rows} style={{ marginTop: 10 }}>
            <div className={s.row}><span>No interesados</span><b>{stats.byStatus.no_interesado}</b></div>
            <button className={`${s.row} ${s.clickable}`} onClick={() => onGoTo('base')}><span>Por depurar (estado)</span><b>{stats.byStatus.depurar}</b></button>
          </div>
        </div>

        <div className={s.panel}>
          <h4>Resultados de {monthName}</h4>
          {!month ? null : month.byResult.length === 0 ? <div className="cell-muted">Sin llamadas registradas este mes.</div> : (
            <div className={s.rows}>{month.byResult.map(r => <div key={r.result} className={s.row}><span>{r.label}</span><b>{r.count}</b></div>)}</div>
          )}
        </div>

        <div className={s.panel}>
          <h4>Por segmento en {monthName}</h4>
          {!month ? null : month.bySegment.length === 0 ? <div className="cell-muted">Sin actividad este mes.</div> : (
            <div className={s.rows}>
              {month.bySegment.slice(0, 8).map(x => (
                <div key={x.segment} className={s.row}><span>{x.segment}</span><b>{x.calls} llamadas · {x.quotes} cot. · {x.sales} ventas</b></div>
              ))}
            </div>
          )}
        </div>

        <div className={s.panel}>
          <h4>Próximos seguimientos</h4>
          {stats.upcoming.length === 0 ? <div className="cell-muted">Nada programado después de hoy.</div> : (
            <div className={s.rows}>
              {stats.upcoming.map(x => (
                <button key={x.id} className={`${s.row} ${s.clickable}`} onClick={() => onOpen(x)}>
                  <span>{bizName(x)} · <span className="cell-muted">{x.next_action || 'Dar seguimiento'}</span></span>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><StatusChip value={x.commercial_status} /><b>{fmtDay(x.next_action_at!)}</b></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div style={{ marginTop: 14 }}>
          <button className="link-btn" onClick={() => onGoTo('control')}>Ver el control diario del equipo →</button>
        </div>
      )}
    </div>
  )
}
