/**
 * Cotizaciones mientras carga: la lista (cifras, filtros y renglones) y el
 * editor (formulario y hoja), con las mismas clases que las pantallas.
 */
import { Loading, Sk, SkText, skRows, skWidth } from '@/components/Skeleton'
import s from './cotizaciones.module.css'

export function QuoteRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Loading label="Cargando cotizaciones…" className={s.list}>
      {skRows(rows, i => (
        <div key={i} className={s.row}>
          <div className={s.folio}><SkText w={34} /><small><SkText w={40} /></small></div>
          <div className={s.client}><b><SkText w={skWidth(i, 0.7)} /></b><small><SkText w={skWidth(i + 2, 0.4)} /></small></div>
          <div className={s.amount}><SkText w={72} /></div>
          <div className={s.statusCell}><Sk w={74} h={22} r={4} /></div>
        </div>
      ))}
    </Loading>
  )
}

export function QuotesPageSkeleton() {
  return (
    <>
      <div className={s.head}>
        <h2>Cotizaciones</h2>
        <div className={s.headActions}><Sk w={164} h={36} r={8} /></div>
      </div>
      <div className={s.stats}>
        {['Cotizado este mes', 'Aceptado este mes', 'Aceptación'].map(l => (
          <div key={l} className={s.stat}><small>{l}</small><strong><SkText w={110} /></strong><span><SkText w={90} /></span></div>
        ))}
      </div>
      <div className={s.controls}>
        <div className={s.chips}><Sk w={64} h={32} r={6} /><Sk w={92} h={32} r={6} /><Sk w={84} h={32} r={6} /><Sk w={92} h={32} r={6} /></div>
        <div className={s.search}><Sk w="100%" h={34} r={6} /></div>
      </div>
      <QuoteRowsSkeleton />
    </>
  )
}

function CardSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <div className={s.card}>
      <div className={s.cardHead}><h3>{title}</h3></div>
      {skRows(rows, i => <div key={i} style={{ marginBottom: 12 }}><SkText w={70} /><Sk h={36} r={6} style={{ marginTop: 6 }} /></div>)}
    </div>
  )
}

export function QuoteEditorSkeleton() {
  return (
    <Loading label="Abriendo la cotización…">
      <div className={s.editorHead}>
        <span className={s.back}><Sk w={17} h={17} r={4} /></span>
        <div className={s.titleBlock}><h2><SkText w={150} /></h2></div>
        <div className={s.headActions}><Sk w={96} h={36} r={8} /><Sk w={92} h={36} r={8} /><Sk w={36} h={36} r={8} /></div>
      </div>
      <div className={s.editor} data-tab="editar">
        <div className={s.form}>
          <CardSkeleton title="Cliente" rows={2} />
          <CardSkeleton title="Productos" rows={3} />
          <CardSkeleton title="Totales y condiciones" rows={2} />
        </div>
        <div className={s.previewCol}>
          <div className={s.previewBox} style={{ aspectRatio: '612 / 792', padding: '7%' }}>
            <Sk w="40%" h={22} r={4} />
            <div style={{ marginTop: '12%' }}><SkText w="55%" /></div>
            {skRows(5, i => <div key={i} style={{ marginTop: 10 }}><SkText w={skWidth(i, 0.6)} /></div>)}
            <div style={{ marginTop: '12%' }}>{skRows(4, i => <div key={i} style={{ marginTop: 14 }}><Sk h={12} r={3} /></div>)}</div>
          </div>
        </div>
      </div>
    </Loading>
  )
}
