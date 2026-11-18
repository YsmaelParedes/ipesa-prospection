/**
 * Sistema Comercial mientras carga: cada pestaña con las mismas clases que su
 * vista real (HoyView, CarteraView, OportunidadesView, ActividadView,
 * AcumuladoView) para que al llegar los datos nada cambie de lugar.
 */
import { ChevronRight, Search } from 'lucide-react'
import { GOAL_KEYS, GOAL_LABELS } from '@/lib/commercial'
import { Loading, Sk, SkText, skRows, skWidth } from '@/components/Skeleton'
import { STAGES } from './stages'
import s from './comercial.module.css'

/** Cuadro de iniciales (el avatar del sistema comercial es cuadrado). */
const Av = ({ size = 36 }: { size?: number }) => <Sk w={size} h={size} r={size > 40 ? 8 : 6} />

/** Buscador y filtros (zona, segmento) como los de <Filters>. */
export function FiltersSkeleton({ placeholder }: { placeholder: string }) {
  return (
    <div className={s.filters}>
      <Sk w={190} h={38} r={8} />
      <Sk w={190} h={38} r={8} />
      <label className={s.search}>
        <Search size={16} />
        <input type="search" placeholder={placeholder} aria-label={placeholder} disabled />
      </label>
    </div>
  )
}

/** Cifras de arriba (los nombres de cada una ya se ven). */
export function KpisSkeleton({ labels }: { labels: string[] }) {
  return (
    <div className={s.kpis}>
      {labels.map(label => (
        <div key={label} className={`${s.elev} ${s.kpi}`}>
          <small>{label}</small>
          <b className={s.num}><SkText w={64} /></b>
        </div>
      ))}
    </div>
  )
}

/* ── Hoy ── */

function HoyRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      <div className={s.groupHead}><SkText w={90} /></div>
      {skRows(rows, i => (
        <div key={i} className={s.row}>
          <Av />
          <span style={{ minWidth: 0 }}>
            <span className={s.name}><SkText w={skWidth(i, 0.9)} /></span>
            <span className={s.meta}><SkText w={skWidth(i + 3, 0.6)} /></span>
          </span>
          <span className={s.next}><Sk w={86} h={18} r={4} /><SkText w={skWidth(i + 5, 0.8)} /></span>
          <span className={s.when}><SkText w={56} /></span>
          <span className={s.quick}><Sk w={36} h={36} r={6} /><Sk w={36} h={36} r={6} /></span>
        </div>
      ))}
    </>
  )
}

function HoyCards({ rows = 5 }: { rows?: number }) {
  return (
    <div className={s.cards}>
      <div className={s.cardGroup}><SkText w={90} /></div>
      {skRows(rows, i => (
        <article key={i} className={`${s.elev} ${s.card}`}>
          <div className={s.cardTop}>
            <Av />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className={s.name}><SkText w={skWidth(i, 0.8)} /></span>
              <span className={s.meta}><SkText w={skWidth(i + 3, 0.55)} /></span>
              <span style={{ display: 'block', marginTop: 6 }}><Sk w={86} h={18} r={4} /></span>
            </span>
            <span className={s.when}><SkText w={50} /></span>
          </div>
          <div className={s.actions}><Sk w="auto" h={44} r={8} style={{ flex: 1 }} /><Sk w="auto" h={44} r={8} style={{ flex: 1 }} /></div>
        </article>
      ))}
    </div>
  )
}

/** Ficha del cliente (a la derecha en computadora, encima en celular). */
export function ContactPaneSkeleton() {
  return (
    <Loading label="Cargando la ficha del cliente…">
      <div className={s.paneHead}>
        <Av size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className={s.paneTitle}><SkText w="70%" /></h2>
          <p className={s.paneSub}><SkText w="85%" /></p>
          <div className={s.tags}><Sk w={80} h={18} r={4} /><Sk w={44} h={18} r={4} /><Sk w={56} h={18} r={4} /></div>
        </div>
      </div>
      <div className={s.actions}>{skRows(3, i => <Sk key={i} w="auto" h={44} r={8} style={{ flex: 1 }} />)}<Sk w={44} h={44} r={8} /></div>
      <div className={s.section}>
        <Sk h={38} r={8} />
        <Sk h={38} r={8} style={{ marginTop: 10 }} />
        <Sk h={64} r={8} style={{ marginTop: 10 }} />
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Historial</div>
        <HistorySkeleton />
      </div>
    </Loading>
  )
}

