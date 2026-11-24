'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronRight, Download } from 'lucide-react'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { downloadPerformanceWorkbook } from '@/lib/exportData'
import { GOAL_KEYS, GOAL_LABELS, type Goals } from '@/lib/commercial'
import { SERIES_LABELS, filtersQuery, rangeLabel, rangeSpan, type ReportFilters as Filters } from '@/lib/reports'
import { AmountDetail, type AmountKind } from '../comercial/AmountDetail'
import { initials } from '../comercial/ui'
import { BarList, Columns, CumulativeLine, Delta, money, pct, toneOf } from './charts'
import { ReportFilters } from './ReportFilters'
import { SortTable, type Column } from './SortTable'
import { DesempenoSkeleton } from './Skeletons'
import type { PerfData, PerfPerson } from './types'
import s from './reportes.module.css'

const BUCKET_NOUN = { day: 'día', week: 'semana', month: 'mes' } as const
const OUT_OF_PLACE = new Set(['Sin zona', 'Sin segmento', 'Otras'])

/** "Comparado con el 1 al 22 oct, los mismos días del periodo anterior." */
export function compareNote(d: PerfData): string {
  const span = rangeSpan({ from: d.prevFrom, end: d.prevEnd }, d.today)
  return d.partial && d.period !== 'today'
    ? `Comparado con el ${span}, los mismos días del periodo anterior, para que sea parejo.`
    : `Comparado con el ${span}.`
}

/** "Meta de 19 días hábiles" */
const goalNote = (d: PerfData) => d.from === d.to ? 'Meta de un día'
  : d.startedDays === 0 ? `Meta del periodo completo: ${d.fullDays} días hábiles`
  : `Meta de ${d.goalDays === 1 ? '1 día hábil' : `${d.goalDays} días hábiles`}`

/**
 * Reportes › Desempeño: totales del periodo contra el anterior, lo vendido día
 * por día, la actividad, el avance de cada vendedor y lo vendido por zona y
 * segmento. El administrador ve a su equipo; el vendedor, solo lo suyo.
 */
