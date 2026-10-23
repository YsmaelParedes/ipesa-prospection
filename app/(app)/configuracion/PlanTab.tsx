'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ClientStore } from '@/lib/profile'
import { invalidateSession } from '@/lib/profile'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { formatPlanPrice, type PlanPrice } from '@/lib/billing'
import { PLAN_COPY } from '@/lib/planFeatures'
import { PlanIcon } from '@/components/PlanIcon'
import { EMAILS } from '@/lib/legal'
import { PLANS, PUBLIC_PLANS, STATUS_LABELS } from '@/lib/stores'
import { Ico, Note, Panel, api, cx, fmtDate, send } from './ui'
import s from './configuracion.module.css'

export const STATUS_BADGE: Record<string, string> = {
  pending: s.bWarn, trial: s.bTrial, active: s.bActive, suspended: s.bDanger, cancelled: s.bMuted,
}

type Usage = { contacts: number; members: number }
type Prices = { available: boolean; prices: Partial<Record<'galon' | 'cubeta', PlanPrice>> }

const fmtCount = (n: number) => n.toLocaleString('es-MX')

/**
 * Configuración → Plan: plan actual con su uso, los tres planes y el cobro
 * con Stripe (Checkout para suscribirse, portal para cambiar, cancelar,
 * tarjeta y facturas). Los administradores pagan o cambian de plan.
 */
