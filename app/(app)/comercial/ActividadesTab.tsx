'use client'

import { useCallback, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import { ACTIVITY_KINDS, KIND_LABELS, RESULTS, RESULT_RULES, addDays, resultLabel, type ActivityKind } from '@/lib/commercial'
import { Select } from '@/components/Select'
import { fmtDay, money, type Member } from './ui'
import s from './comercial.module.css'

type Row = {
  id: string; contact_id: string; contact_name: string; user_name: string | null
  kind: ActivityKind; result: string | null; note: string | null
  quote_amount: number | null; sale_amount: number | null
  next_action: string | null; next_action_at: string | null; created_at: string
}
type Period = 'hoy' | 'ayer' | '7' | 'mes'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'hoy', label: 'Hoy' }, { key: 'ayer', label: 'Ayer' }, { key: '7', label: 'Últimos 7 días' }, { key: 'mes', label: 'Este mes' },
]
const range = (p: Period, today: string) =>
  p === 'hoy' ? { from: today, to: today }
  : p === 'ayer' ? { from: addDays(today, -1), to: addDays(today, -1) }
  : p === '7' ? { from: addDays(today, -6), to: today }
  : { from: `${today.slice(0, 7)}-01`, to: today }
const time = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

/** Bitácora de llamadas, WhatsApp, visitas y notas (la hoja "Actividades" del Excel). */
export function ActividadesTab({ today, isAdmin, team, onOpen }: {
  today: string; isAdmin: boolean; team: Member[]
  onOpen: (contactId: string) => void
}) {
  const [period, setPeriod] = useState<Period>('hoy')
  const [kind, setKind]     = useState('')
  const [result, setResult] = useState('')
  const [user, setUser]     = useState('')
  const [rows, setRows]     = useState<Row[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError]   = useState('')

  const load = useCallback(async () => {
    setError('')
    const q = new URLSearchParams({ ...range(period, today), ...(kind ? { kind } : {}), ...(result ? { result } : {}), ...(user ? { user } : {}) })
    try {
      const r = await apiFetch(`/api/data/commercial/activities?${q}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudieron cargar las actividades'); return }
      setRows(d.activities ?? [])
      setTruncated(!!d.truncated)
    } catch { setError('Error de conexión') }
  }, [period, kind, result, user, today])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['commercial'], load)

  const totals = (rows ?? []).reduce((t, a) => ({ quoted: t.quoted + (Number(a.quote_amount) || 0), sold: t.sold + (Number(a.sale_amount) || 0) }), { quoted: 0, sold: 0 })

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        {PERIODS.map(p => (
          <button key={p.key} className={`filter-pill ${period === p.key ? 'active' : ''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>
        ))}
        <Select value={kind} onChange={setKind} aria-label="Tipo" style={{ minWidth: 140 }}
          options={[{ value: '', label: 'Todos los tipos' }, ...ACTIVITY_KINDS.map(k => ({ value: k, label: KIND_LABELS[k] }))]} />
        <Select value={result} onChange={setResult} aria-label="Resultado" style={{ minWidth: 170 }}
          options={[{ value: '', label: 'Todos los resultados' }, ...RESULTS.map(r => ({ value: r, label: RESULT_RULES[r].label }))]} />
        {isAdmin && team.length > 1 && (
          <Select value={user} onChange={setUser} aria-label="Persona" style={{ minWidth: 170 }}
            options={[{ value: '', label: 'Todo el equipo' }, ...team.map(m => ({ value: m.user_id, label: m.name }))]} />
        )}
      </div>

      {error && <div className="field-error" style={{ marginBottom: 10 }}>{error}</div>}
      {rows === null ? null : rows.length === 0 ? (
        <div className="empty-state">Sin actividades en este periodo.</div>
      ) : (
        <>
          <div className={s.sectionLabel}>
            {rows.length}{truncated ? '+' : ''} actividad{rows.length !== 1 ? 'es' : ''}
            {totals.quoted ? ` · cotizado ${money(totals.quoted)}` : ''}{totals.sold ? ` · vendido ${money(totals.sold)}` : ''}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Fecha</th><th>Cliente</th><th>Tipo · resultado</th><th className="col-secondary">Nota</th><th style={{ textAlign: 'right' }}>Monto</th><th className="col-secondary">Siguiente</th>{isAdmin && <th className="col-secondary">Registró</th>}</tr>
              </thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id} onClick={() => onOpen(a.contact_id)}>
                    <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{period === 'hoy' ? time(a.created_at) : `${dayLabel(a.created_at)} · ${time(a.created_at)}`}</td>
                    <td data-label="Cliente"><strong>{a.contact_name}</strong></td>
                    <td data-label="Resultado">{KIND_LABELS[a.kind] ?? a.kind}{a.result ? ` · ${resultLabel(a.result)}` : ''}</td>
                    <td data-label="Nota" className="col-secondary">{a.note ? <span className={s.note} title={a.note}>{a.note}</span> : <span className="cell-muted">—</span>}</td>
                    <td data-label="Monto" className="cell-mono" style={{ textAlign: 'right' }}>{a.sale_amount ? money(a.sale_amount) : a.quote_amount ? money(a.quote_amount) : '—'}</td>
                    <td data-label="Siguiente" className="col-secondary cell-muted">{a.next_action_at && a.kind !== 'nota' ? `${a.next_action || 'Seguimiento'} · ${fmtDay(a.next_action_at)}` : '—'}</td>
                    {isAdmin && <td data-label="Registró" className="col-secondary cell-muted">{a.user_name || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {truncated && <div className="cell-muted" style={{ fontSize: 12, marginTop: 8 }}>Se muestran las 500 más recientes; acota el periodo o los filtros para ver el resto.</div>}
        </>
      )}
    </div>
  )
}
