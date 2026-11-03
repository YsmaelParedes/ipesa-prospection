'use client'

import { useCallback, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import { GOAL_KEYS, GOAL_LABELS, type DayCounts, type Goals } from '@/lib/commercial'
import { Ico, initials, money, pct } from './ui'
import s from './comercial.module.css'

type Person = {
  user_id: string; name: string; role: string; goals: Goals; custom: boolean; owned: number
  day: DayCounts; dayCompliance: number
}
type Data = {
  today: string; teamGoals: Goals; people: Person[]
  totals: { prospects: number; clients: number; quoted: number; sold: number }
  byResult: { result: string; label: string; count: number }[]
  bySegment: { segment: string; count: number }[]
}

const RESULT_COLOR: Record<string, string> = {
  no_contesta: 'var(--muted-2)', contactado: 'var(--c-teal-ink)', cotizacion: 'var(--warning-fill)',
  venta: 'var(--success-fill)', no_interesado: 'var(--ink-3)', numero_equivocado: 'var(--brand)',
}
const tone = (ratio: number) => ratio >= 0.8 ? s.ok : ratio >= 0.4 ? s.mid : s.low
/** "lunes, 2 de noviembre" */
const dayName = (iso: string) => new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  .format(new Date(`${iso}T12:00:00Z`))

/**
 * "Actividad diaria" (administrador): solo lo de hoy, cada vendedor contra su
 * meta del día. Semanas y meses, con su comparación, están en Acumulado.
 */
export function ActividadView() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/data/commercial/control')
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d); setError('')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar la actividad del día')
    }
  }, [])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['commercial'], load)

  if (error) return <div className={`${s.elev} ${s.emptyList}`} role="alert">{error}</div>
  if (!data) return <div className={`${s.elev} ${s.emptyList}`}>Cargando…</div>
  const maxResult = Math.max(1, ...data.byResult.map(r => r.count))
  const maxSegment = Math.max(1, ...data.bySegment.map(r => r.count))

  return (
    <>
      <p className={s.dayLabel}>Hoy · {dayName(data.today)}</p>

      <div className={s.kpis}>
        <div className={`${s.elev} ${s.kpi}`}><small>Prospectos</small><b className={s.num}>{data.totals.prospects.toLocaleString('es-MX')}</b></div>
        <div className={`${s.elev} ${s.kpi}`}><small>Clientes</small><b className={s.num}>{data.totals.clients.toLocaleString('es-MX')}</b></div>
        <div className={`${s.elev} ${s.kpi}`}><small>Cotizado hoy</small><b className={s.num}>{money(data.totals.quoted)}</b></div>
        <div className={`${s.elev} ${s.kpi}`}><small>Vendido hoy</small><b className={s.num}>{money(data.totals.sold)}</b></div>
      </div>

      {data.people.length === 0 ? (
        <div className={`${s.elev} ${s.emptyList}`}>Aún no hay vendedores. Invítalos desde Configuración → Equipo.</div>
      ) : (
        <div className={s.people}>
          {data.people.map(p => (
            <article key={p.user_id} className={`${s.elev} ${s.person}`}>
              <div className={s.personHead}>
                <div className={s.avatar} style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }} aria-hidden="true">{initials(p.name)}</div>
                <div><b>{p.name}</b><small>{p.owned.toLocaleString('es-MX')} clientes suyos{p.custom ? ' · metas propias' : ''}</small></div>
                <span className={`${s.bigPct} ${s.num}`} title="Cumplimiento de hoy">{pct(p.dayCompliance)}</span>
              </div>
              {GOAL_KEYS.map(k => {
                const ratio = p.goals[k] ? p.day[k] / p.goals[k] : 0
                return (
                  <div key={k} className={s.goal}>
                    <span>{GOAL_LABELS[k]}</span>
                    <div className={`${s.bar} ${tone(ratio)}`}><span style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} /></div>
                    <em className={s.num}>{p.day[k]} / {p.goals[k]}</em>
                  </div>
                )
              })}
            </article>
          ))}
        </div>
      )}

      <div className={s.split}>
        <div className={`${s.elev} ${s.splitCard}`}>
          <h3>Resultados de hoy</h3>
          {data.byResult.length === 0 ? <div className={s.hMuted}>Sin actividades hoy.</div> : data.byResult.map(r => (
            <div key={r.result} className={s.brow}>
              <span>{r.label}</span>
              <div className={s.bar}><span style={{ width: `${Math.round(r.count / maxResult * 100)}%`, background: RESULT_COLOR[r.result] }} /></div>
              <em className={s.num}>{r.count}</em>
            </div>
          ))}
        </div>
        <div className={`${s.elev} ${s.splitCard}`}>
          <h3>Actividad por segmento (hoy)</h3>
          {data.bySegment.length === 0 ? <div className={s.hMuted}>Sin actividades hoy.</div> : data.bySegment.slice(0, 8).map(r => (
            <div key={r.segment} className={s.brow}>
              <span>{r.segment}</span>
              <div className={s.bar}><span style={{ width: `${Math.round(r.count / maxSegment * 100)}%`, background: 'var(--c-cyan-ink)' }} /></div>
              <em className={s.num}>{r.count}</em>
            </div>
          ))}
        </div>
      </div>

      <div className={`${s.elev} ${s.zonesNote}`}>
        <Ico.pin size={18} />
        <span style={{ flex: 1, minWidth: 220 }}><b>Para ver otros días, semanas o meses</b>, usa la pestaña Acumulado. Todos ven la base completa; el primero que trabaja un prospecto se queda con él.</span>
        <button className={`${s.ghostBtn} ${s.press}`} onClick={() => setEditing(true)}>Editar metas</button>
      </div>

      {editing && <GoalsModal data={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
    </>
  )
}

