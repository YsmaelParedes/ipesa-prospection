/**
 * Agenda mientras carga: los mismos grupos y renglones que page.tsx
 * (Vencidos, Hoy, Mañana…) con la hora, el título y sus botones en gris.
 */
import { Loading, Sk, SkText, skRows, skWidth } from '@/components/Skeleton'
import s from './agenda.module.css'

function GroupSkeleton({ rows, first = 0 }: { rows: number; first?: number }) {
  return (
    <section className={s.group}>
      <div className={s.groupHead}>
        <span className={s.groupLabel}><SkText w={92} /></span>
        <span className={s.groupRule} />
      </div>
      <div className={s.list}>
        {skRows(rows, j => {
          const i = first + j
          return (
            <div key={i} className={s.row}>
              <div className={s.when}><SkText w={40} /></div>
              <div className={s.main}>
                <span className={s.title} style={{ display: 'block' }}><SkText w={skWidth(i, 0.75)} /></span>
                <span className={s.meta}><SkText w={skWidth(i + 3, 0.45)} /></span>
              </div>
              <div className={s.actions}><Sk w={32} h={32} r={6} /><Sk w={32} h={32} r={6} /><Sk w={68} h={32} r={6} /></div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** La lista (debajo de las pestañas y los filtros, que ya se ven). */
export function AgendaListSkeleton() {
  return (
    <Loading label="Cargando tu agenda…">
      <GroupSkeleton rows={2} />
      <GroupSkeleton rows={4} first={2} />
      <GroupSkeleton rows={3} first={6} />
    </Loading>
  )
}

/** La Agenda completa (al entrar, antes de que cargue la pantalla). */
export function AgendaPageSkeleton() {
  return (
    <>
      <div className={s.head}>
        <h2>Agenda</h2>
        <SkText w={150} inline />
        <div className={s.headActions}><Sk w={176} h={36} r={8} /></div>
      </div>
      <div className={s.controls}>
        <div className={s.seg}>
          <span style={{ padding: '7px 14px', borderRadius: 6, fontWeight: 700, fontSize: 13, background: 'var(--card)', color: 'var(--ink)' }}>Pendientes</span>
          <span style={{ padding: '7px 14px', fontWeight: 700, fontSize: 13, color: 'var(--muted)' }}>Completados</span>
        </div>
        <div className={s.chips}><Sk w={64} h={32} r={6} /><Sk w={130} h={32} r={6} /><Sk w={86} h={32} r={6} /></div>
      </div>
      <AgendaListSkeleton />
    </>
  )
}
