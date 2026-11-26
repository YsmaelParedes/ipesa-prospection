/**
 * Campañas mientras carga: el inicio (lista), cada paso del asistente y los
 * resultados, con las mismas clases que las pantallas reales.
 */
import { Loading, Sk, SkText, skRows, skWidth } from '@/components/Skeleton'
import s from './campanas.module.css'

export function HomeListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Loading label="Cargando campañas…" className={s.list}>
      <div className={s.lh} aria-hidden="true"><span>Campaña</span><span>Enviadas</span><span>Leídas</span><span>Respondieron</span><span /></div>
      {skRows(rows, i => (
        <div key={i} className={s.lr}>
          <span style={{ minWidth: 0 }}>
            <b><SkText w={skWidth(i, 0.5)} /></b>
            <small><SkText w={skWidth(i + 3, 0.35)} /></small>
            <small className={s.ms}><SkText w={120} /></small>
          </span>
          <span className={s.num}><SkText w={28} /></span>
          <span className={s.num}><SkText w={28} /></span>
          <span className={`${s.num} ${s.r}`}><SkText w={24} /></span>
          <span />
        </div>
      ))}
    </Loading>
  )
}

/** Toda la pantalla de inicio (al entrar a /campanas). */
export function CampaignsPageSkeleton() {
  return (
    <>
      <div className={s.head}>
        <h2>Campañas</h2>
        <Sk w={150} h={36} r={8} style={{ marginLeft: 'auto' }} />
      </div>
      <p className={s.quota}><SkText w={230} /></p>
      <HomeListSkeleton />
    </>
  )
}

export function ResultSkeleton() {
  return (
    <Loading label="Cargando resultados…">
      <div className={s.rhead}>
        <Sk w={40} h={40} r={6} />
        <div style={{ flex: 1 }}>
          <h2><SkText w={220} /></h2>
          <p><SkText w={160} /></p>
        </div>
      </div>
      <div className={s.trio}>
        {['enviadas', 'leídas', 'respondieron'].map(l => <div key={l}><b><SkText w={64} /></b><span>{l}</span></div>)}
      </div>
      <div className={s.tabs}>
        {['Respondieron', 'Leyeron', 'Sin leer', 'No llegó'].map(l => <button key={l} type="button" disabled>{l}</button>)}
      </div>
      {skRows(6, i => (
        <div key={i} className={s.pr}>
          <div className={s.g}><b><SkText w={skWidth(i, 0.4)} /></b><small><SkText w={skWidth(i + 4, 0.6)} /></small></div>
        </div>
      ))}
    </Loading>
  )
}

/** El paso del asistente mientras llegan tus clientes y plantillas. */
export function WizardSkeleton({ step }: { step: number }) {
  if (step === 2) {
    return (
      <Loading label="Cargando plantillas…" className={`${s.wc} ${s.wide}`}>
        <h2 className={s.tt}>¿Qué plantilla?</h2>
        <p className={s.st}>Así le llega a tu cliente. Lo amarillo lo llenas en el siguiente paso.</p>
        <div className={s.tiles}>
          {skRows(3, i => (
            <div key={i} className={s.tile}>
              <span className={s.hd}><SkText w={skWidth(i, 0.6)} /></span>
              <span className={s.bx}><Sk h={120} r={8} style={{ background: '#fff' }} /></span>
            </div>
          ))}
        </div>
      </Loading>
    )
  }
  if (step === 3) {
    return (
      <Loading label="Preparando el envío…" className={s.duo}>
        <div className={s.l}><Sk h={260} r={12} /></div>
        <div className={s.r}>
          <h2 className={s.tt}>Revisa y envía</h2>
          <div className={s.sm}>
            {['Para', 'Plantilla', 'Sale de'].map((k, i) => (
              <div key={k} className={s.sr}><span className={s.k}>{k}</span><span className={s.v}><SkText w={skWidth(i, 0.7)} /></span><span /></div>
            ))}
          </div>
          <Sk h={50} r={8} />
        </div>
      </Loading>
    )
  }
  return (
    <Loading label="Cargando tus clientes…" className={s.wc}>
      <h2 className={s.tt}>¿A quién se la mandas?</h2>
      <p className={s.st}>Puedes elegir varios.</p>
      {skRows(6, i => (
        <div key={i} className={s.row}>
          <Sk w={20} h={20} r={4} />
          <span className={s.g}><SkText w={skWidth(i, 0.4)} /></span>
          <span className={s.n}><SkText w={28} /></span>
        </div>
      ))}
    </Loading>
  )
}
