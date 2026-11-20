/**
 * Cómo se describe cada plan (sitio y Configuración → Plan). Los números
 * salen de PLANS para que el texto nunca contradiga los límites reales.
 */
import { PLANS, PUBLIC_PLANS, TRIAL_DAYS, type PlanId } from './stores'

const fmt = (n: number) => n.toLocaleString('es-MX')

export type PublicPlanId = typeof PUBLIC_PLANS[number]

/**
 * Un renglón de beneficios: primero la función principal en negritas, con el
 * mismo nombre que en el menú del sitio (Sistema Comercial, Cotizaciones…), y
 * luego su detalle. Los renglones secundarios van sin nombre.
 */
export type FeatureLine = { name?: string; text: string }
export const featureKey = (f: FeatureLine) => `${f.name ?? ''}${f.text}`

/**
 * Tarjetas de los planes: solo lo que decide la compra (máximo 6 renglones:
 * las funciones principales y al final alguna secundaria). Lo demás va en la
 * tabla comparativa (PLAN_COMPARE).
 *  · pitch: frase corta debajo del precio.
 */
export type PlanCopy = { tagline: string; features: FeatureLine[]; highlight?: boolean; pitch?: string }

export const PLAN_COPY: Record<PublicPlanId, PlanCopy> = {
  litro: {
    tagline: 'Para trabajar tú solo, gratis.',
    features: [
      { name: 'Sistema Comercial', text: ': a quién llamar hoy y cada llamada en 3 toques' },
      { name: 'Cotizaciones', text: ' en PDF por WhatsApp y correo' },
      { name: 'Oportunidades', text: ': cada cotización abierta, con su monto' },
      { name: 'Contactos', text: ` por zonas, hasta ${fmt(PLANS.litro.maxContacts ?? 0)} clientes` },
      { name: 'Agenda y avisos', text: ' en tu celular' },
      { text: '1 usuario e importación desde Excel' },
    ],
  },
  cubeta: {
    tagline: 'Para tu tienda, con tu equipo y tu WhatsApp.',
    highlight: true,
    pitch: `${TRIAL_DAYS} días gratis, sin tarjeta.`,
    features: [
      { name: 'Todo lo de Litro', text: ', con clientes sin límite' },
      { name: 'WhatsApp', text: ': los chats de tu tienda en el CRM' },
      { name: 'Equipo y metas', text: `: hasta ${PLANS.cubeta.maxUsers} usuarios, cada vendedor contra su meta` },
      { name: 'Permisos', text: ': tu base se queda en tu tienda' },
      { text: 'Acumulado y reportes en Excel por vendedor' },
      { text: 'Te ayudamos a importar tu base y a capacitar a tu equipo' },
    ],
  },
}

/** Filas de la tabla comparativa del sitio. */
export const PLAN_COMPARE: { label: string; values: Record<PublicPlanId, string | boolean> }[] = [
  { label: 'Usuarios', values: { litro: '1', cubeta: String(PLANS.cubeta.maxUsers) } },
  { label: 'Contactos', values: { litro: fmt(PLANS.litro.maxContacts ?? 0), cubeta: 'Sin límite' } },
  { label: 'Sistema Comercial: lista de Hoy y registro de llamadas', values: { litro: true, cubeta: true } },
  { label: 'Oportunidades: cada cotización abierta, con su monto', values: { litro: true, cubeta: true } },
  { label: 'Agenda y avisos en el celular', values: { litro: true, cubeta: true } },
  { label: 'Cotizaciones en PDF por WhatsApp y correo', values: { litro: true, cubeta: true } },
  { label: 'Importar desde Excel', values: { litro: true, cubeta: true } },
  { label: 'Reparto de clientes y permisos que cuidan tu base', values: { litro: false, cubeta: true } },
  { label: 'Actividad diaria y metas del equipo', values: { litro: false, cubeta: true } },
  { label: 'Metas propias por vendedor', values: { litro: false, cubeta: true } },
  { label: 'Acumulado: día, semana y mes por vendedor', values: { litro: false, cubeta: true } },
  { label: 'A qué clientes cotizó y vendió cada vendedor', values: { litro: false, cubeta: true } },
  { label: 'Reportes en Excel por vendedor', values: { litro: false, cubeta: true } },
  { label: 'Más de un administrador', values: { litro: false, cubeta: true } },
  { label: 'Te ayudamos a importar tu base y capacitamos a tu equipo', values: { litro: false, cubeta: true } },
  { label: 'WhatsApp: los chats de tu tienda en el CRM', values: { litro: false, cubeta: true } },
]

export const planName = (p: PlanId) => PLANS[p].label
