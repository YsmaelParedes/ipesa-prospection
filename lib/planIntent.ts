/**
 * El plan que alguien eligió en la página de precios antes de registrarse
 * (solo navegador). Se guarda en este dispositivo para, al terminar de
 * configurar la tienda, abrir Configuración → Plan con ese plan listo.
 * Es una comodidad: si se pierde (otro dispositivo, datos borrados) no pasa nada.
 */
import type { PaidPlanId } from './stores'
import type { PlanInterval } from './billing'

const KEY = 'matices:plan-intent'
const TTL = 30 * 24 * 60 * 60 * 1000

export type PlanIntent = { plan: PaidPlanId; interval: PlanInterval }

export function savePlanIntent(intent: PlanIntent) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...intent, at: Date.now() })) } catch {}
}

export function readPlanIntent(): PlanIntent | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw || Date.now() - Number(raw.at) > TTL) return null
    if (raw.plan !== 'galon' && raw.plan !== 'cubeta') return null
    return { plan: raw.plan, interval: raw.interval === 'year' ? 'year' : 'month' }
  } catch {
    return null
  }
}

export function clearPlanIntent() {
  try { localStorage.removeItem(KEY) } catch {}
}

/** Configuración → Plan con el plan elegido listo para activar. */
export const planTabHref = (intent: PlanIntent | null) =>
  intent ? `/configuracion?tab=plan&elegir=${intent.plan}&periodo=${intent.interval === 'year' ? 'anual' : 'mensual'}` : '/configuracion?tab=plan'
