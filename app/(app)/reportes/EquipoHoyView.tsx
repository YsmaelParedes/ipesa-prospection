'use client'

import { useState } from 'react'
import { Download, Pencil } from 'lucide-react'
import Link from '@/components/CachedLink'
import { apiFetch } from '@/lib/apiClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { notifyDataChanged } from '@/lib/crmEvents'
import { downloadTableWorkbook } from '@/lib/exportData'
import { GOAL_KEYS, GOAL_LABELS, type DayCounts, type Goals } from '@/lib/commercial'
import { filtersQuery, type ReportFilters as Filters } from '@/lib/reports'
import { Ico, initials } from '../comercial/ui'
import c from '../comercial/comercial.module.css'
import { BarList, Meter, money, pct, toneOf } from './charts'
import { ReportFilters, type FilterOptions } from './ReportFilters'
import { SortTable, type Column } from './SortTable'
import { EquipoHoySkeleton } from './Skeletons'
import s from './reportes.module.css'

type Person = { user_id: string; name: string; role: string; goals: Goals; custom: boolean; day: DayCounts; dayCompliance: number }
type TeamData = {
  today: string; teamGoals: Goals; sellerGoals?: boolean; people: Person[]
  team: { day: DayCounts; goals: Goals; compliance: number }
  byResult: { result: string; label: string; count: number }[]
  options: FilterOptions
}

/** "22 de noviembre" */
const dayName = (iso: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))

/**
 * Reportes › Equipo hoy (administradores): cada vendedor contra su meta de
 * hoy, cómo les fue y el detalle por vendedor. Aquí se editan las metas.
 */
export function EquipoHoyView({ filters, onFilters, compact, readonly }: {
  filters: Filters; onFilters: (f: Filters) => void; compact: boolean; readonly: boolean
}) {
  // Equipo hoy no usa periodo: solo vendedor, zona y segmento
  const q = filtersQuery({ ...filters, period: 'month', from: '', to: '', compare: true })
  const { data, error, reload } = useCachedQuery<TeamData>(`/api/data/commercial/control${q ? `?${q}` : ''}`)
  const [editing, setEditing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const columns: Column<Person>[] = [
    { key: 'name', head: 'Vendedor', sort: p => p.name, cell: p => <span className={s.who}><span className={s.avatar} aria-hidden="true">{initials(p.name)}</span>{p.name}</span> },
    ...GOAL_KEYS.map(k => ({
      key: k, head: GOAL_LABELS[k], right: true, sort: (p: Person) => p.day[k],
      cell: (p: Person) => <>{p.day[k]} <small>/ {p.goals[k]}</small></>,
    })),
    { key: 'quoted', head: 'Cotizado', right: true, sort: p => p.day.quoted, cell: p => money(p.day.quoted) },
    { key: 'sold', head: 'Vendido', right: true, sort: p => p.day.sold, cell: p => money(p.day.sold) },
    {
      key: 'compliance', head: 'Meta del día', sort: p => p.dayCompliance,
      cell: p => <span className={s.pct}><i><span className={s[toneOf(p.dayCompliance)]} style={{ width: `${Math.min(100, Math.round(p.dayCompliance * 100))}%` }} /></i>{pct(p.dayCompliance)}</span>,
    },
  ]

  const download = async () => {
    if (!data) return
    setExporting(true)
    try {
      await downloadTableWorkbook(`equipo-hoy-${data.today}.xlsx`, 'Equipo hoy',
        ['Vendedor', ...GOAL_KEYS.flatMap(k => [GOAL_LABELS[k], `Meta ${GOAL_LABELS[k].toLowerCase()}`]), 'Correos', 'Cotizado', 'Vendido', 'Meta del día %'],
        data.people.map(p => [p.name, ...GOAL_KEYS.flatMap(k => [p.day[k], p.goals[k]]), p.day.emails ?? 0, p.day.quoted, p.day.sold, Math.round(p.dayCompliance * 100)]))
    } finally { setExporting(false) }
  }

  const bar = (
    <div className={s.row}>
      {data && <span className={s.dayLabel}>Hoy · {dayName(data.today)}</span>}
      <ReportFilters filters={filters} onChange={onFilters} options={data?.options} noPeriod compact={compact} />
      <div className={s.spacer} />
      {!readonly && (
        <button type="button" className={`${s.btn} ${s.press}`} disabled={!data} onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" />Editar metas
        </button>
      )}
      <button type="button" className={`${s.btn} ${compact ? s.iconBtn : ''} ${s.press}`} disabled={!data || exporting} onClick={download}
        aria-label={compact ? 'Descargar Excel' : undefined}>
        <Download aria-hidden="true" />{!compact && (exporting ? 'Preparando…' : 'Descargar Excel')}
      </button>
    </div>
  )

  if (error && !data) return <>{bar}<div className={`${s.card} ${s.error}`} role="alert">{error.message || 'No se pudo cargar la actividad del día'}</div></>
  if (!data) return <>{bar}<EquipoHoySkeleton /></>

  const t = data.team
  const ratio = (k: keyof Goals) => t.goals[k] ? t.day[k] / t.goals[k] : 0
  const goalCard = (k: keyof Goals) => (
    <div key={k} className={`${s.card} ${s.kpi}`}>
      <small>{GOAL_LABELS[k]}</small>
      <b className={s.num}>{t.day[k].toLocaleString('es-MX')} <em>de {t.goals[k].toLocaleString('es-MX')}</em></b>
      <Meter ratio={ratio(k)} />
    </div>
  )

  return (
    <>
      {bar}
      <section className={s.kpis} aria-label="Números de hoy">
        <div className={`${s.card} ${s.kpi}`}><small>Meta del equipo</small><b className={s.num}>{pct(t.compliance)}</b><Meter ratio={t.compliance} /></div>
        {(['calls', 'effective', 'quotes', 'sales'] as const).map(goalCard)}
        <div className={`${s.card} ${s.kpi}`}>
          <small>Vendido hoy</small><b className={s.num}>{money(t.day.sold)}</b>
          <span className={s.kpiSub}>Cotizado hoy: {money(t.day.quoted)}</span>
        </div>
      </section>

      {data.people.length === 0 ? (
        <div className={`${s.card} ${s.empty}`}>Aún no hay vendedores. Invítalos desde <Link href="/configuracion?tab=equipo" className="auth-link strong">Configuración → Equipo</Link>.</div>
      ) : (
        <>
          <div className={s.grid2}>
            <section className={`${s.card} ${s.chart}`}>
              <h3>Cada vendedor contra su meta de hoy</h3>
              <p className={s.sub}>Cuánto de su meta del día lleva cada uno, sumando llamadas, efectivos, cotizaciones, seguimientos y ventas.</p>
              <BarList track max={1} rows={data.people.map(p => ({ key: p.user_id, label: p.name, value: Math.min(1, p.dayCompliance), tone: toneOf(p.dayCompliance), text: pct(p.dayCompliance) }))} />
            </section>
            <section className={`${s.card} ${s.chart}`}>
              <h3>Cómo les fue hoy</h3>
              <p className={s.sub}>El resultado de cada llamada, WhatsApp, visita o correo registrado hoy.</p>
              <BarList empty="Aún no hay actividades hoy."
                rows={data.byResult.slice().sort((a, b) => b.count - a.count).map(r => ({ key: r.result, label: r.label, value: r.count, text: r.count.toLocaleString('es-MX') }))} />
            </section>
          </div>
          <section className={`${s.card} ${s.chart}`}>
            <h3>Detalle por vendedor</h3>
            <p className={s.sub}>Lo que lleva cada uno contra su meta del día. Toca un encabezado para ordenar.</p>
            <SortTable label="Detalle por vendedor" rows={data.people} columns={columns} rowKey={p => p.user_id} initial={{ key: 'compliance', desc: true }} />
          </section>
        </>
      )}

      {editing && <GoalsModal data={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); notifyDataChanged('commercial'); void reload() }} />}
    </>
  )
}

