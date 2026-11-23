'use client'

import { useState, type ReactNode } from 'react'
import { Download, UserRound } from 'lucide-react'
import Link from '@/components/CachedLink'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { downloadPerformanceWorkbook } from '@/lib/exportData'
import { GOAL_KEYS, GOAL_LABELS, type Goals } from '@/lib/commercial'
import { folioLabel } from '@/lib/quotes'
import { SERIES_LABELS, filtersQuery, shortDate, type ReportFilters as Filters } from '@/lib/reports'
import { CumulativeLine, Delta, Meter, money, pct } from './charts'
import { ReportFilters } from './ReportFilters'
import { MiAvanceSkeleton, TodaySkeleton } from './Skeletons'
import type { OpenQuote, PerfData } from './types'
import s from './reportes.module.css'

const UNITS: Record<keyof Goals, [string, string]> = {
  calls: ['llamada', 'llamadas'], effective: ['contacto efectivo', 'contactos efectivos'],
  quotes: ['cotización', 'cotizaciones'], followups: ['seguimiento', 'seguimientos'], sales: ['venta', 'ventas'],
}

/** "Te faltan 3 cotizaciones y 1 venta." (las dos que más faltan) */
function missing(counts: Goals, goals: Goals): string {
  const left = GOAL_KEYS
    .filter(k => goals[k] > counts[k])
    .sort((a, b) => (counts[a] / goals[a]) - (counts[b] / goals[b]))
    .slice(0, 2)
    .map(k => { const n = goals[k] - counts[k]; return `${n} ${UNITS[k][n === 1 ? 0 : 1]}` })
  if (!GOAL_KEYS.some(k => goals[k] > 0)) return 'Aún no tienes metas: las pone el administrador.'
  return left.length ? `Te ${left.length === 1 && left[0].startsWith('1 ') ? 'falta' : 'faltan'} ${left.join(' y ')}.` : 'Cumpliste tu meta de hoy.'
}

/**
 * Reportes › Mi avance (vendedores): su meta de hoy y cómo va en el periodo,
 * con lo que vendió día por día y sus cotizaciones abiertas. Solo lo suyo.
 */
