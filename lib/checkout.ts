/**
 * Abrir el pago de Cubeta en Stripe desde el navegador (Configuración → Plan
 * y el aviso «Cambiar a Cubeta»). Registra «Pago iniciado», recuerda el plan
 * para contar «Plan contratado» al volver y lleva a Stripe Checkout.
 */
import { apiFetch } from './apiClient'
import { EVENTS, track } from './analytics'
import type { PlanInterval } from './billing'
import { PAID_PLAN } from './stores'

/** Plan que se fue a pagar a Stripe (para las estadísticas al volver). */
export const CHECKOUT_PLAN_KEY = 'matices:checkout-plan'

/** Lleva a Stripe Checkout; si falla, lanza el error con el mensaje para mostrar. */
export async function startCheckout(interval: PlanInterval, from: string): Promise<void> {
  track(EVENTS.checkoutStarted, { plan: PAID_PLAN, periodo: interval === 'year' ? 'anual' : 'mensual', desde: from })
  try { sessionStorage.setItem(CHECKOUT_PLAN_KEY, PAID_PLAN) } catch {}
  const res = await apiFetch('/api/billing/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: PAID_PLAN, interval }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo abrir el pago. Intenta de nuevo.')
  window.location.href = data.url
}
