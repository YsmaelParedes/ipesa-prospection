/**
 * Configuración mientras carga: el menú de secciones, el encabezado y las
 * tarjetas con sus filas (como Card y Row de ui.tsx), y las listas de cada
 * pestaña (equipo, catálogos, respuestas rápidas).
 */
import { Loading, Sk, SkCircle, SkText, skRows, skWidth } from '@/components/Skeleton'
import s from './configuracion.module.css'

/** Filas de ajuste: nombre y explicación a la izquierda, el campo a la derecha. */
export function SettingRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {skRows(rows, i => (
        <div key={i} className={s.setRow}>
          <div className={s.setLabel}>
            <strong><SkText w={skWidth(i, 0.6)} /></strong>
            <p><SkText w={skWidth(i + 3, 0.9)} /></p>
          </div>
          <div className={s.setControl}><Sk h={38} r={8} /></div>
        </div>
      ))}
    </>
  )
}

/** Una tarjeta de ajustes con encabezado y filas. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <div className={s.cardTitle} style={{ flex: 1 }}>
          <h3><SkText w={160} /></h3>
          <p><SkText w="60%" /></p>
        </div>
      </header>
      <SettingRowsSkeleton rows={rows} />
    </section>
  )
}

/** Personas del equipo (Equipo). */
export function MembersSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Loading label="Cargando el equipo…" className={s.members}>
      {skRows(rows, i => (
        <div key={i} className={s.member}>
          <SkCircle size={38} />
          <div className={s.memberMain}>
            <strong><SkText w={skWidth(i, 0.45)} /></strong>
            <small><SkText w={skWidth(i + 4, 0.7)} /></small>
          </div>
          <div className={s.memberActions}><Sk w={128} h={34} r={8} /></div>
        </div>
      ))}
    </Loading>
  )
}

/** Opciones de un catálogo (segmentos, canales, zonas…). */
export function ChipsSkeleton() {
  return (
    <Loading label="Cargando opciones…" className={s.chips}>
      {[92, 74, 118, 66, 104, 84].map((w, i) => <Sk key={i} w={w} h={32} r={6} />)}
    </Loading>
  )
}

/** Renglones de una lista (respuestas rápidas). */
export function ItemsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Loading label="Cargando…" className={s.list}>
      {skRows(rows, i => (
        <div key={i} className={s.item} style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
            <SkText w={skWidth(i, 0.35)} />
            <SkText w={skWidth(i + 2, 0.8)} style={{ fontSize: 12.5 }} />
          </div>
          <Sk w={32} h={32} r={6} />
        </div>
      ))}
    </Loading>
  )
}

/** La página completa: menú de secciones a la izquierda y la sección abierta. */
export function SettingsPageSkeleton() {
  return (
    <Loading label="Cargando la configuración…" className={s.layout}>
      <nav className={s.nav} aria-hidden="true">
        {[3, 5].map((items, g) => (
          <div key={g} className={s.navGroup}>
            <div className={s.navLabel}><SkText w={70} /></div>
            {skRows(items, i => (
              <div key={i} className={s.navItem}>
                <Sk w={17} h={17} r={4} />
                <span className={s.navText}><SkText w={skWidth(i + g * 3, 0.8)} /></span>
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className={s.content}>
        <header className={s.sectionHead}>
          <h2><SkText w={180} /></h2>
          <p><SkText w="70%" /></p>
        </header>
        <CardSkeleton rows={3} />
        <CardSkeleton rows={2} />
      </div>
    </Loading>
  )
}