/** Historial de actividades de un cliente. */
export function HistorySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={s.history} aria-hidden="true">
      {skRows(rows, i => (
        <div key={i} className={s.hItem}>
          <span><SkText w={44} /></span>
          <div><SkText w={skWidth(i, 0.8)} /><SkText w={skWidth(i + 4, 0.5)} /></div>
        </div>
      ))}
    </div>
  )
}

const STATS = ['Efectivos', 'Cotiz.', 'Seguim.', 'Ventas']
const SUBS: [string, string][] = [['Pendientes', 'var(--brand)'], ['Nuevos', 'var(--c-cyan-ink)'], ['Para visita', 'var(--ink-3)']]

/** Pestaña Hoy: avance del día, Pendientes / Nuevos / Para visita y la lista. */
export function HoySkeleton() {
  return (
    <Loading label="Cargando tu lista de hoy…">
      <div className={`${s.elev} ${s.strip}`}>
        <div className={s.bigbar}>
          <span className={s.progressRow}><span>Llamadas de hoy</span><b className={s.num}><SkText w={52} /></b></span>
          <span className={s.bar} style={{ display: 'block' }} />
        </div>
        <div className={s.stats}>
          {STATS.map(label => <div key={label} className={s.stat}><b className={s.num}><SkText w={32} style={{ margin: '3px auto' }} /></b>{label}</div>)}
        </div>
      </div>
      <div className={s.subTabs}>
        {SUBS.map(([label, color]) => (
          <span key={label} className={s.subTab}><span className={s.dot} style={{ background: color }} />{label} <SkText w={22} inline /></span>
        ))}
      </div>
      <FiltersSkeleton placeholder="Buscar en toda la base: negocio o teléfono" />
      <div className={s.skWide}>
        <div className={s.todayGrid}>
          <div className={`${s.elev} ${s.listCard}`}><HoyRows /></div>
          <aside className={`${s.elev} ${s.pane}`}><ContactPaneSkeleton /></aside>
        </div>
      </div>
      <div className={s.skNarrow}><HoyCards /></div>
    </Loading>
  )
}

/* ── Cartera ── */

/** Filas de la cartera (con su encabezado de columnas). */
export function CarteraRowsSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <Loading label="Cargando la cartera…">
      <div className={`${s.pRow} ${s.pHead}`} aria-hidden="true">
        <span /><span>Cliente</span><span className={s.optional}>Próximo paso</span>
        <span className={s.optional}>Responsable</span><span className={s.optional}>Cuándo</span><span>Avance</span>
      </div>
      {skRows(rows, i => (
        <div key={i} className={s.pRow}>
          <Av />
          <span style={{ minWidth: 0 }}>
            <span className={s.name}><SkText w={skWidth(i, 0.9)} /></span>
            <span className={s.meta}><SkText w={skWidth(i + 4, 0.6)} /></span>
          </span>
          <span className={`${s.optional} ${s.meta}`} style={{ margin: 0 }}><SkText w={skWidth(i + 2, 0.8)} /></span>
          <span className={`${s.optional} ${s.meta}`} style={{ margin: 0 }}><SkText w={70} /></span>
          <span className={`${s.optional} ${s.when}`}><SkText w={56} /></span>
          <span><Sk w={86} h={20} r={6} /></span>
        </div>
      ))}
    </Loading>
  )
}

