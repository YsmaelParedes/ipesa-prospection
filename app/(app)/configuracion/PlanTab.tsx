'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { EVENTS, track } from '@/lib/analytics'
import { CHECKOUT_PLAN_KEY, startCheckout } from '@/lib/checkout'
import type { ClientStore } from '@/lib/profile'
import { invalidateSession } from '@/lib/profile'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { fmtMoney, formatPlanPrice, monthlyEquivalent, monthsSaved, type PlanInterval, type PlanPrice } from '@/lib/billing'
import { PLAN_COPY, type MainFeature } from '@/lib/planFeatures'
import { clearPlanIntent, readPlanIntent, type PlanIntent } from '@/lib/planIntent'
import { PlanIcon } from '@/components/PlanIcon'
import { SkText } from '@/components/Skeleton'
import { EMAILS } from '@/lib/legal'
import { PAID_PLAN, PLANS, PUBLIC_PLANS, STATUS_LABELS, type PaidPlanId } from '@/lib/stores'
import { Card, CardFoot, Ico, Note, Row, api, cx, fmtDate, send } from './ui'
import s from './configuracion.module.css'

export const STATUS_BADGE: Record<string, string> = {
  pending: s.bWarn, trial: s.bTrial, active: s.bActive, suspended: s.bDanger, cancelled: s.bMuted,
}

type Usage = { contacts: number; members: number; products?: number }
type PriceMap = Partial<Record<PaidPlanId, PlanPrice>>
type Prices = { available: boolean; prices: PriceMap; annual?: PriceMap }

const fmtCount = (n: number) => n.toLocaleString('es-MX')
/** Función principal: el nombre destacado y abajo qué es, como en el sitio. */
const Feature = ({ f }: { f: MainFeature }) => <li><Ico.check /><span><strong>{f.name}</strong><small>{f.text}</small></span></li>
/** Al volver de Stripe el webhook puede tardar: se revisa la sesión varias veces durante un minuto. */
const PAID_CHECKS = [2000, 5000, 10_000, 20_000, 35_000, 60_000]

/** El plan elegido: el de la dirección (?elegir=cubeta&periodo=anual) o el que se eligió en la página de precios. */
function intentFrom(params: URLSearchParams): PlanIntent | null {
  const plan = params.get('elegir')
  // «galon» queda de enlaces de cuando había tres planes
  if (plan === 'galon' || plan === 'cubeta') return { plan: PAID_PLAN, interval: params.get('periodo') === 'anual' ? 'year' : 'month' }
  return readPlanIntent()
}

/**
 * Configuración → Plan: plan actual con su uso, los dos planes y el cobro
 * con Stripe (Checkout para suscribirse, mensual o anual; portal para cambiar,
 * cancelar, tarjeta y facturas). Los administradores pagan o cambian de plan.
 * En la prueba de Cubeta de una tienda nueva, Cubeta se activa desde aquí.
 */
