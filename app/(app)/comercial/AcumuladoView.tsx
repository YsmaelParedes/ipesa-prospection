'use client'

import { Fragment, useCallback, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import { GOAL_KEYS, GOAL_LABELS, type DayCounts, type Goals, type Period } from '@/lib/commercial'
import { Ico, fmtDay, initials, money, pct } from './ui'
import { AmountDetail, type AmountKind } from './AmountDetail'
import s from './comercial.module.css'

type Person = {
  user_id: string; name: string; custom: boolean
  counts: DayCounts; prev: DayCounts; goals: Goals; compliance: number
}
type Data = {
  period: Period; offset: number; from: string; to: string; end: string; today: string
  goalDays: number; fullDays: number; startedDays: number; elapsedDays: number
  partial: boolean; prevFrom: string; prevEnd: string
  totals: DayCounts; prev: DayCounts; goals: Goals
  compliance: number; prevCompliance: number; people: Person[]
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const tone = (ratio: number) => ratio >= 0.8 ? s.ok : ratio >= 0.4 ? s.mid : s.low
const cap = (t: string) => t[0].toUpperCase() + t.slice(1)
const PREV_LABEL: Record<Period, string> = { day: 'Día anterior', week: 'Semana anterior', month: 'Mes anterior' }
const NEXT_LABEL: Record<Period, string> = { day: 'Día siguiente', week: 'Semana siguiente', month: 'Mes siguiente' }

/** "lunes" */
const weekday = (iso: string) => new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))

function periodLabel(d: Data): string {
  if (d.period === 'day') {
    const day = `${weekday(d.from)} ${fmtDay(d.from)}`
    return d.offset === 0 ? `Hoy · ${day}` : d.offset === 1 ? `Ayer · ${day}` : cap(day)
  }
  if (d.period === 'week') {
    const range = `${fmtDay(d.from)} – ${fmtDay(d.to)}`
    return d.offset === 0 ? `Esta semana · ${range}` : d.offset === 1 ? `Semana pasada · ${range}` : range
  }
  const [year, month] = d.from.split('-').map(Number)
  const name = cap(MESES[month - 1]) + (year !== Number(d.today.slice(0, 4)) ? ` ${year}` : '')
  return d.offset === 0 ? `Este mes · ${name}` : d.offset === 1 ? `Mes pasado · ${name}` : name
}

/** Contra los mismos días del periodo anterior: ▲ sube, ▼ baja. */
function Delta({ now, before, isMoney }: { now: number; before: number; isMoney?: boolean }) {
  const diff = now - before
  const was = isMoney ? money(before) : before.toLocaleString('es-MX')
  if (!now && !before) return <span className={s.delta}>Sin actividad</span>
  if (diff === 0) return <span className={s.delta} title={`Antes: ${was}`}>Igual que antes</span>
  const size = before > 0 ? `${Math.round(Math.abs(diff) / before * 100)} %` : isMoney ? money(Math.abs(diff)) : Math.abs(diff).toLocaleString('es-MX')
  return (
    <span className={`${s.delta} ${diff > 0 ? s.up : s.down}`} title={`Antes: ${was}`}>
      {diff > 0 ? '▲' : '▼'} {size}
    </span>
  )
}