export function CarteraSkeleton() {
  return (
    <>
      <div className={s.funnel}>
        {STAGES.map(([key, label, color]) => (
          <div key={key} className={s.fbox}>
            <small>{label}</small>
            <b className={s.num}><SkText w={48} /></b>
            <i style={{ background: color }} />
          </div>
        ))}
      </div>
      <FiltersSkeleton placeholder="Buscar en la cartera: negocio o teléfono" />
      <div className={`${s.elev} ${s.listCard}`}><CarteraRowsSkeleton /></div>
    </>
  )
}

/* ── Oportunidades ── */

export function OportunidadesRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      <div className={`${s.oppRow} ${s.oppHead}`} aria-hidden="true">
        <span>Cliente</span><span className={s.optional}>Zona</span><span className={s.optional}>Cotizado el</span>
        <span className={s.optional}>Sin contacto</span><span className={`${s.right} ${s.optional}`}>Monto</span>
        <span className={`${s.right} ${s.optional}`}>Prob.</span><span />
      </div>
      {skRows(rows, i => (
        <div key={i} className={s.oppRow}>
          <span style={{ minWidth: 0 }}>
            <span className={s.name}><SkText w={skWidth(i, 0.9)} /></span>
            <span className={s.meta}><SkText w={skWidth(i + 3, 0.6)} /></span>
          </span>
          <span className={s.optional}><SkText w={70} /></span>
          <span className={s.optional}><SkText w={52} /></span>
          <span className={s.optional}><SkText w={48} /></span>
          <span className={`${s.right} ${s.optional}`}><SkText w={70} style={{ marginLeft: 'auto' }} /></span>
          <span className={`${s.right} ${s.optional}`}><SkText w={36} style={{ marginLeft: 'auto' }} /></span>
          <span className={s.oppActs}><Sk w={74} h={30} r={6} /><Sk w={64} h={30} r={6} /><Sk w={92} h={30} r={6} /></span>
        </div>
      ))}
    </>
  )
}

/** «filters»: la fila de «Mías / De todo el equipo» y el segmento (solo si la vista los va a mostrar). */
export function OportunidadesSkeleton({ filters = false }: { filters?: boolean }) {
  return (
    <Loading label="Cargando oportunidades…">
      <KpisSkeleton labels={['Cotizaciones abiertas', 'Cotizado', 'Esperado (monto × probabilidad)', 'Más de 7 días sin contacto']} />
      {filters && <div className={s.filters}><Sk w={64} h={33} r={6} /><Sk w={150} h={33} r={6} /><Sk w={190} h={38} r={8} /></div>}
      <div className={`${s.elev} ${s.listCard}`}><OportunidadesRowsSkeleton /></div>
    </Loading>
  )
}

/* ── Actividad diaria ── */

function GoalRows({ wide = false }: { wide?: boolean }) {
  return (
    <>
      {GOAL_KEYS.map((k, i) => (
        <div key={k} className={`${s.goal} ${wide ? s.goalWide : ''}`}>
          <span>{GOAL_LABELS[k]}</span>
          <div className={s.bar} />
          <em className={s.num}><SkText w={skWidth(i, 0.5)} style={{ marginLeft: 'auto' }} /></em>
        </div>
      ))}
    </>
  )
}

function BarRows({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {skRows(rows, i => (
        <div key={i} className={s.brow}>
          <span><SkText w={skWidth(i, 0.9)} /></span>
          <div className={s.bar} />
          <em className={s.num}><SkText w={20} style={{ marginLeft: 'auto' }} /></em>
        </div>
      ))}
    </>
  )
}

