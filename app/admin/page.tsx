'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { DAY, ago, countStores, expiresSoon, fmtDate, isLapsed, isOff, subscriptionLine, usePlatformStores, type PlatformStore } from './data'
import s from './admin.module.css'

/**
 * Panel del dueño › Resumen: cuántas tiendas hay y cuáles necesitan algo
 * (pago vencido, por vencer, sin uso). Cada fila abre su ficha en Tiendas.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
const IDLE_DAYS = 14

/** Fecha en que vence lo que la tienda tiene pagado o en prueba. */
const dueAt = (st: PlatformStore) => new Date((st.status === 'trial' ? st.trial_ends_at : st.paid_until) ?? 0).getTime()

function StoreLink({ st, children }: { st: PlatformStore; children: React.ReactNode }) {
  return <Link href={`/admin/tiendas?tienda=${st.id}`} className={s.item}>{children}</Link>
}

export default function AdminHome() {
  const { stores, error } = usePlatformStores()

  const view = useMemo(() => {
    const list = stores ?? []
    const now = Date.now()
    return {
      counts: countStores(list, now),
      // Primero las que ya están en solo lectura, luego las que vencen pronto
      attention: list.filter(st => isLapsed(st, now) || expiresSoon(st, now))
        .sort((a, b) => Number(isLapsed(b, now)) - Number(isLapsed(a, now)) || dueAt(a) - dueAt(b)),
      recent: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
      idle: list.filter(st => !isOff(st) && !isLapsed(st, now)
        && (!st.last_activity_at || now - new Date(st.last_activity_at).getTime() > IDLE_DAYS * DAY)),
    }
  }, [stores])

  const { counts } = view

  return (
    <div className={s.page}>
      <div className="section-head"><h2>Resumen</h2></div>

      {error && <div className={s.error}>{error}</div>}
      {!stores && !error && <div className={s.center}><span className={s.spinner} /></div>}

      {stores && (
        <>
          <div className={s.kpis}>
            <div className={s.kpi}><small>Tiendas</small><strong>{counts.all}</strong><span>registradas</span></div>
            <div className={cx(s.kpi, s.kGreen)}><small>Activas</small><strong>{counts.active}</strong><span>pagando, al corriente</span></div>
            <div className={cx(s.kpi, s.kCyan)}><small>En prueba</small><strong>{counts.trial}</strong><span>con acceso completo</span></div>
            <div className={cx(s.kpi, s.kAmber)}><small>Por vencer</small><strong>{counts.expiring}</strong><span>prueba ≤ 3 días o pago ≤ 7</span></div>
            <div className={cx(s.kpi, s.kRed)}><small>Solo lectura</small><strong>{counts.readonly}</strong><span>prueba o pago vencido</span></div>
          </div>

          <div className={s.panels}>
            <section className={s.panel}>
              <div className={s.panelHead}>
                <strong>Requieren atención</strong>
                <span>{view.attention.length || ''}</span>
              </div>
              {view.attention.length === 0
                ? <div className={s.panelEmpty}>Todo al corriente: ninguna tienda debe ni vence en los próximos días.</div>
                : view.attention.map(st => (
                  <StoreLink key={st.id} st={st}>
                    <span className={s.itemMain}>
                      <strong>{st.name}</strong>
                      <small>{subscriptionLine(st)}</small>
                    </span>
                    {isLapsed(st)
                      ? <em className={cx(s.badge, s.bDanger)}>Solo lectura</em>
                      : <em className={cx(s.badge, s.bWarn)}>Por vencer</em>}
                  </StoreLink>
                ))}
            </section>

            <section className={s.panel}>
              <div className={s.panelHead}>
                <strong>Altas recientes</strong>
                <Link href="/admin/tiendas" className={s.panelLink}>Ver todas</Link>
              </div>
              {view.recent.length === 0
                ? <div className={s.panelEmpty}>Aún no hay tiendas registradas.</div>
                : view.recent.map(st => (
                  <StoreLink key={st.id} st={st}>
                    <span className={s.itemMain}>
                      <strong>{st.name}</strong>
                      <small>{st.owner_name || st.owner_email || 'Sin dueño'} · alta {fmtDate(st.created_at, { day: 'numeric', month: 'short' })}</small>
                    </span>
                    {!st.onboarding_completed_at && <em className={cx(s.badge, s.bMuted)}>Configurando</em>}
                  </StoreLink>
                ))}
            </section>

            <section className={s.panel}>
              <div className={s.panelHead}>
                <strong>Sin uso en {IDLE_DAYS} días</strong>
                <span>{view.idle.length || ''}</span>
              </div>
              {view.idle.length === 0
                ? <div className={s.panelEmpty}>Todas las tiendas con acceso han registrado actividad en los últimos {IDLE_DAYS} días.</div>
                : view.idle.map(st => (
                  <StoreLink key={st.id} st={st}>
                    <span className={s.itemMain}>
                      <strong>{st.name}</strong>
                      <small>{ago(st.last_activity_at)} · {st.members} {st.members === 1 ? 'usuario' : 'usuarios'}</small>
                    </span>
                  </StoreLink>
                ))}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