/** "Acumulado" (administrador): totales de un día, la semana o el mes, comparados con el periodo anterior. */
export function AcumuladoView({ onOpen }: { onOpen: (contactId: string) => void }) {
  const [period, setPeriod] = useState<Period>('week')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  // Tarjeta de monto abierta: a qué clientes se cotizó o vendió
  const [detail, setDetail] = useState<AmountKind | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/data/commercial/summary?period=${period}&offset=${offset}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d); setError('')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar el acumulado')
    }
  }, [period, offset])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['commercial'], load)

  const choose = (p: Period) => { setPeriod(p); setOffset(0); setData(null); setDetail(null) }

  const picker = (
    <div className={s.teamTop}>
      <div className={s.filters} style={{ margin: 0 }}>
        <button className={`${s.pill} ${s.press}`} aria-pressed={period === 'day'} onClick={() => choose('day')}>Día</button>
        <button className={`${s.pill} ${s.press}`} aria-pressed={period === 'week'} onClick={() => choose('week')}>Semana</button>
        <button className={`${s.pill} ${s.press}`} aria-pressed={period === 'month'} onClick={() => choose('month')}>Mes</button>
      </div>
      <div className={s.periodNav}>
        <button className={`${s.navBtn} ${s.press}`} onClick={() => setOffset(o => o + 1)}
          aria-label={PREV_LABEL[period]}>‹</button>
        <span className={s.periodLabel}>{data ? periodLabel(data) : '…'}</span>
        <button className={`${s.navBtn} ${s.press}`} disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - 1))}
          aria-label={NEXT_LABEL[period]}>›</button>
      </div>
      {offset > 0 && <button className={`${s.ghostBtn} ${s.press}`} onClick={() => setOffset(0)}>Volver a hoy</button>}
    </div>
  )

  if (error) return <>{picker}<div className={`${s.elev} ${s.emptyList}`} role="alert">{error}</div></>
  if (!data) return <>{picker}<div className={`${s.elev} ${s.emptyList}`}>Cargando…</div></>

  const week = data.period === 'week'
  const compare = data.period === 'day'
    ? 'Comparado con el día anterior.'
    : data.partial
      ? `Comparado con ${data.elapsedDays === 1 ? 'el primer día' : `los primeros ${data.elapsedDays} días`} ${week ? 'de la semana anterior' : 'del mes anterior'}, para que sea parejo.`
      : `Comparado con ${week ? 'la semana anterior completa' : 'el mes anterior completo'}.`
  const goalNote = data.period === 'day'
    ? 'Meta de un día'
    : data.startedDays === 0
    ? `${week ? 'Meta de la semana completa' : 'Meta del mes completo'}: ${data.fullDays} días hábiles`
    : `Meta de ${data.goalDays === 1 ? '1 día hábil' : `${data.goalDays} días hábiles`}`
  const kpis: { label: string; value: string; now: number; before: number; isMoney?: boolean; detail?: AmountKind }[] = [
    { label: 'Llamadas', value: data.totals.calls.toLocaleString('es-MX'), now: data.totals.calls, before: data.prev.calls },
    { label: 'Contactos efectivos', value: data.totals.effective.toLocaleString('es-MX'), now: data.totals.effective, before: data.prev.effective },
    { label: 'Cotizado', value: money(data.totals.quoted), now: data.totals.quoted, before: data.prev.quoted, isMoney: true, detail: 'quoted' },
    { label: 'Vendido', value: money(data.totals.sold), now: data.totals.sold, before: data.prev.sold, isMoney: true, detail: 'sold' },
  ]

  return (
    <>
      {picker}

      <div className={s.kpis}>
        {kpis.map(k => k.detail ? (
          <button key={k.label} className={`${s.elev} ${s.kpi} ${s.kpiTap} ${s.press}`} aria-expanded={detail === k.detail}
            onClick={() => setDetail(d => d === k.detail ? null : k.detail!)}>
            <small>{k.label}</small>
            <b className={s.num}>{k.value}</b>
            <Delta now={k.now} before={k.before} isMoney={k.isMoney} />
            <span className={s.kpiMore}>{detail === k.detail ? 'Ocultar clientes' : 'Ver clientes'}<Ico.chevron /></span>
          </button>
        ) : (
          <div key={k.label} className={`${s.elev} ${s.kpi}`}>
            <small>{k.label}</small>
            <b className={s.num}>{k.value}</b>
            <Delta now={k.now} before={k.before} isMoney={k.isMoney} />
          </div>
        ))}
      </div>
      {detail && (
        <AmountDetail kind={detail} period={data.period} offset={data.offset}
          title={`${detail === 'quoted' ? 'Cotizado' : 'Vendido'} · ${periodLabel(data)}`}
          onClose={() => setDetail(null)} onOpen={onOpen} />
      )}
      <p className={s.compareNote}>{compare}</p>

      <div className={`${s.elev} ${s.splitCard}`} style={{ marginBottom: 12 }}>
        <div className={s.cardHead}>
          <h3>Avance contra la meta</h3>
          <span className={`${s.bigPct} ${s.num}`}>{pct(data.compliance)}</span>
        </div>
        <p className={s.hMuted} style={{ fontSize: 12, margin: '0 0 6px' }}>
          {goalNote} · antes {pct(data.prevCompliance)}
        </p>
        {GOAL_KEYS.map(k => {
          const ratio = data.goals[k] ? data.totals[k] / data.goals[k] : 0
          return (
            <div key={k} className={`${s.goal} ${s.goalWide}`}>
              <span>{GOAL_LABELS[k]}</span>
              <div className={`${s.bar} ${tone(ratio)}`}><span style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} /></div>
              <em className={s.num}>{data.totals[k]} / {data.goals[k]}</em>
            </div>
          )
        })}
      </div>

      <div className={`${s.elev} ${s.splitCard}`}>
        <h3>Por vendedor</h3>
        {data.people.length === 0 ? (
          <div className={s.hMuted}>Aún no hay vendedores. Invítalos desde Configuración → Equipo.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={`${s.tbl} ${s.num}`}>
              <thead>
                <tr>
                  <th scope="col">Vendedor</th>
                  {GOAL_KEYS.map(k => (
                    <Fragment key={k}>
                      <th scope="col">{GOAL_LABELS[k]}</th>
                      {k === 'calls' && <th scope="col">Correos</th>}
                    </Fragment>
                  ))}
                  <th scope="col">Vendido</th>
                  <th scope="col">Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map(p => (
                  <tr key={p.user_id}>
                    <th scope="row">
                      <span className={s.who}>
                        <span className={s.avatar} style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)', width: 26, height: 26 }} aria-hidden="true">{initials(p.name)}</span>
                        {p.name}
                      </span>
                    </th>
                    {GOAL_KEYS.map(k => (
                      <Fragment key={k}>
                        <td>{p.counts[k]}<small> / {p.goals[k]}</small></td>
                        {k === 'calls' && <td>{p.counts.emails ?? 0}</td>}
                      </Fragment>
                    ))}
                    <td>{money(p.counts.sold)}</td>
                    <td><b>{pct(p.compliance)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${s.elev} ${s.zonesNote}`} style={{ marginTop: 12 }}>
        <Ico.calendar />
        <span style={{ flex: 1, minWidth: 220 }}>
          Las metas se cuentan por días hábiles (de lunes a sábado). Cámbialas en <b>Actividad diaria → Editar metas</b>.
        </span>
      </div>
    </>
  )
}
