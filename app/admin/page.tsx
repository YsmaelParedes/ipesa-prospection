'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { fmtMoney } from '@/lib/payments'
import {
  DAY, ago, countStores, currentMonth, expiresSoon, fmtDate, isLapsed, isOff, isPending, moneySummary, subscriptionLine,
  usePayments, usePlatformStores, wantsWhatsApp, type PlatformStore,
} from './data'
import { ErrorsPanel } from './errors-ui'
import s from './admin.module.css'

/**
 * Panel del dueño › Resumen: dinero del mes (cobrado, ingreso mensual
 * acordado, por cobrar, adeudo), cuántas tiendas hay y cuáles necesitan
 * algo (pago vencido, por vencer, sin uso). Cada fila abre su ficha en Tiendas.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
const IDLE_DAYS = 14

const rank = (st: PlatformStore, now: number) => (isPending(st) ? 0 : isLapsed(st, now) ? 1 : 2)

/** Fecha en que vence lo que la tienda tiene pagado o en prueba. */
const dueAt = (st: PlatformStore) => new Date((st.status === 'trial' ? st.trial_ends_at : st.paid_until) ?? 0).getTime()

function StoreLink({ st, children }: { st: PlatformStore; children: React.ReactNode }) {
  return <Link href={`/admin/tiendas?tienda=${st.id}`} className={s.item}>{children}</Link>
}

export default function AdminHome() {
  const { stores, error } = usePlatformStores()
  const { payments, error: payError } = usePayments({ month: currentMonth() })

  const view = useMemo(() => {
    const list = stores ?? []
    const now = Date.now()
    return {
      counts: countStores(list, now),
      // Primero las que esperan su primer pago, luego las de solo lectura y al final las que vencen pronto
      attention: list.filter(st => isPending(st) || isLapsed(st, now) || expiresSoon(st, now))
        .sort((a, b) => rank(a, now) - rank(b, now) || dueAt(a) - dueAt(b)),
      recent: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
      // Pidieron WhatsApp ("Quiero activarlo"): las más antiguas primero
      waRequests: list.filter(wantsWhatsApp).sort((a, b) => (a.whatsapp_requested_at ?? '').localeCompare(b.whatsapp_requested_at ?? '')),
      idle: list.filter(st => !isOff(st) && !isPending(st) && !isLapsed(st, now)
        && (!st.last_activity_at || now - new Date(st.last_activity_at).getTime() > IDLE_DAYS * DAY)),
    }
  }, [stores])

  const { counts } = view
  const money = useMemo(() => (stores && payments ? moneySummary(stores, payments) : null), [stores, payments])
  const perMonth = (st: PlatformStore) => (st.monthly_price === null ? '' : ` · ${fmtMoney(st.monthly_price)}/mes`)

  return (
    <div className={s.page}>
      <div className="section-head"><h2>Resumen</h2></div>

      {(error || payError) && <div className={s.error}>{error || payError}</div>}
      {!stores && !error && <div className={s.center}><span className={s.spinner} /></div>}

      {money && (
        <div className={cx(s.kpis, s.kpis4)}>
          <div className={cx(s.kpi, s.kGreen)}><small>Cobrado este mes</small><strong>{fmtMoney(money.collected)}</strong><span>{money.paymentsCount} {money.paymentsCount === 1 ? 'pago' : 'pagos'} · <Link href="/admin/pagos" className={s.panelLink}>ver</Link></span></div>
          <div className={s.kpi}><small>Ingreso mensual</small><strong>{fmtMoney(money.monthly)}</strong><span>{money.unpriced ? `${money.unpriced} activa${money.unpriced === 1 ? '' : 's'} sin precio acordado` : 'precio acordado de las activas'}</span></div>
          <div className={cx(s.kpi, s.kAmber)}><small>Por cobrar (7 días)</small><strong>{fmtMoney(money.dueAmount)}</strong><span>{money.dueCount} {money.dueCount === 1 ? 'tienda' : 'tiendas'} por vencer</span></div>
          <div className={cx(s.kpi, s.kRed)}><small>Con adeudo</small><strong>{fmtMoney(money.debtAmount)}</strong><span>{money.debtCount} {money.debtCount === 1 ? 'tienda' : 'tiendas'} en solo lectura</span></div>
        </div>
      )}

      {stores && (
        <>
          <div className={s.kpis}>
            <div className={s.kpi}><small>Tiendas</small><strong>{counts.all}</strong><span>registradas</span></div>
            <div className={cx(s.kpi, s.kGreen)}><small>Activas</small><strong>{counts.active}</strong><span>pagando, al corriente</span></div>
            <div className={cx(s.kpi, s.kMagenta)}><small>Por activar</small><strong>{counts.pending}</strong><span>esperan su primer pago</span></div>
            <div className={cx(s.kpi, s.kAmber)}><small>Por vencer</small><strong>{counts.expiring}</strong><span>prueba ≤ 3 días o pago ≤ 7</span></div>
            <div className={cx(s.kpi, s.kRed)}><small>Solo lectura</small><strong>{counts.readonly}</strong><span>prueba o pago vencido</span></div>
          </div>

          <ErrorsPanel />

          {view.waRequests.length > 0 && (
            <section className={s.panel} style={{ marginBottom: 12 }}>
              <div className={s.panelHead}>
                <strong>Solicitudes de WhatsApp</strong>
                <span>{view.waRequests.length}</span>
              </div>
              {view.waRequests.map(st => (
                <StoreLink key={st.id} st={st}>
                  <span className={s.itemMain}>
                    <strong>{st.name}</strong>
                    <small>{st.owner_name || st.owner_email || 'Sin dueño'} · lo pidió {ago(st.whatsapp_requested_at).toLowerCase()}</small>
                  </span>
                  <em className={cx(s.badge, s.bActive)}>Contactar</em>
                </StoreLink>
              ))}
            </section>
          )}

          <div className={s.panels}>
            <section className={s.panel}>
              <div className={s.panelHead}>
                <strong>Requieren atención</strong>
                <span>{view.attention.length || ''}</span>
              </div>
              {view.attention.length === 0
                ? <div className={s.panelEmpty}>Todo al corriente: ninguna tienda espera activación, debe o vence en los próximos días.</div>
                : view.attention.map(st => (
                  <StoreLink key={st.id} st={st}>
                    <span className={s.itemMain}>
                      <strong>{st.name}</strong>
                      <small>{subscriptionLine(st)}{perMonth(st)}</small>
                    </span>
                    {isPending(st)
                      ? <em className={cx(s.badge, s.bPending)}>Por activar</em>
                      : isLapsed(st)
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
