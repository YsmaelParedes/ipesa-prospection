/**
 * Cómo se describe cada plan (sitio y Configuración → Plan). Los números
 * salen de PLANS para que el texto nunca contradiga los límites reales.
 */
import { PLANS, type PlanId } from './stores'

const fmt = (n: number) => n.toLocaleString('es-MX')

/**
 * Tarjetas de los planes: solo lo que decide la compra (máximo 6 renglones,
 * en beneficios). Lo demás va en la tabla comparativa (PLAN_COMPARE).
 *  · pitch: frase corta debajo del precio (p. ej. «Menos que una cubeta al mes»).
 */
export type PlanCopy = { tagline: string; features: string[]; highlight?: boolean; pitch?: string }

export const PLAN_COPY: Record<'litro' | 'galon' | 'cubeta', PlanCopy> = {
  litro: {
    tagline: 'Para empezar a ordenar tus clientes, gratis.',
    features: [
      `1 usuario y ${fmt(PLANS.litro.maxContacts ?? 0)} clientes`,
      'Tu lista de Hoy: a quién llamar y cuándo',
      'Cotizaciones en PDF por WhatsApp y correo',
      'Recordatorios en tu celular',
    ],
  },
  galon: {
    tagline: 'Para la tienda que vende todos los días con su equipo.',
    highlight: true,
    pitch: 'Menos que una cubeta al mes.',
    features: [
      `Hasta ${PLANS.galon.maxUsers} usuarios y clientes sin límite`,
      'Todo lo de Litro',
      'Reparte clientes entre tus vendedores',
      'Oportunidades: lo que está por cerrarse y cuánto vale',
      'Meta diaria para el equipo',
    ],
  },
  cubeta: {
    tagline: 'Para medir y dirigir a tu equipo.',
    features: [
      `Hasta ${PLANS.cubeta.maxUsers} usuarios`,
      'Todo lo de Galón',
      'WhatsApp de tu tienda dentro del CRM',
      'Resultados y metas por vendedor: día, semana y mes',
      'Reportes en Excel por vendedor',
      'Te ayudamos a importar tu base y a capacitar a tu equipo',
    ],
  },
}

/** Filas de la tabla comparativa del sitio. */
export const PLAN_COMPARE: { label: string; values: Record<'litro' | 'galon' | 'cubeta', string | boolean> }[] = [
  { label: 'Usuarios', values: { litro: '1', galon: String(PLANS.galon.maxUsers), cubeta: String(PLANS.cubeta.maxUsers) } },
  { label: 'Contactos', values: { litro: fmt(PLANS.litro.maxContacts ?? 0), galon: 'Sin límite', cubeta: 'Sin límite' } },
  { label: 'Sistema comercial: lista de Hoy y registro de llamadas', values: { litro: true, galon: true, cubeta: true } },
  { label: 'Oportunidades y Actividad diaria', values: { litro: false, galon: true, cubeta: true } },
  { label: 'Metas diarias', values: { litro: false, galon: 'Una para el equipo', cubeta: 'Propias por vendedor' } },
  { label: 'Agenda y avisos en el celular', values: { litro: true, galon: true, cubeta: true } },
  { label: 'Cotizaciones en PDF por WhatsApp y correo', values: { litro: true, galon: true, cubeta: true } },
  { label: 'Importar desde Excel', values: { litro: true, galon: true, cubeta: true } },
  { label: 'Acumulado: día, semana y mes por vendedor', values: { litro: false, galon: false, cubeta: true } },
  { label: 'A qué clientes cotizó y vendió cada vendedor', values: { litro: false, galon: false, cubeta: true } },
  { label: 'Reportes en Excel por vendedor', values: { litro: false, galon: false, cubeta: true } },
  { label: 'Permisos que cuidan tu base de clientes', values: { litro: false, galon: true, cubeta: true } },
  { label: 'Más de un administrador', values: { litro: false, galon: false, cubeta: true } },
  { label: 'Te ayudamos a importar tu base y capacitamos a tu equipo', values: { litro: false, galon: false, cubeta: true } },
  { label: 'WhatsApp: los chats de tu tienda en el CRM', values: { litro: false, galon: false, cubeta: true } },
]

export const planName = (p: PlanId) => PLANS[p].label
