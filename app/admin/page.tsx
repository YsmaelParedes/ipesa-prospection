'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { fmtMoney } from '@/lib/billing'
import {
  DAY, ago, countStores, fmtDate, isCancelling, isDeletionScheduled, isOff, isPastDue, subscriptionLine,
  useBilling, usePlatformStores, wantsWhatsApp, type PlatformStore,
} from './data'
import { ErrorsPanel } from './errors-ui'
import s from './admin.module.css'

/**
 * Panel del dueño › Resumen: ingreso y cobros del mes (leídos de Stripe),
 * tiendas por plan y cuáles necesitan algo (pago fallido o cancelación
 * programada, eliminación por inactividad, solicitudes de WhatsApp, sin uso). Cada fila abre su ficha en
 * Tiendas; el detalle de cada cobro está en el panel de Stripe.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
const IDLE_DAYS = 14
const STRIPE = 'https://dashboard.stripe.com'

const rank = (st: PlatformStore) => (isPastDue(st) ? 0 : isDeletionScheduled(st) ? 1 : 2)
const endsAt = (st: PlatformStore) => new Date(st.deletion_scheduled_for ?? st.current_period_end ?? 0).getTime()

function StoreLink({ st, children }: { st: PlatformStore; children: React.ReactNode }) {
  return <Link href={`/admin/tiendas?tienda=${st.id}`} className={s.item}>{children}</Link>
}

function StripeLink({ path, children }: { path: string; children: React.ReactNode }) {
  return <a href={STRIPE + path} target="_blank" rel="noopener noreferrer" className={s.panelLink}>{children}</a>
}

export default function AdminHome() {
  const { stores, error } = usePlatformStores()
  const { billing, loading: billingLoading } = useBilling()

  const view = useMemo(() => {
    const list = stores ?? []
    const now = Date.now()
    return {
      counts: countStores(list, now),
      // Pagos fallidos, luego las que se eliminan por inactividad y las que se cancelan; la más próxima primero
      attention: list.filter(st => isPastDue(st) || isDeletionScheduled(st) || isCancelling(st))
        .sort((a, b) => rank(a) - rank(b) || endsAt(a) - endsAt(b)),
      recent: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
      // Pidieron WhatsApp ("Quiero activarlo"): las más antiguas primero
      waRequests: list.filter(wantsWhatsApp).sort((a, b) => (a.whatsapp_requested_at ?? '').localeCompare(b.whatsapp_requested_at ?? '')),
      idle: list.filter(st => !isOff(st)
        && (!st.last_activity_at || now - new Date(st.last_activity_at).getTime() > IDLE_DAYS * DAY)),
    }
  }, [stores])

  const { counts } = view
  const month = new Date().toLocaleDateString('es-MX', { month: 'long' })
  const money = (n: number | undefined) => (billing ? fmtMoney(n ?? 0, billing.currency) : billingLoading ? '…' : '—')
  const storesNote = [
    counts.courtesy && `${counts.courtesy} de cortesía`,
    counts.interno && `${counts.interno} interna${counts.interno === 1 ? '' : 's'}`,
    counts.off && `${counts.off} suspendida${counts.off === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ') || 'registradas'

  return (
    <div className={s.page}>
      <div className="section-head"><h2>Resumen</h2></div>

      {error && <div className={s.error}>{error}</div>}
      {!stores && !error && <div className={s.center}><span className={s.spinner} /></div>}

      {stores && (
        <>
          <div className={cx(s.kpis, s.kpis4)}>
            <div className={cx(s.kpi, s.kGreen)}>
              <small>Ingreso mensual</small><strong>{money(billing?.mrr)}</strong>
              <span>{billing ? `${billing.subscriptions} ${billing.subscriptions === 1 ? 'suscripción' : 'suscripciones'} · ` : billingLoading ? '' : 'Stripe no respondió · '}<StripeLink path="/subscriptions">ver en Stripe</StripeLink></span>
            </div>
            <div className={s.kpi}>
              <small>Cobrado en {month}</small><strong>{money(billing?.collected)}</strong>
              <span>{billing ? `${billing.paidInvoices} ${billing.paidInvoices === 1 ? 'factura pagada' : 'facturas pagadas'} · ` : ''}<StripeLink path="/payments">ver cobros</StripeLink></span>
            </div>
            <div className={cx(s.kpi, s.kRed)}>
              <small>Pagos fallidos</small><strong>{counts.pastDue}</strong>
              <span>{billing?.openAmount ? `${fmtMoney(billing.openAmount, billing.currency)} por cobrar` : 'Stripe reintenta el cobro'}</span>
            </div>
            <div className={cx(s.kpi, s.kAmber)}>
              <small>Se cancelan</small><strong>{counts.cancelling}</strong>
              <span>al terminar su periodo pasan a Litro</span>
            </div>
          </div>

          <div className={cx(s.kpis, s.kpis4)}>
            <div className={s.kpi}><small>Tiendas</small><strong>{counts.all}</strong><span>{storesNote}</span></div>
            <div className={s.kpi}><small>Litro</small><strong>{counts.litro}</strong><span>plan gratis</span></div>
            <div className={cx(s.kpi, s.kCyan)}><small>Galón</small><strong>{counts.galon}</strong><span>de paga</span></div>
            <div className={cx(s.kpi, s.kMagenta)}><small>Cubeta</small><strong>{counts.cubeta}</strong><span>de paga, con WhatsApp</span></div>
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
                ? <div className={s.panelEmpty}>Todo al corriente: ningún pago fallido, cancelación ni eliminación programada.</div>
                : view.attention.map(st => (
                  <StoreLink key={st.id} st={st}>
                    <span className={s.itemMain}>
                      <strong>{st.name}</strong>
                      <small>{isDeletionScheduled(st) && !isPastDue(st)
                        ? `Sin uso desde el ${fmtDate(st.last_used_at, { day: 'numeric', month: 'short' })} · se elimina el ${fmtDate(st.deletion_scheduled_for, { day: 'numeric', month: 'short' })}`
                        : subscriptionLine(st)}</small>
                    </span>
                    {isPastDue(st)
                      ? <em className={cx(s.badge, s.bDanger)}>Pago fallido</em>
                      : isDeletionScheduled(st)
                        ? <em className={cx(s.badge, s.bDanger)}>Se elimina</em>
                        : <em className={cx(s.badge, s.bWarn)}>Se cancela</em>}
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
