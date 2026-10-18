'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { fmtMoney } from '@/lib/payments'
import {
  DAY, ago, countStores, currentMonth, expiresSoon, fmtDate, isLapsed, isOff, isPastDue, moneySummary, subscriptionLine,
  usePayments, usePlatformStores, wantsWhatsApp, type PlatformStore,
} from './data'
import { ErrorsPanel } from './errors-ui'
import s from './admin.module.css'

/**
 * Panel del dueño › Resumen: tiendas por plan, suscripciones de Stripe y
 * pagos fallidos, cobros a mano (cortesías y acuerdos especiales) y cuáles
 * necesitan algo (pago fallido, cortesía vencida o por vencer, sin uso).
 * Cada fila abre su ficha en Tiendas. Los cobros de Stripe se ven en su panel.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
const IDLE_DAYS = 14

const rank = (st: PlatformStore, now: number) => (isPastDue(st) ? 0 : isLapsed(st, now) ? 1 : 2)

/** Fecha en que vence la cortesía o el pago a mano. */
const dueAt = (st: PlatformStore) => new Date(st.paid_until ?? 0).getTime()

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
      // Primero los pagos fallidos de Stripe, luego las cortesías vencidas y al final las que vencen pronto
      attention: list.filter(st => isPastDue(st) || isLapsed(st, now) || expiresSoon(st, now))
        .sort((a, b) => rank(a, now) - rank(b, now) || dueAt(a) - dueAt(b)),
      recent: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
      // Pidieron WhatsApp ("Quiero activarlo"): las más antiguas primero
      waRequests: list.filter(wantsWhatsApp).sort((a, b) => (a.whatsapp_requested_at ?? '').localeCompare(b.whatsapp_requested_at ?? '')),
      idle: list.filter(st => !isOff(st)
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

      {stores && (
        <>
          <div className={s.kpis}>
            <div className={s.kpi}><small>Tiendas</small><strong>{counts.all}</strong><span>{counts.off ? `${counts.off} suspendida${counts.off === 1 ? '' : 's'}` : 'registradas'}</span></div>
            <div className={s.kpi}><small>Litro</small><strong>{counts.litro}</strong><span>plan gratis</span></div>
            <div className={cx(s.kpi, s.kGreen)}><small>Galón</small><strong>{counts.galon}</strong><span>de paga</span></div>
            <div className={cx(s.kpi, s.kMagenta)}><small>Cubeta</small><strong>{counts.cubeta}</strong><span>de paga, con WhatsApp</span></div>
            <div className={cx(s.kpi, s.kRed)}><small>Pagos fallidos</small><strong>{counts.pastDue}</strong><span>Stripe reintenta el cobro</span></div>
          </div>

          {money && (
            <div className={cx(s.kpis, s.kpis4)}>
              <div className={cx(s.kpi, s.kGreen)}><small>Suscripciones</small><strong>{counts.stripe}</strong><span>con Stripe · <a href="https://dashboard.stripe.com/subscriptions" target="_blank" rel="noopener noreferrer" className={s.panelLink}>ver cobros</a></span></div>
              <div className={s.kpi}><small>Cobrado a mano este mes</small><strong>{fmtMoney(money.collected)}</strong><span>{money.paymentsCount} {money.paymentsCount === 1 ? 'pago' : 'pagos'} · <Link href="/admin/pagos" className={s.panelLink}>ver</Link></span></div>
              <div className={cx(s.kpi, s.kAmber)}><small>Cortesías por vencer</small><strong>{money.dueCount}</strong><span>{money.dueAmount ? `${fmtMoney(money.dueAmount)} acordado` : 'en los próximos 7 días'}</span></div>
              <div className={cx(s.kpi, s.kRed)}><small>Cortesías vencidas</small><strong>{counts.lapsed}</strong><span>ya trabajan en Litro</span></div>
            </div>
          )}

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
                ? <div className={s.panelEmpty}>Todo al corriente: ningún pago fallido ni cortesías vencidas o por vencer.</div>
                : view.attention.map(st => (
                  <StoreLink key={st.id} st={st}>
                    <span className={s.itemMain}>
                      <strong>{st.name}</strong>
                      <small>{subscriptionLine(st)}{perMonth(st)}</small>
                    </span>
                    {isPastDue(st)
                      ? <em className={cx(s.badge, s.bDanger)}>Pago fallido</em>
                      : isLapsed(st)
                        ? <em className={cx(s.badge, s.bPending)}>Cortesía vencida</em>
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
                ? <div className={s.panelEmpty}>Todas las tiendas han registrado actividad en los últimos {IDLE_DAYS} días.</div>
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