export function MiAvanceView({ tabs, filters, onFilters, compact }: {
  tabs: ReactNode; filters: Filters; onFilters: (f: Filters) => void; compact: boolean
}) {
  const query = filtersQuery(filters)
  const today = useCachedQuery<PerfData>('/api/data/commercial/summary?period=today')
  const { data, error } = useCachedQuery<PerfData>(`/api/data/commercial/summary${query ? `?${query}` : ''}`)
  const [exporting, setExporting] = useState(false)

  const download = async () => {
    if (!data) return
    setExporting(true)
    try { await downloadPerformanceWorkbook(data, query) } finally { setExporting(false) }
  }

  const d = today.data
  const todayCard = !d ? <TodaySkeleton /> : (
    <section className={s.card} aria-label="Tu meta de hoy">
      <div className={s.todayHead}>
        <h2>Tu meta de hoy</h2>
        <b className={s.num}>{pct(d.compliance)}</b>
        <span>{missing(d.totals, d.goals)}</span>
      </div>
      <div className={s.meters}>
        {GOAL_KEYS.map(k => (
          <div key={k}>
            <small>{GOAL_LABELS[k]}</small>
            <b className={s.num}>{d.totals[k]} <em>de {d.goals[k]}</em></b>
            <Meter ratio={d.goals[k] ? d.totals[k] / d.goals[k] : 0} />
          </div>
        ))}
      </div>
    </section>
  )

  const labels = data ? SERIES_LABELS[data.period] : null
  const quotes = data?.openQuotes

  return (
    <>
      <div className={s.row}>
        {tabs}
        <div className={s.spacer} />
        <button type="button" className={`${s.btn} ${compact ? s.iconBtn : ''} ${s.press}`} disabled={!data || exporting} onClick={download}
          aria-label={compact ? 'Descargar Excel' : undefined}>
          <Download aria-hidden="true" />{!compact && (exporting ? 'Preparando…' : 'Descargar Excel')}
        </button>
      </div>
      <div className={s.mine}><UserRound aria-hidden="true" />Aquí ves solo tus números: tus llamadas, tus cotizaciones y tus clientes.</div>
      {todayCard}

      <div className={s.sectionRow}>
        <h2 className={s.sectionTitle}>En el periodo</h2>
        <ReportFilters filters={filters} onChange={onFilters} options={data?.options} noSellers compact={compact}
          range={data ? { from: data.from, end: data.end, today: data.today } : undefined} />
      </div>

      {error && !data ? <div className={`${s.card} ${s.error}`} role="alert">{error.message || 'No se pudo cargar tu avance'}</div>
        : !data || !labels ? <MiAvanceSkeleton /> : (
        <>
          <section className={s.kpis} aria-label="Tus totales del periodo">
            <div className={`${s.card} ${s.kpi}`}><small>Meta cumplida</small><b className={s.num}>{pct(data.compliance)}</b>{filters.compare && <Delta now={data.compliance} before={data.prevCompliance} points />}</div>
            <div className={`${s.card} ${s.kpi}`}><small>Vendido</small><b className={s.num}>{money(data.totals.sold)}</b>{filters.compare && <Delta now={data.totals.sold} before={data.prev.sold} money />}</div>
            <div className={`${s.card} ${s.kpi}`}><small>Cotizado</small><b className={s.num}>{money(data.totals.quoted)}</b>{filters.compare && <Delta now={data.totals.quoted} before={data.prev.quoted} money />}</div>
            <div className={`${s.card} ${s.kpi}`}><small>Cotizaciones abiertas</small><b className={s.num}>{quotes?.count ?? 0}</b><span className={s.kpiSub}>Por {money(quotes?.total ?? 0)}</span></div>
            <div className={`${s.card} ${s.kpi}`}><small>Clientes nuevos</small><b className={s.num}>{data.newClients}</b>{filters.compare && <Delta now={data.newClients} before={data.prevNewClients} unit />}</div>
          </section>

          <div className={s.grid2}>
            {data.series.axis.length > 1 && (
              <section className={`${s.card} ${s.chart}`}>
                <h3>Tu vendido en {labels.noun}, día por día</h3>
                <p className={s.sub}>Lo que vendiste sumado desde el primer día{filters.compare ? ', contra el periodo anterior en los mismos días' : ''}.</p>
                {filters.compare && <div className={s.legend}><span><i className={s.sw} />{labels.now}</span><span><i className={`${s.sw} ${s.swPrev}`} />{labels.prev}</span></div>}
                <CumulativeLine axis={data.series.axis} values={data.series.sold} previous={filters.compare ? data.series.prevSold : []}
                  today={data.today} label={labels.now} prevLabel={labels.prev} />
              </section>
            )}
            <section className={`${s.card} ${s.chart}`}>
              <h3>Tus cotizaciones abiertas</h3>
              <p className={s.sub}>Las que enviaste y el cliente todavía no decide, la más vieja primero.</p>
              <OpenQuotes list={quotes?.items ?? []} more={(quotes?.count ?? 0) - (quotes?.items.length ?? 0)} today={data.today} />
            </section>
          </div>
        </>
      )}
    </>
  )
}

function OpenQuotes({ list, more, today }: { list: OpenQuote[]; more: number; today: string }) {
  if (!list.length) return <p className={s.empty}>No tienes cotizaciones abiertas.</p>
  return (
    <div className={s.tableWrap}>
      <table className={s.table} aria-label="Tus cotizaciones abiertas">
        <thead><tr><th scope="col">Folio</th><th scope="col">Cliente</th><th scope="col" className={s.r}>Total</th><th scope="col">Vence</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          {list.map(q => {
            const late = q.valid_until < today
            return (
              <tr key={q.id}>
                <td>{q.folio == null ? <span className={`${s.tag} ${s.tagUp}`}>Subida</span> : <Link href={`/cotizaciones/${q.id}`} className="auth-link strong">{folioLabel(q.folio)}</Link>}</td>
                <td>{q.folio == null ? <Link href={`/cotizaciones/${q.id}`} className="auth-link strong">{q.client_name || 'Sin cliente'}</Link> : (q.client_name || 'Sin cliente')}</td>
                <td className={s.r}>{money(Number(q.total))}</td>
                <td>{shortDate(q.valid_until, today)}</td>
                <td><span className={`${s.tag} ${late ? s.tagLate : ''}`}>{late ? 'Vencida' : 'Abierta'}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {more > 0 && <p className={s.note} style={{ marginTop: 8 }}>Y {more} más en <Link href="/cotizaciones" className="auth-link strong">Cotizaciones</Link>.</p>}
    </div>
  )
}
