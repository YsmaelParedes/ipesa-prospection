/**
 * Inicio mientras carga: los mismos bloques que app/(app)/page.tsx (Para hoy,
 * cifras y paneles). Los títulos fijos se ven desde el principio; lo que
 * depende de los datos va en gris.
 */
import { AlarmClock, Target } from 'lucide-react'
import { Loading, Sk, SkCircle, SkText, skRows, skWidth } from '@/components/Skeleton'

/** Filas de «Para hoy» o de «Llamadas para hoy». */
export function TodayRowsSkeleton({ rows = 3, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <ul className="today-list" aria-hidden="true">
      {skRows(rows, i => (
        <li key={i} className="today-row">
          {avatar ? <SkCircle size={28} /> : <Sk w={8} h={8} r="50%" />}
          <span className="today-main">
            <strong><SkText w={skWidth(i, 0.7)} /></strong>
            <small><SkText w={skWidth(i + 3, 0.5)} /></small>
          </span>
          {!avatar && <Sk w={58} h={26} r={6} />}
        </li>
      ))}
    </ul>
  )
}

const KPIS: [string, string][] = [
  ['Contactos', 'var(--c-cyan)'],
  ['Para llamar hoy', 'var(--brand)'],
  ['Cotizaciones del mes', 'var(--c-magenta)'],
  ['Ventas del mes', 'var(--success-fill)'],
]

function PanelHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="panel-head">
      <div className="panel-title">{title}</div>
      {sub && <span className="panel-sub">{sub}</span>}
    </div>
  )
}

function BarsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="barchart">
      {skRows(rows, i => (
        <div className="bar-row" key={i}>
          <div className="bar-label"><SkText w={skWidth(i, 0.9)} /></div>
          <div className="bar-track"><Sk w={`${90 - i * 15}%`} h="100%" r={999} /></div>
          <div className="bar-value"><SkText w={22} /></div>
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <Loading label="Cargando el inicio…">
      <div className="dash-hello">
        <div>
          <h2><SkText w={240} /></h2>
          <p><SkText w={210} /></p>
        </div>
      </div>

      <div className="today-grid">
        <section className="today-card">
          <header className="today-head">
            <span className="today-icon tone-amber"><AlarmClock size={19} /></span>
            <div><h3>Para hoy</h3><p><SkText w={150} /></p></div>
            <span className="today-link">Agenda →</span>
          </header>
          <TodayRowsSkeleton />
        </section>
        <section className="today-card">
          <header className="today-head">
            <span className="today-icon tone-brand"><Target size={19} /></span>
            <div><h3>Llamadas para hoy</h3><p><SkText w={190} /></p></div>
            <span className="today-link">Sistema comercial →</span>
          </header>
          <TodayRowsSkeleton avatar />
        </section>
      </div>

      <div className="kpi-grid">
        {KPIS.map(([label, color]) => (
          <div className="kpi" key={label}>
            <div className="kpi-label"><span className="kpi-dot" style={{ background: color }} />{label}</div>
            <div className="kpi-value"><SkText w={70} /></div>
            <div className="kpi-trend"><SkText w={120} /></div>
            <div className="kpi-stripe" style={{ background: color }} />
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="panel">
          <PanelHead title="Resultados de llamadas" sub="últimos 30 días" />
          <BarsSkeleton />
        </div>
        <div className="panel">
          <PanelHead title="Clientes por segmento" />
          <div className="donut-wrap">
            <span className="sk" aria-hidden="true" style={{ width: 140, height: 140, borderRadius: '50%', mask: 'radial-gradient(circle, transparent 47px, #000 48px)', WebkitMask: 'radial-gradient(circle, transparent 47px, #000 48px)' }} />
            <div className="donut-legend">
              {skRows(5, i => (
                <div className="donut-legend-item" key={i}>
                  <Sk w={10} h={10} r={3} />
                  <span className="lname"><SkText w={skWidth(i, 0.8)} /></span>
                  <span className="lval"><SkText w={18} /></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="panel">
          <PanelHead title="Próximos seguimientos" />
          <table className="table" style={{ marginTop: -4 }}>
            <thead>
              <tr><th>Negocio</th><th>Estado</th><th>Qué sigue</th><th style={{ textAlign: 'right' }}>Fecha</th></tr>
            </thead>
            <tbody>
              {skRows(5, i => (
                <tr key={i}>
                  <td><div className="cell-name"><SkCircle size={28} /><SkText w={skWidth(i, 1.6)} style={{ minWidth: 80, maxWidth: 160 }} /></div></td>
                  <td data-label="Estado"><Sk w={74} h={20} r={6} /></td>
                  <td data-label="Qué sigue"><SkText w={90} /></td>
                  <td data-label="Fecha" style={{ textAlign: 'right' }}><SkText w={56} style={{ marginLeft: 'auto' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <PanelHead title="Actividad reciente" sub="últimas 2 semanas" />
          <div>
            {skRows(5, i => (
              <div className="activity-row" key={i}>
                <Sk w={32} h={32} r={6} />
                <div className="activity-text" style={{ flex: 1, minWidth: 0 }}>
                  <SkText w={skWidth(i, 0.9)} />
                  <div className="activity-time"><SkText w={110} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Loading>
  )
}