export function PlanTab({ store }: { store: ClientStore }) {
  const params = useSearchParams()
  const justPaid = params.get('pago') === 'ok'
  const { data: usage } = useCachedQuery<Usage>('/api/billing/usage')
  const { data: priceData } = useCachedQuery<Prices>('/api/billing/prices')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // Al volver de Stripe el webhook puede tardar unos segundos: se revisa la sesión
  useEffect(() => {
    if (!justPaid) return
    const timers = [2000, 5000, 10000].map(ms => setTimeout(() => invalidateSession(), ms))
    return () => timers.forEach(clearTimeout)
  }, [justPaid])

  const sub = store.subscription
  const paying = !!sub && ['active', 'trialing', 'past_due'].includes(sub.status ?? '')
  const pastDue = sub?.status === 'past_due' || sub?.status === 'unpaid'
  const readonly = store.access === 'readonly'
  const courtesy = store.plan === 'interno' || (!paying && store.plan !== 'litro')
  const prices = priceData?.prices ?? {}
  const canPay = !!priceData?.available

  const go = async (key: string, path: string, body?: unknown) => {
    setBusy(key)
    setError('')
    try {
      const { url } = await api<{ url: string }>(path, send('POST', body ?? {}))
      window.location.href = url
    } catch (e) {
      setError((e as Error).message)
      setBusy('')
    }
  }
  const checkout = (plan: 'galon' | 'cubeta') => go(plan, '/api/billing/checkout', { plan })
  const portal = () => go('portal', '/api/billing/portal')

  const headline = readonly
    ? `Tu tienda está ${STATUS_LABELS[store.status].toLowerCase()}`
    : store.plan === 'litro' ? 'Litro · gratis' : `Plan ${store.planLabel}`

  const nextLine = paying
    ? sub?.cancelAtPeriodEnd ? `Termina el ${fmtDate(sub.currentPeriodEnd)}` : fmtDate(sub?.currentPeriodEnd)
    : store.plan === 'litro' ? 'Sin cobro' : store.paidUntil ? `Cortesía hasta ${fmtDate(store.paidUntil)}` : 'Cortesía sin vencimiento'

  const meters = [
    { label: 'Contactos', used: usage?.contacts, max: store.limits.contacts },
    { label: 'Usuarios', used: usage?.members, max: store.maxUsers },
  ]

  return (
    <>
      <div className={s.planCard}>
        <div className={s.planTop}>
          <div>
            <small>Tu plan</small>
            <strong>{headline}</strong>
          </div>
          <span className={cx(s.badge, pastDue ? s.bDanger : readonly ? STATUS_BADGE[store.status] : s.bActive)}>
            <i />{pastDue ? 'Pago pendiente' : readonly ? STATUS_LABELS[store.status] : paying ? 'Suscripción activa' : courtesy ? 'Cortesía' : 'Activo'}
          </span>
        </div>
        <div className={s.planStats}>
          <div className={s.planStat}>
            <small>{paying ? 'Próximo cobro' : 'Pago'}</small>
            <strong>{nextLine}</strong>
          </div>
          <div className={s.planStat}>
            <small>Contactos</small>
            <strong>{usage ? `${fmtCount(usage.contacts)}${store.limits.contacts !== null ? ` de ${fmtCount(store.limits.contacts)}` : ''}` : '…'}</strong>
          </div>
          <div className={s.planStat}>
            <small>Usuarios</small>
            <strong>{usage ? `${usage.members} de ${store.maxUsers}` : `Hasta ${store.maxUsers}`}</strong>
          </div>
        </div>
      </div>

      {justPaid && !paying && <Note kind="info">Recibimos tu pago. Estamos confirmándolo con Stripe: tu plan se activa en unos segundos.</Note>}
      {justPaid && paying && <Note kind="ok">¡Listo! Tu plan {store.planLabel} está activo.</Note>}
      {pastDue && (
        <Note kind="danger">
          Hay un pago pendiente de tu suscripción. Actualiza tu tarjeta en «Administrar suscripción».
          Conservas el plan de pago durante tres días desde el primer aviso de cobro fallido;
          después tu tienda usa Litro hasta que se confirme el pago (no se borra nada).
        </Note>
      )}
      {paying && sub?.cancelAtPeriodEnd && !pastDue && (
        <Note kind="warn">Cancelaste tu suscripción: conservas el plan {store.planLabel} hasta el {fmtDate(sub.currentPeriodEnd)} y después pasas al plan Litro. Puedes reactivarla en «Administrar suscripción».</Note>
      )}
      {readonly && (
        <Note kind="warn">
          En solo consulta tu equipo puede ver su información y descargarla completa (Configuración → Tienda), pero no
          registrar clientes ni enviar mensajes. Escríbenos para reactivarla a {EMAILS.soporte}.
        </Note>
      )}
      {error && <Note kind="danger">{error}</Note>}

      {store.plan === 'litro' && (
        <Panel icon={Ico.bolt} tone="tAmber" title="Lo que usas del plan Litro" subtitle="Al llegar al límite puedes seguir consultando todo; para registrar más, cambia de plan.">
          <div className={s.meters}>
            {meters.map(m => {
              const pct = m.max && m.used !== undefined ? Math.min(100, (m.used / m.max) * 100) : 0
              return (
                <div key={m.label} className={s.meter}>
                  <div className={s.meterTop}><span>{m.label}</span><strong>{m.used === undefined ? '…' : `${fmtCount(m.used)} de ${m.max === null ? 'sin límite' : fmtCount(m.max)}`}</strong></div>
                  <div className={cx(s.meterBar, pct >= 100 ? s.meterFull : pct >= 80 && s.meterHigh)}><i style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {store.plan === 'interno' ? (
        <Panel icon={Ico.shield} tone="tTeal" title="Plan de cortesía" subtitle="Tu tienda tiene todas las funciones sin cobro. Si necesitas cambiar algo, escríbenos.">
          <ul className={s.features}>
            {PLAN_COPY.cubeta.features.slice(1).map(f => <li key={f}><Ico.check />{f}</li>)}
            <li><Ico.check />Hasta {store.maxUsers} usuarios con roles</li>
          </ul>
        </Panel>
      ) : (
        <Panel icon={Ico.card} title="Planes"
          subtitle="Pago mensual con tarjeta a través de Stripe. Cambia o cancela cuando quieras.">
          <div className={s.plans}>
            {PUBLIC_PLANS.map(id => {
              const copy = PLAN_COPY[id]
              const current = store.plan === id && !readonly
              const price = id === 'litro' ? null : prices[id]
              let action: React.ReactNode
              if (current) action = <button className="btn btn-ghost" disabled>Tu plan actual</button>
              else if (readonly) action = null
              else if (id === 'litro') action = paying ? <button className="btn btn-ghost" disabled={!!busy} onClick={portal}>{busy === 'portal' ? 'Abriendo…' : 'Cancelar suscripción'}</button> : null
              else if (paying) action = <button className="btn btn-dark" disabled={!!busy} onClick={portal}>{busy === 'portal' ? 'Abriendo…' : `Cambiar a ${PLANS[id].label}`}</button>
              else if (store.plan === 'interno') action = null
              else action = (
                <button className={copy.highlight ? 'btn btn-primary' : 'btn btn-dark'} disabled={!!busy || !canPay} onClick={() => checkout(id)}>
                  {!canPay ? 'Disponible pronto' : busy === id ? 'Abriendo pago…' : `Cambiar a ${PLANS[id].label}`}
                </button>
              )
              return (
                <div key={id} className={cx(s.planOption, current && s.planOptionOn, copy.highlight && !current && s.planOptionHi)}>
                  {copy.highlight && <span className={s.planFlag}>Recomendado</span>}
                  <PlanIcon plan={id} className={s.planIcon} />
                  <div className={s.planName}>{PLANS[id].label}</div>
                  <div className={s.planPrice}>
                    {id === 'litro'
                      ? <><strong>Gratis</strong><small>para siempre</small></>
                      : price ? <><strong>{formatPlanPrice(price)}</strong><small>al mes</small></>
                      : <><strong className={s.planPriceSoon}>—</strong><small>{priceData ? 'precio pronto' : 'cargando…'}</small></>}
                  </div>
                  <p className={s.planTagline}>{copy.tagline}</p>
                  <ul className={s.planFeatures}>
                    {copy.features.map(f => <li key={f}><Ico.check />{f}</li>)}
                  </ul>
                  {action && <div className={s.planAction}>{action}</div>}
                </div>
              )
            })}
          </div>
          {store.billingPortal && (
            <div className={s.billingRow}>
              <span>Facturas, tarjeta y cancelación</span>
              <button className="btn btn-ghost" disabled={!!busy} onClick={portal}>
                <Ico.card style={{ width: 15, height: 15 }} />{busy === 'portal' ? 'Abriendo…' : 'Administrar suscripción'}
              </button>
            </div>
          )}
          <p className={s.hint}>Precios por tienda, impuestos incluidos. Si bajas de plan no se borra nada: lo que pase del límite se conserva y sigues pudiendo consultarlo.</p>
        </Panel>
      )}
    </>
  )
}