export function PlanTab({ store }: { store: ClientStore }) {
  const params = useSearchParams()
  const justPaid = params.get('pago') === 'ok'
  const { data: usage } = useCachedQuery<Usage>('/api/billing/usage')
  const { data: priceData } = useCachedQuery<Prices>('/api/billing/prices')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [intent, setIntent] = useState<PlanIntent | null>(null)
  const [period, setPeriod] = useState<PlanInterval>('month')

  const sub = store.subscription
  const paying = !!sub && ['active', 'trialing', 'past_due'].includes(sub.status ?? '')

  // El plan que eligió antes de registrarse (o el de la dirección) queda marcado
  useEffect(() => {
    if (paying) { clearPlanIntent(); return }
    const chosen = intentFrom(new URLSearchParams(params.toString()))
    setIntent(chosen)
    if (chosen) setPeriod(chosen.interval)
  }, [params, paying])

  // Al volver de Stripe el webhook puede tardar unos segundos: se revisa la sesión
  useEffect(() => {
    if (!justPaid) return
    const timers = PAID_CHECKS.map(ms => setTimeout(() => invalidateSession(), ms))
    return () => timers.forEach(clearTimeout)
  }, [justPaid])

  // Estadísticas: «Plan contratado» una sola vez al volver de Stripe (recargar no lo repite)
  useEffect(() => {
    if (!justPaid) return
    try {
      const plan = sessionStorage.getItem(CHECKOUT_PLAN_KEY)
      if (!plan) return
      sessionStorage.removeItem(CHECKOUT_PLAN_KEY)
      track(EVENTS.planPurchased, { plan })
    } catch {}
  }, [justPaid])

  // past_due: aún conserva el plan (días de gracia). unpaid: Stripe dejó de intentar y ya está en Litro.
  const pastDue = sub?.status === 'past_due'
  const unpaid = sub?.status === 'unpaid'
  const readonly = store.access === 'readonly'
  const trialEnd = store.trialEndsAt
  const courtesy = store.plan === 'interno' || (!paying && !trialEnd && store.plan !== 'litro')
  const monthly = priceData?.prices ?? {}
  const annual = priceData?.annual ?? {}
  const canPay = !!priceData?.available
  const hasAnnual = PUBLIC_PLANS.some(id => id !== 'litro' && annual[id])
  const yearly = period === 'year' && hasAnnual
  const saved = monthsSaved(monthly[PAID_PLAN], annual[PAID_PLAN])

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
  const checkout = async (plan: PaidPlanId) => {
    setBusy(plan)
    setError('')
    try {
      await startCheckout(yearly ? 'year' : 'month', 'plan')
    } catch (e) {
      setError((e as Error).message)
      setBusy('')
    }
  }
  const portal = () => go('portal', '/api/billing/portal')

  const headline = readonly
    ? `Tu tienda está ${STATUS_LABELS[store.status].toLowerCase()}`
    : trialEnd ? 'Prueba de Cubeta'
    : store.plan === 'litro' ? 'Litro · gratis' : `Plan ${store.planLabel}`

  const nextLine = paying
    ? sub?.cancelAtPeriodEnd ? `Termina el ${fmtDate(sub.currentPeriodEnd)}` : fmtDate(sub?.currentPeriodEnd)
    : trialEnd ? `Gratis hasta el ${fmtDate(trialEnd)}`
    : store.plan === 'litro' ? 'Sin cobro' : store.paidUntil ? `Cortesía hasta ${fmtDate(store.paidUntil)}` : 'Cortesía sin vencimiento'

  const meters = [
    { label: 'Contactos', used: usage?.contacts, max: store.limits.contacts },
    { label: 'Productos', used: usage?.products, max: store.limits.products },
    { label: 'Usuarios', used: usage?.members, max: store.maxUsers },
  ]

  return (
    <>
      {justPaid && !paying && <Note kind="info">Recibimos tu pago. Estamos confirmándolo con Stripe: tu plan se activa en unos segundos. Si no cambia en un minuto, recarga la página.</Note>}
      {justPaid && paying && <Note kind="ok">¡Listo! Tu plan {store.planLabel} está activo.</Note>}
      {pastDue && (
        <Note kind="danger">
          Hay un pago pendiente de tu suscripción. Actualiza tu tarjeta en «Administrar suscripción».
          Conservas el plan de pago durante tres días desde el primer aviso de cobro fallido;
          después tu tienda usa Litro hasta que se confirme el pago (no se borra nada).
        </Note>
      )}
      {unpaid && (
        <Note kind="danger">
          No se pudo cobrar tu suscripción y tu tienda pasó al plan Litro (no se borró nada).
          Actualiza tu tarjeta en «Administrar suscripción» para recuperar tu plan.
        </Note>
      )}
      {trialEnd && !readonly && (
        <Note kind="info">
          Estás probando todo el plan Cubeta gratis hasta el {fmtDate(trialEnd)}. Después tu tienda pasa a Litro, gratis, sin borrar nada.
          {intent ? ` Elegiste ${PLANS[intent.plan].label}: actívalo abajo cuando quieras.` : ' Si quieres seguir con tu equipo y todo lo que usas, activa tu plan aquí.'}
        </Note>
      )}
      {paying && sub?.cancelAtPeriodEnd && !pastDue && (
        <Note kind="warn">Cancelaste tu suscripción: conservas el plan {store.planLabel} hasta el {fmtDate(sub.currentPeriodEnd)} y después pasas al plan Litro. Puedes reactivarla en «Administrar suscripción».</Note>
      )}
      {readonly && (
        <Note kind="warn">
          En solo consulta tu equipo puede ver su información y descargarla completa (Configuración → General), pero no
          registrar clientes ni enviar mensajes. Escríbenos para reactivarla a {EMAILS.soporte}.
        </Note>
      )}
      {error && <Note kind="danger">{error}</Note>}

      <Card>
        <div className={s.planSummary}>
          <PlanIcon plan={store.plan} className={s.planSummaryIcon} />
          <div className={s.planSummaryMain}>
            <small>Tu plan</small>
            <strong>{headline}</strong>
          </div>
          <span className={cx(s.badge, pastDue || unpaid ? s.bDanger : readonly ? STATUS_BADGE[store.status] : trialEnd ? s.bTrial : s.bActive)}>
            <i />{pastDue || unpaid ? 'Pago pendiente' : readonly ? STATUS_LABELS[store.status] : paying ? 'Suscripción activa' : trialEnd ? 'Prueba gratis' : courtesy ? 'Cortesía' : 'Activo'}
          </span>
        </div>
        <Row label={paying ? 'Próximo cobro' : 'Pago'} align="center">
          <span className={s.readValue}>{nextLine}</span>
        </Row>
        <Row label="Lo que usas" hint={store.plan === 'litro' ? 'Al llegar al límite puedes seguir consultando todo; para registrar más, cambia de plan.' : undefined}>
          <div className={s.meters}>
            {meters.map(m => {
              const pct = m.max && m.used !== undefined ? Math.min(100, (m.used / m.max) * 100) : 0
              return (
                <div key={m.label} className={s.meter}>
                  <div className={s.meterTop}><span>{m.label}</span><strong>{m.used === undefined ? <SkText w={90} /> : `${fmtCount(m.used)} de ${m.max === null ? 'sin límite' : fmtCount(m.max)}`}</strong></div>
                  {m.max !== null && <div className={cx(s.meterBar, pct >= 100 ? s.meterFull : pct >= 80 && s.meterHigh)}><i style={{ width: `${pct}%` }} /></div>}
                </div>
              )
            })}
          </div>
        </Row>
        {store.billingPortal && (
          <CardFoot status="Facturas, tarjeta y cancelación">
            <button className="btn btn-ghost" disabled={!!busy} onClick={portal}>
              <Ico.card style={{ width: 15, height: 15 }} />{busy === 'portal' ? 'Abriendo…' : 'Administrar suscripción'}
            </button>
          </CardFoot>
        )}
      </Card>

      {store.plan === 'cubeta' && !readonly && !trialEnd && (
        <Note kind="info">
          Tu plan incluye ayuda para importar tu base y capacitar a tu equipo. Escríbenos a{' '}
          <a href={`mailto:${EMAILS.soporte}`} className="auth-link strong">{EMAILS.soporte}</a> y lo agendamos.
        </Note>
      )}

      {store.plan === 'interno' ? (
        <Card title="Plan de cortesía" description="Tu tienda tiene todas las funciones sin cobro. Si necesitas cambiar algo, escríbenos.">
          <div className={s.cardBody}>
            <ul className={s.features}>
              {PLAN_COPY.cubeta.features.map(f => <li key={f.name}><Ico.check />{f.name}</li>)}
              <li><Ico.check />Hasta {store.maxUsers} usuarios con roles</li>
              <li><Ico.check />Clientes sin límite</li>
              <li><Ico.check />Reportes con gráficas y en Excel</li>
            </ul>
          </div>
        </Card>
      ) : (
        <Card title="Planes" description="Pago con tarjeta a través de Stripe, mensual o anual. Cambia o cancela cuando quieras."
          actions={hasAnnual && !paying ? (
            <div className={s.seg} role="group" aria-label="Forma de pago">
              <button type="button" className={cx(!yearly && s.segOn)} aria-pressed={!yearly} onClick={() => setPeriod('month')}>Mensual</button>
              <button type="button" className={cx(yearly && s.segOn)} aria-pressed={yearly} onClick={() => setPeriod('year')}>
                Anual{saved > 0 ? ` · ${saved} meses gratis` : ''}
              </button>
            </div>
          ) : undefined}>
          <div className={s.cardBody}>
            <div className={s.plans}>
              {PUBLIC_PLANS.map(id => {
                const copy = PLAN_COPY[id]
                // En la prueba nada es «tu plan actual»: Cubeta se activa desde aquí
                const current = store.plan === id && !readonly && !trialEnd
                const chosen = !current && intent?.plan === id
                const m = id === 'litro' ? undefined : monthly[id]
                const a = id === 'litro' ? undefined : annual[id]
                const shown = yearly && a ? monthlyEquivalent(a) : m
                let action: React.ReactNode
                if (current) action = <button className="btn btn-ghost" disabled>Tu plan actual</button>
                else if (readonly) action = null
                else if (id === 'litro') action = paying ? <button className="btn btn-ghost" disabled={!!busy} onClick={portal}>{busy === 'portal' ? 'Abriendo…' : 'Cancelar suscripción'}</button> : null
                else if (paying) action = <button className="btn btn-dark" disabled={!!busy} onClick={portal}>{busy === 'portal' ? 'Abriendo…' : `Cambiar a ${PLANS[id].label}`}</button>
                else action = (
                  <button className={copy.highlight || chosen ? 'btn btn-primary' : 'btn btn-dark'} disabled={!!busy || !canPay} onClick={() => checkout(id)}>
                    {!canPay ? 'Disponible pronto' : busy === id ? 'Abriendo pago…' : `${trialEnd ? 'Activar' : 'Cambiar a'} ${PLANS[id].label}${yearly && a ? ' anual' : ''}`}
                  </button>
                )
                return (
                  <div key={id} className={cx(s.planOption, current && s.planOptionOn, (chosen || (copy.highlight && !current && !intent)) && s.planOptionHi)}>
                    {current ? <span className={cx(s.planFlag, s.planFlagOn)}>Tu plan</span>
                      : chosen ? <span className={s.planFlag}>Elegiste este plan</span>
                      : copy.highlight && !intent && <span className={s.planFlag}>Recomendado</span>}
                    <PlanIcon plan={id} className={s.planIcon} />
                    <div className={s.planName}>{PLANS[id].label}</div>
                    <div className={s.planPrice}>
                      {id === 'litro'
                        ? <><strong>Gratis</strong><small>para siempre</small></>
                        : shown ? <><strong>{formatPlanPrice(shown)}</strong><small>al mes</small></>
                        : <><strong className={s.planPriceSoon}>—</strong><small>{priceData ? 'precio pronto' : 'cargando…'}</small></>}
                    </div>
                    {yearly && a && <p className={s.planYear}>Pagas {fmtMoney(a.amount, a.currency)} al año</p>}
                    <p className={s.planTagline}>{copy.tagline}</p>
                    {copy.lead && <p className={s.planLead}>{copy.lead}</p>}
                    <ul className={s.planFeatures}>
                      {copy.features.map(f => <Feature key={f.name} f={f} />)}
                    </ul>
                    {copy.extras.length > 0 && (
                      <ul className={s.planExtras}>
                        {copy.extras.map(t => <li key={t}><Ico.check />{t}</li>)}
                      </ul>
                    )}
                    {action && <div className={s.planAction}>{action}</div>}
                  </div>
                )
              })}
            </div>
            <p className={s.hint}>
              Precios por tienda, impuestos incluidos. Si bajas de plan no se borra nada: lo que pase del límite se conserva y sigues pudiendo consultarlo.
              {' '}¿Necesitas factura? Escríbenos a <a href={`mailto:${EMAILS.facturacion}`} className="auth-link strong">{EMAILS.facturacion}</a> con tus datos fiscales.
            </p>
          </div>
        </Card>
      )}
    </>
  )
}
