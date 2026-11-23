import { Loading, Sk, SkText, skRows, skWidth } from '@/components/Skeleton'
import { GOAL_KEYS, GOAL_LABELS } from '@/lib/commercial'
import s from './reportes.module.css'

/**
 * Skeletons de Reportes: las mismas tarjetas, gráficas y tablas que la vista
 * real, en gris, para que al llegar los datos nada cambie de lugar.
 */

function Kpis({ labels }: { labels: string[] }) {
  return (
    <section className={s.kpis}>
      {labels.map((l, i) => (
        <div key={l} className={`${s.card} ${s.kpi}`}>
          <small>{l}</small>
          <b><SkText w={skWidth(i, 0.7)} style={{ width: 90 }} /></b>
          <Sk w="60%" h={8} r={999} style={{ marginTop: 10 }} />
        </div>
      ))}
    </section>
  )
}

function Bars({ title, rows = 4 }: { title: string; rows?: number }) {
  return (
    <section className={`${s.card} ${s.chart}`}>
      <h3>{title}</h3>
      <p className={s.sub}><SkText w="70%" /></p>
      <div className={s.bars}>
        {skRows(rows, i => (
          <div key={i} className={s.bar}>
            <span className={s.barLabel}><SkText w={skWidth(i, 0.9)} /></span>
            <span className={s.track}><Sk w={skWidth(i + 2)} h={16} r="0 4px 4px 0" /></span>
            <span className={s.barValue}><SkText w={40} style={{ marginLeft: 'auto' }} /></span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ChartBox({ title, h = 196 }: { title: string; h?: number }) {
  return (
    <section className={`${s.card} ${s.chart}`}>
      <h3>{title}</h3>
      <p className={s.sub}><SkText w="60%" /></p>
      <Sk h={h} r={6} />
    </section>
  )
}

function Rows({ title, n = 4 }: { title: string; n?: number }) {
  return (
    <section className={`${s.card} ${s.chart}`}>
      <h3>{title}</h3>
      <p className={s.sub}><SkText w="50%" /></p>
      {skRows(n, i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
          <Sk w={26} h={26} r={13} />
          <SkText w={skWidth(i, 0.4)} />
          <SkText w={60} style={{ marginLeft: 'auto' }} />
        </div>
      ))}
    </section>
  )
}

export function EquipoHoySkeleton() {
  return (
    <Loading label="Cargando el equipo de hoy…" className={s.page}>
      <Kpis labels={['Meta del equipo', 'Llamadas', 'Contactos efectivos', 'Cotizaciones', 'Ventas', 'Vendido hoy']} />
      <div className={s.grid2}>
        <Bars title="Cada vendedor contra su meta de hoy" />
        <Bars title="Cómo les fue hoy" rows={5} />
      </div>
      <Rows title="Detalle por vendedor" />
    </Loading>
  )
}

export function DesempenoSkeleton() {
  return (
    <Loading label="Cargando el reporte…" className={s.page}>
      <Kpis labels={['Meta cumplida', 'Llamadas', 'Contactos efectivos', 'Cotizaciones', 'Ventas', 'Vendido']} />
      <ChartBox title="Vendido día por día" />
      <div className={s.grid2}>
        <ChartBox title="Contactos registrados" h={170} />
        <Bars title="Meta cumplida" />
      </div>
      <div className={s.grid2}>
        <Bars title="Vendido por zona" />
        <Bars title="Vendido por segmento" />
      </div>
    </Loading>
  )
}

export function TodaySkeleton() {
  return (
    <Loading label="Cargando tu meta de hoy…" as="section" className={s.card}>
      <div className={s.todayHead}><h2>Tu meta de hoy</h2><SkText w={180} /></div>
      <div className={s.meters}>
        {GOAL_KEYS.map((k, i) => (
          <div key={k}>
            <small>{GOAL_LABELS[k]}</small>
            <b><SkText w={skWidth(i, 0.5)} style={{ width: 60 }} /></b>
            <Sk h={8} r={999} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    </Loading>
  )
}

export function MiAvanceSkeleton() {
  return (
    <Loading label="Cargando tu avance…" className={s.page}>
      <Kpis labels={['Meta cumplida', 'Vendido', 'Cotizado', 'Cotizaciones abiertas', 'Clientes nuevos']} />
      <div className={s.grid2}>
        <ChartBox title="Tu vendido, día por día" />
        <Rows title="Tus cotizaciones abiertas" />
      </div>
    </Loading>
  )
}

/** La sección completa mientras carga (menú y loading.tsx). */
export function ReportesPageSkeleton() {
  return (
    <div className={s.page}>
      <div className={s.row}>
        <div className={s.tabs}>
          <span className={s.tab} aria-selected="true">Equipo hoy</span>
          <span className={s.tab}>Desempeño</span>
        </div>
        <div className={s.spacer} />
        <Sk w={140} h={36} r={6} />
      </div>
      <div className={s.row}><Sk w={140} h={36} r={6} /><Sk w={120} h={36} r={6} /><Sk w={120} h={36} r={6} /></div>
      <EquipoHoySkeleton />
    </div>
  )
}