/** Metas diarias de la tienda y, en Cubeta, las propias de cada vendedor. */
function GoalsModal({ data, onClose, onSaved }: { data: TeamData; onClose: () => void; onSaved: () => void }) {
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
          {data.sellerGoals ? (
            <>
              <div className={c.filters}>
                <button className={`${c.pill} ${c.press}`} aria-pressed={who === ''} onClick={() => choose('')}>Toda la tienda</button>
                {data.people.map(p => (
                  <button key={p.user_id} className={`${c.pill} ${c.press}`} aria-pressed={who === p.user_id} onClick={() => choose(p.user_id)}>{p.name}</button>
                ))}
              </div>
              <p className={c.hMuted} style={{ fontSize: 12.5, margin: '0 0 12px' }}>
                {who ? (person?.custom ? `${person.name} tiene metas propias.` : `${person?.name} usa las metas de la tienda; al guardar tendrá las suyas.`) : 'Las usan los vendedores que no tienen metas propias.'}
              </p>
            </>
          ) : (
            <p className={c.hMuted} style={{ fontSize: 12.5, margin: '0 0 12px' }}>
              Todo el equipo usa estas metas. Para darle a cada vendedor las suyas, el plan Cubeta incluye metas propias por vendedor
              (<Link href="/configuracion?tab=plan" className="auth-link strong">ver planes</Link>).
            </p>
          )}
          <div className={c.goalGrid}>
            {GOAL_KEYS.map(k => (
              <label key={k} style={{ display: 'contents' }}>
                <span>{GOAL_LABELS[k]}</span>
                <input type="number" min={0} max={999} inputMode="numeric" value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <p className={c.hMuted} style={{ fontSize: 12, margin: '12px 0 0' }}>Son metas diarias. En semanas y meses se cuentan por días hábiles, de lunes a sábado.</p>
          {error && <p className={c.error} role="alert">{error}</p>}
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