function GoalsModal({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: () => void }) {
  const [who, setWho] = useState<string>('')   // '' = toda la tienda
  const person = data.people.find(p => p.user_id === who)
  const base = person ? person.goals : data.teamGoals
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(GOAL_KEYS.map(k => [k, String(base[k])])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function choose(id: string) {
    setWho(id)
    const g = data.people.find(p => p.user_id === id)?.goals ?? data.teamGoals
    setValues(Object.fromEntries(GOAL_KEYS.map(k => [k, String(g[k])])))
    setError('')
  }

  async function send(body: Record<string, unknown>) {
    setSaving(true); setError('')
    const r = await apiFetch('/api/data/commercial/control', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError(d.error || 'No se pudieron guardar las metas'); return }
    onSaved()
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Metas diarias" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h3>Metas diarias</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>
        </div>
        <div className="modal-body">
          <div className={s.filters}>
            <button className={`${s.pill} ${s.press}`} aria-pressed={who === ''} onClick={() => choose('')}>Toda la tienda</button>
            {data.people.map(p => (
              <button key={p.user_id} className={`${s.pill} ${s.press}`} aria-pressed={who === p.user_id} onClick={() => choose(p.user_id)}>{p.name}</button>
            ))}
          </div>
          <p className={s.hMuted} style={{ fontSize: 12.5, margin: '0 0 12px' }}>
            {who ? (person?.custom ? `${person.name} tiene metas propias.` : `${person?.name} usa las metas de la tienda; al guardar tendrá las suyas.`) : 'Las usan los vendedores que no tienen metas propias.'}
          </p>
          <div className={s.goalGrid}>
            {GOAL_KEYS.map(k => (
              <label key={k} style={{ display: 'contents' }}>
                <span>{GOAL_LABELS[k]}</span>
                <input type="number" min={0} max={999} inputMode="numeric" value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          {error && <p className={s.error} role="alert">{error}</p>}
        </div>
        <div className="modal-foot">
          {who && person?.custom && (
            <button className="btn btn-ghost" disabled={saving} onClick={() => send({ user_id: who, reset: true })} style={{ marginRight: 'auto' }}>Usar las de la tienda</button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving}
            onClick={() => send({ ...(who ? { user_id: who } : {}), ...Object.fromEntries(GOAL_KEYS.map(k => [k, Number(values[k])])) })}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