export function ActividadSkeleton() {
  return (
    <Loading label="Cargando la actividad del día…">
      <p className={s.dayLabel}><SkText w={140} /></p>
      <KpisSkeleton labels={['Prospectos', 'Clientes', 'Cotizado hoy', 'Vendido hoy']} />
      <div className={s.people}>
        {skRows(2, i => (
          <article key={i} className={`${s.elev} ${s.person}`}>
            <div className={s.personHead}>
              <Av />
              <div style={{ flex: 1 }}><b><SkText w={skWidth(i, 0.6)} /></b><small><SkText w={skWidth(i + 3, 0.5)} /></small></div>
              <span className={`${s.bigPct} ${s.num}`}><SkText w={48} /></span>
            </div>
            <GoalRows />
            <div className={s.goal}><span>Correos</span><span aria-hidden="true" /><em className={s.num}><SkText w={16} style={{ marginLeft: 'auto' }} /></em></div>
          </article>
        ))}
      </div>
      <div className={s.split}>
        <div className={`${s.elev} ${s.splitCard}`}><h3>Resultados de hoy</h3><BarRows /></div>
        <div className={`${s.elev} ${s.splitCard}`}><h3>Actividad por segmento (hoy)</h3><BarRows /></div>
      </div>
    </Loading>
  )
}

/* ── Acumulado (debajo del selector de periodo, que ya se ve) ── */

export function AcumuladoSkeleton() {
  return (
    <Loading label="Cargando el acumulado…">
      <KpisSkeleton labels={['Llamadas', 'Contactos efectivos', 'Cotizado', 'Vendido']} />
      <p className={s.compareNote}><SkText w={260} /></p>
      <div className={`${s.elev} ${s.splitCard}`} style={{ marginBottom: 12 }}>
        <div className={s.cardHead}>
          <h3>Avance contra la meta</h3>
          <span className={`${s.bigPct} ${s.num}`}><SkText w={48} /></span>
        </div>
        <p className={s.hMuted} style={{ fontSize: 12, margin: '0 0 6px' }}><SkText w={180} /></p>
        <GoalRows wide />
      </div>
      <div className={`${s.elev} ${s.splitCard}`}>
        <div className={s.cardHead} style={{ alignItems: 'center', marginBottom: 8 }}>
          <h3>Por vendedor</h3>
          <Sk w={120} h={32} r={8} />
        </div>
        {skRows(3, i => (
          <div key={i} className={s.brow} style={{ gridTemplateColumns: '26px 1fr 80px' }}>
            <Sk w={26} h={26} r={6} />
            <span><SkText w={skWidth(i, 0.5)} /></span>
            <em className={s.num}><SkText w={40} style={{ marginLeft: 'auto' }} /></em>
          </div>
        ))}
      </div>
    </Loading>
  )
}

/* ── Listas dentro de ventanas ── */

/** Clientes de lo cotizado o vendido en un periodo (AmountDetail). */
export function AmountRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Loading label="Cargando clientes…" className={s.detailList}>
      {skRows(rows, i => (
        <div key={i} className={s.detailRow}>
          <Sk w={34} h={34} r={6} />
          <span className={s.detailWho}><b><SkText w={skWidth(i, 0.8)} /></b><span><SkText w={skWidth(i + 3, 0.6)} /></span></span>
          <span className={s.detailAmt}><b className={s.num}><SkText w={64} /></b></span>
        </div>
      ))}
    </Loading>
  )
}

/** «Lo que hiciste hoy» (DoneToday). */
export function DoneRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Loading label="Cargando lo de hoy…">
      {skRows(rows, i => (
        <div key={i} className={s.doneRow}>
          <span className={`${s.num} ${s.doneHour}`}><SkText w={36} /></span>
          <span style={{ minWidth: 0 }}>
            <span className={s.name}><SkText w={skWidth(i, 0.7)} /></span>
            <span className={s.meta}><SkText w={skWidth(i + 4, 0.9)} /></span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--line-strong)' }} />
        </div>
      ))}
    </Loading>
  )
}

/** Sistema Comercial completo (al entrar, antes de que cargue la pantalla). */
export function ComercialPageSkeleton() {
  return (
    <>
      <div className={s.tabsRow}>
        <div className={s.tabs}>
          <span className={s.tab} aria-selected="true">Hoy</span>
          <span className={s.tab}>Cartera</span>
        </div>
      </div>
      <HoySkeleton />
    </>
  )
}
