'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { KIND_LABELS, isEffective, resultLabel, type ActivityKind } from '@/lib/commercial'
import { Ico, money } from './ui'
import s from './comercial.module.css'

export type Metric = 'calls' | 'effective' | 'quotes' | 'followups' | 'sales'

type Activity = {
  id: string; contact_id: string; contact_name: string; kind: ActivityKind; result: string | null
  note: string | null; quote_amount: number | null; sale_amount: number | null; is_followup: boolean; created_at: string
}

/** Las mismas reglas que las metas del día (countActivities): las notas no cuentan. */
const METRICS: { key: Metric; label: string; test: (a: Activity) => boolean }[] = [
  { key: 'calls', label: 'Llamadas', test: a => a.kind === 'llamada' },
  { key: 'effective', label: 'Efectivos', test: a => isEffective(a.result) },
  { key: 'quotes', label: 'Cotizaciones', test: a => a.result === 'cotizacion' },
  { key: 'followups', label: 'Seguimientos', test: a => a.is_followup },
  { key: 'sales', label: 'Ventas', test: a => a.result === 'venta' },
]

const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })

/**
 * Lo que hiciste hoy, por medida (se abre al tocar la franja de avance).
 * Al tocar un cliente se abre su ficha.
 */
export function DoneToday({ today, uid, initial, onOpen, onClose }: {
  today: string
  uid: string
  initial: Metric
  onOpen: (contactId: string) => void
  onClose: () => void
}) {
  const [metric, setMetric] = useState<Metric>(initial)
  const [list, setList] = useState<Activity[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    apiFetch(`/api/data/commercial/activities?from=${today}&to=${today}&user=${uid}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error)
        if (alive) setList((d.activities ?? []).filter((a: Activity) => a.kind !== 'nota'))
      })
      .catch(e => { if (alive) setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar lo de hoy') })
    return () => { alive = false }
  }, [today, uid])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const current = METRICS.find(m => m.key === metric)!
  const shown = (list ?? []).filter(current.test)

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-label="Lo que hiciste hoy" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Lo que hiciste hoy</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>
        </div>
        <div className="modal-body">
          <div className={s.subTabs} role="group" aria-label="Medida">
            {METRICS.map(m => (
              <button key={m.key} type="button" className={`${s.subTab} ${s.press}`} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
                {m.label} <small className={s.num}>{list ? list.filter(m.test).length : '—'}</small>
              </button>
            ))}
          </div>
          <div className={`${s.elev} ${s.listCard}`}>
            {error ? <div className={s.emptyList} role="alert">{error}</div>
              : !list ? <div className={s.emptyList}>Cargando…</div>
              : shown.length === 0 ? <div className={s.emptyList}>Todavía no hay {current.label.toLowerCase()} hoy.</div>
              : shown.map(a => (
                <button key={a.id} type="button" className={s.doneRow} onClick={() => onOpen(a.contact_id)}>
                  <span className={`${s.num} ${s.doneHour}`}>{hour(a.created_at)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className={s.name}>{a.contact_name}</span>
                    <span className={s.meta}>
                      {[KIND_LABELS[a.kind] ?? a.kind, a.result && resultLabel(a.result)].filter(Boolean).join(' · ')}
                      {a.quote_amount ? ` · ${money(a.quote_amount)}` : ''}{a.sale_amount ? ` · vendió ${money(a.sale_amount)}` : ''}
                      {a.note ? ` · «${a.note}»` : ''}
                    </span>
                  </span>
                  <Ico.next />
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
