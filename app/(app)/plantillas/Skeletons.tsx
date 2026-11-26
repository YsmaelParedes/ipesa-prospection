/**
 * Plantillas mientras carga: la lista con las mismas clases que la pantalla real.
 */
import { Loading, Sk, SkText, skRows, skWidth } from '@/components/Skeleton'
import s from './plantillas.module.css'

export function TemplateRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Loading label="Cargando plantillas…" className={s.list}>
      <div className={s.lh} aria-hidden="true"><span>Plantilla</span><span>Estado</span><span>Enviados</span><span>Leídos</span><span>Respondieron</span><span /></div>
      {skRows(rows, i => (
        <div key={i} className={s.lr}>
          <span style={{ minWidth: 0 }}>
            <b><SkText w={skWidth(i, 0.45)} /></b>
            <small><SkText w={skWidth(i + 3, 0.3)} /></small>
          </span>
          <Sk w={86} h={22} r={4} />
          <span className={s.num}><SkText w={28} /></span>
          <span className={s.num}><SkText w={28} /></span>
          <span className={`${s.num} ${s.r}`}><SkText w={24} /></span>
          <span />
        </div>
      ))}
    </Loading>
  )
}

/** Toda la pantalla (al entrar a /plantillas). */
export function TemplatesPageSkeleton() {
  return (
    <>
      <div className={s.head}>
        <h2>Plantillas</h2>
        <Sk w={110} h={36} r={8} />
        <Sk w={150} h={36} r={8} />
      </div>
      <div className={s.controls}>
        <div className={s.chips}><Sk w={72} h={32} r={6} /><Sk w={100} h={32} r={6} /><Sk w={106} h={32} r={6} /></div>
      </div>
      <TemplateRowsSkeleton />
    </>
  )
}