export function DesempenoView({ tabs, filters, onFilters, compact }: {
  tabs: ReactNode; filters: Filters; onFilters: (f: Filters) => void; compact: boolean
}) {
  const router = useRouter()
  const query = filtersQuery(filters)
  const { data, error } = useCachedQuery<PerfData>(`/api/data/commercial/summary${query ? `?${query}` : ''}`)
  const [detail, setDetail] = useState<AmountKind | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const mine = data?.scope === 'mine'

  const download = async () => {
    if (!data) return
    setExporting(true); setExportError('')
    try { await downloadPerformanceWorkbook(data, query) } catch { setExportError('No se pudo descargar el reporte. Inténtalo de nuevo.') } finally { setExporting(false) }
  }

  const bar = (
    <div className={s.head}>
    <div className={s.row}>
      {tabs}
      <div className={s.spacer} />
      <button type="button" className={`${s.btn} ${compact ? s.iconBtn : ''} ${s.press}`} disabled={!data || exporting} onClick={download}
        aria-label={compact ? 'Descargar Excel' : undefined}>
        <Download aria-hidden="true" />{!compact && (exporting ? 'Preparando…' : 'Descargar Excel')}
      </button>
    </div>
    <div className={s.row}>
      <ReportFilters filters={filters} onChange={f => { setDetail(null); onFilters(f) }} options={data?.options}
        noSellers={mine} compact={compact} range={data ? { from: data.from, end: data.end, today: data.today } : undefined} />
    </div>
    </div>
  )

  if (error && !data) return <>{bar}<div className={`${s.card} ${s.error}`} role="alert">{error.message || 'No se pudo cargar el reporte'}</div></>
  if (!data) return <>{bar}<DesempenoSkeleton /></>

  const cmp = filters.compare
  const t = data.totals, p = data.prev
  const labels = SERIES_LABELS[data.period]
  const tap = (kind: AmountKind) => setDetail(d => d === kind ? null : kind)
  const kpi = (title: string, value: string, delta: React.ReactNode, extra?: { sub?: string; kind?: AmountKind }) => {
    const inner = (
      <>
        <small>{title}</small>
        <b className={s.num}>{value}</b>
        {extra?.sub && <span className={s.kpiSub}>{extra.sub}</span>}
        {cmp && delta}
        {extra?.kind && <span className={s.kpiMore}>{detail === extra.kind ? 'Ocultar clientes' : 'Ver clientes'}<ChevronRight aria-hidden="true" /></span>}
      </>
    )
    return extra?.kind
      ? <button key={title} type="button" className={`${s.card} ${s.kpi} ${s.kpiTap} ${s.press}`} aria-expanded={detail === extra.kind} onClick={() => tap(extra.kind!)}>{inner}</button>
      : <div key={title} className={`${s.card} ${s.kpi}`}>{inner}</div>
  }
  const qo = data.quotedOutcome

  const columns: Column<PerfPerson>[] = [
    { key: 'name', head: 'Vendedor', sort: x => x.name, foot: 'Total', cell: x => <span className={s.who}><span className={s.avatar} aria-hidden="true">{initials(x.name)}</span>{x.name}</span> },
    ...GOAL_KEYS.flatMap(k => {
      const col: Column<PerfPerson> = { key: k, head: GOAL_LABELS[k], right: true, sort: x => x.counts[k], cell: x => <>{x.counts[k].toLocaleString('es-MX')} <small>/ {x.goals[k].toLocaleString('es-MX')}</small></>, foot: t[k].toLocaleString('es-MX') }
      return k === 'calls' ? [col, { key: 'emails', head: 'Correos', right: true, sort: (x: PerfPerson) => x.counts.emails ?? 0, cell: (x: PerfPerson) => (x.counts.emails ?? 0).toLocaleString('es-MX'), foot: (t.emails ?? 0).toLocaleString('es-MX') }] : [col]
    }),
    { key: 'quoted', head: 'Cotizado', right: true, sort: x => x.counts.quoted, cell: x => money(x.counts.quoted), foot: money(t.quoted) },
    { key: 'sold', head: 'Vendido', right: true, sort: x => x.counts.sold, cell: x => money(x.counts.sold), foot: money(t.sold) },
    {
      key: 'compliance', head: 'Meta cumplida', sort: x => x.compliance, foot: pct(data.compliance),
      cell: x => <span className={s.pct}><i><span className={s[toneOf(x.compliance)]} style={{ width: `${Math.min(100, Math.round(x.compliance * 100))}%` }} /></i>{pct(x.compliance)}</span>,
    },
    ...(cmp ? [{ key: 'vs', head: `Vendido vs. ${labels.prev.toLowerCase()}`, right: true, sort: (x: PerfPerson) => x.counts.sold - x.prev.sold, cell: (x: PerfPerson) => <Delta now={x.counts.sold} before={x.prev.sold} money />, foot: <Delta now={t.sold} before={p.sold} money /> }] : []),
  ]

  const onePerson = mine ? data.people[0] : undefined
  const ratio = (k: keyof Goals) => data.goals[k] ? t[k] / data.goals[k] : 0
  const placeRows = (list: PerfData['byZone']) => list.map(x => ({ key: x.name, label: x.name, value: x.value, text: money(x.value) }))
  const pickPlace = (field: 'zone' | 'segment') => (name: string) => { if (!OUT_OF_PLACE.has(name)) onFilters({ ...filters, [field]: name }) }

  return (
    <>
      {bar}
      {exportError && <p className={s.note} role="alert">{exportError}</p>}

      <section className={s.kpis} aria-label="Totales del periodo">
        {kpi('Meta cumplida', pct(data.compliance), <Delta now={data.compliance} before={data.prevCompliance} points />, { sub: goalNote(data) })}
        {kpi('Llamadas', t.calls.toLocaleString('es-MX'), <Delta now={t.calls} before={p.calls} />)}
        {kpi('Contactos efectivos', t.effective.toLocaleString('es-MX'), <Delta now={t.effective} before={p.effective} />)}
        {kpi('Cotizaciones', t.quotes.toLocaleString('es-MX'), <Delta now={t.quotes} before={p.quotes} />,
          { sub: `${money(t.quoted)} cotizado · ${money(qo.open)} por cerrar`, kind: 'quoted' })}
        {kpi('Ventas', t.sales.toLocaleString('es-MX'), <Delta now={t.sales} before={p.sales} />)}
        {kpi('Vendido', money(t.sold), <Delta now={t.sold} before={p.sold} money />, { kind: 'sold' })}
      </section>
      {detail && (
        <AmountDetail kind={detail} query={query} title={`${detail === 'quoted' ? 'Cotizado' : 'Vendido'} · ${rangeLabel(data.period, data, data.today)}`}
          onClose={() => setDetail(null)} onOpen={id => router.push(`/comercial?id=${id}`)} />
      )}
      {cmp && <p className={s.note}>{compareNote(data)}</p>}

      {data.series.axis.length > 1 && (
        <section className={`${s.card} ${s.chart}`}>
          <h3>Vendido en {labels.noun}, día por día</h3>
          <p className={s.sub}>Lo vendido sumado desde el primer día{cmp ? ', contra lo que se llevaba en el periodo anterior en los mismos días' : ''}.</p>
          {cmp && <div className={s.legend}><span><i className={s.sw} />{labels.now}</span><span><i className={`${s.sw} ${s.swPrev}`} />{labels.prev}</span></div>}
          <CumulativeLine axis={data.series.axis} values={data.series.sold} previous={cmp ? data.series.prevSold : []}
            today={data.today} label={labels.now} prevLabel={labels.prev} />
        </section>
      )}

      <div className={s.grid2}>
        <section className={`${s.card} ${s.chart}`}>
          <h3>Contactos registrados por {BUCKET_NOUN[data.series.bucket]}</h3>
          <p className={s.sub}>Llamadas, WhatsApp, visitas y correos que se registraron. Pasa el dedo o el ratón para ver cada número.</p>
          {data.series.activity.some(a => a.current) && data.series.activity.length > 1 && (
            <div className={s.legend}><span><i className={s.sq} />Completos</span><span><i className={`${s.sq} ${s.sqLight}`} />En curso</span></div>
          )}
          <Columns unit="contactos" items={data.series.activity} />
        </section>
        {mine ? (
          <section className={`${s.card} ${s.chart}`}>
            <h3>Tu avance contra la meta</h3>
            <p className={s.sub}>{goalNote(data)}. Llevas {pct(data.compliance)} de tu meta del periodo.</p>
            <BarList track max={1} rows={GOAL_KEYS.map(k => ({ key: k, label: GOAL_LABELS[k], value: Math.min(1, ratio(k)), tone: toneOf(ratio(k)), text: <>{t[k]} <em>/ {data.goals[k]}</em></> }))} />
          </section>
        ) : (
          <section className={`${s.card} ${s.chart}`}>
            <h3>Meta cumplida por vendedor</h3>
            <p className={s.sub}>Cuánto de su meta del periodo lleva cada uno. Toca un vendedor para ver solo lo suyo.</p>
            <BarList track max={1} onPick={id => onFilters({ ...filters, sellers: [id] })} empty="Aún no hay vendedores."
              rows={data.people.map(x => ({ key: x.user_id, label: x.name, value: Math.min(1, x.compliance), tone: toneOf(x.compliance), text: pct(x.compliance) }))} />
          </section>
        )}
      </div>

      <div className={s.grid2}>
        <section className={`${s.card} ${s.chart}`}>
          <h3>Vendido por zona</h3>
          <p className={s.sub}>Toca una zona para ver solo esa.</p>
          <BarList rows={placeRows(data.byZone)} onPick={pickPlace('zone')} valueWidth={100} empty="No hubo ventas en este periodo." />
        </section>
        <section className={`${s.card} ${s.chart}`}>
          <h3>Vendido por segmento</h3>
          <p className={s.sub}>Toca un segmento para ver solo ese.</p>
          <BarList rows={placeRows(data.bySegment)} onPick={pickPlace('segment')} valueWidth={100} empty="No hubo ventas en este periodo." />
        </section>
      </div>

      {!mine && (
        <section className={`${s.card} ${s.chart}`}>
          <h3>Por vendedor</h3>
          <p className={s.sub}>Los totales de cada uno en el periodo, contra su meta. Toca un encabezado para ordenar.</p>
          {data.people.length === 0
            ? <p className={s.empty}>Aún no hay vendedores. Invítalos desde Configuración → Equipo.</p>
            : <SortTable label="Por vendedor" rows={data.people} columns={columns} rowKey={x => x.user_id} initial={{ key: 'sold', desc: true }} />}
        </section>
      )}

      <div className={s.foot}>
        <CalendarDays aria-hidden="true" />
        <span>
          Las metas se cuentan por días hábiles, de lunes a sábado.
          {onePerson ? ' Tus metas las pone el administrador.' : ' Cámbialas en Equipo hoy → Editar metas.'}
        </span>
      </div>
    </>
  )
}
