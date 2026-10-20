'use client'

import { useCallback, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { GOAL_KEYS, GOAL_LABELS, type DayCounts, type Goals } from '@/lib/commercial'
import { Select } from '@/components/Select'
import { money, type Member } from './ui'
import s from './comercial.module.css'

type Control = {
  date: string
  goals: Goals
  people: { user_id: string; name: string; role: string; counts: DayCounts }[]
  day: DayCounts
  month: {
    from: string
    counts: DayCounts
    byResult: { result: string; label: string; count: number }[]
    bySegment: ({ segment: string } & DayCounts)[]
  }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function ControlTab({ today, isAdmin, readonly, team, salesTeam }: {
  today: string; isAdmin: boolean; readonly: boolean; team: Member[]; salesTeam: boolean
}) {
  const [date, setDate]     = useState(today)
  const [person, setPerson] = useState('')
  const [data, setData]     = useState<Control | null>(null)
  const [error, setError]   = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]   = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!salesTeam) return
    setError('')
    try {
      const q = new URLSearchParams({ date, ...(person ? { user: person } : {}) })
      const r = await apiFetch(`/api/data/commercial/control?${q}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo cargar el control diario'); return }
      setData(d)
    } catch { setError('Error de conexión') }
  }, [date, person, salesTeam])
  useQueryEffect(() => { load() }, [load])

  if (!salesTeam) {
    return (
      <div className={s.locked}>
        <strong>Control diario, metas y reparto del equipo</strong>
        Vienen en los planes Galón y Cubeta: reparte contactos entre tus vendedores y mide cada día llamadas, cotizaciones y ventas contra la meta.
      </div>
    )
  }

  const saveGoals = async () => {
    setSaving(true); setError('')
    try {
      const body = Object.fromEntries(GOAL_KEYS.map(k => [k, Number(draft[k])]))
      const r = await apiFetch('/api/data/commercial/control', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudieron guardar las metas'); return }
      setEditing(false)
      load()
    } finally { setSaving(false) }
  }

  const counts = data ? (person || !isAdmin ? data.people[0]?.counts ?? data.day : data.day) : null
  // Meta del equipo = meta por persona × personas que se están viendo
  const factor = data ? Math.max(1, isAdmin && !person ? data.people.length : 1) : 1
  const monthName = data ? MONTHS[Number(data.month.from.slice(5, 7)) - 1] : ''

  return (
    <div>
      <div className={s.controlHead}>
        <input type="date" value={date} max={today} onChange={e => setDate(e.target.value || today)} aria-label="Día" />
        {isAdmin && team.length > 1 && (
          <Select value={person} onChange={setPerson} aria-label="Persona" style={{ minWidth: 200 }}
            options={[{ value: '', label: 'Todo el equipo' }, ...team.map(m => ({ value: m.user_id, label: m.name }))]} />
        )}
        {isAdmin && !readonly && data && !editing && (
          <button className="btn btn-ghost" onClick={() => { setDraft(Object.fromEntries(GOAL_KEYS.map(k => [k, String(data.goals[k])]))); setEditing(true) }}>
            Editar metas
          </button>
        )}
      </div>

      {editing && (
        <div className={s.panel} style={{ marginBottom: 14 }}>
          <h4>Meta diaria por persona</h4>
          <div className={s.goalsForm}>
            {GOAL_KEYS.map(k => (
              <div className="field" key={k} style={{ margin: 0 }}>
                <label htmlFor={`goal-${k}`}>{GOAL_LABELS[k]}</label>
                <input id={`goal-${k}`} type="number" min="0" max="999" inputMode="numeric" value={draft[k] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveGoals} disabled={saving}>{saving ? 'Guardando…' : 'Guardar metas'}</button>
          </div>
        </div>
      )}

      {error && <div className="field-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!data || !counts ? null : (
        <>
          <div className={s.goals}>
            {GOAL_KEYS.map(k => {
              const goal = data.goals[k] * factor
              const done = goal > 0 && counts[k] >= goal
              return (
                <div key={k} className={`${s.goal} ${done ? s.goalDone : ''}`}>
                  <div className={s.goalLabel}>{GOAL_LABELS[k]}</div>
                  <div className={s.goalValue}>{counts[k]} <small>/ {goal}</small></div>
                  <div className="progress-bar" aria-hidden="true"><div className="progress-fill" style={{ width: `${goal ? Math.min(100, (counts[k] / goal) * 100) : 0}%` }} /></div>
                </div>
              )
            })}
          </div>

          <div className={s.money}>
            <div className={s.goal}><div className={s.goalLabel}>Cotizado en el día</div><div className={s.goalValue}>{money(counts.quoted)}</div></div>
            <div className={s.goal}><div className={s.goalLabel}>Vendido en el día</div><div className={s.goalValue}>{money(counts.sold)}</div></div>
            <div className={s.goal}><div className={s.goalLabel}>Cotizado en {monthName}</div><div className={s.goalValue}>{money(data.month.counts.quoted)}</div></div>
            <div className={s.goal}><div className={s.goalLabel}>Vendido en {monthName}</div><div className={s.goalValue}>{money(data.month.counts.sold)}</div></div>
          </div>

          {isAdmin && !person && data.people.length > 1 && (
            <div className={`table-wrap ${s.people}`}>
              <table className="table">
                <thead>
                  <tr><th>Persona</th>{GOAL_KEYS.map(k => <th key={k} style={{ textAlign: 'right' }}>{GOAL_LABELS[k]}</th>)}<th style={{ textAlign: 'right' }}>Vendido</th></tr>
                </thead>
                <tbody>
                  {data.people.map(p => (
                    <tr key={p.user_id} onClick={() => setPerson(p.user_id)}>
                      <td><strong>{p.name}</strong></td>
                      {GOAL_KEYS.map(k => (
                        <td key={k} data-label={GOAL_LABELS[k]} className="cell-mono" style={{ textAlign: 'right', color: p.counts[k] >= data.goals[k] && data.goals[k] > 0 ? 'var(--success)' : undefined }}>
                          {p.counts[k]} / {data.goals[k]}
                        </td>
                      ))}
                      <td data-label="Vendido" className="cell-mono" style={{ textAlign: 'right' }}>{money(p.counts.sold)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={s.split2}>
            <div className={s.panel}>
              <h4>Resultados de {monthName}</h4>
              {data.month.byResult.length === 0 ? <div className="cell-muted">Sin llamadas registradas este mes.</div> : (
                <div className={s.rows}>
                  {data.month.byResult.map(r => <div key={r.result} className={s.row}><span>{r.label}</span><b>{r.count}</b></div>)}
                </div>
              )}
            </div>
            <div className={s.panel}>
              <h4>Por segmento en {monthName}</h4>
              {data.month.bySegment.length === 0 ? <div className="cell-muted">Sin actividad este mes.</div> : (
                <div className={s.rows}>
                  {data.month.bySegment.slice(0, 10).map(x => (
                    <div key={x.segment} className={s.row}>
                      <span>{x.segment}</span>
                      <b>{x.calls} llamadas · {x.quotes} cot. · {x.sales} ventas</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
