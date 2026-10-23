/**
 * Cómo se describe cada plan (sitio y Configuración → Plan). Los números
 * salen de PLANS para que el texto nunca contradiga los límites reales.
 */
import { PLANS, type PlanId } from './stores'

const users = (n: number) => (n === 1 ? 'Solo el dueño (1 usuario)' : `Hasta ${n} usuarios: tú y ${n - 1} vendedores`)

export type PlanCopy = { tagline: string; features: string[]; highlight?: boolean }

export const PLAN_COPY: Record<'litro' | 'galon' | 'cubeta', PlanCopy> = {
  litro: {
    tagline: 'Para empezar a ordenar tus clientes, gratis.',
    features: [
      users(PLANS.litro.maxUsers),
      `${PLANS.litro.maxContacts} contactos`,
      'Sistema comercial: tu lista de Hoy con a quién llamar y cuándo',
      'Importa tu lista de clientes de Excel',
      'Agenda, recordatorios y avisos en el celular',
    ],
  },
  galon: {
    tagline: 'Para la tienda que vende todos los días con su equipo.',
    highlight: true,
    features: [
      users(PLANS.galon.maxUsers),
      'Contactos sin límite',
      'Reparte contactos entre tus vendedores',
      'Oportunidades, metas por vendedor y pantalla Equipo',
      'Permisos que cuidan tu base de clientes',
      'Agenda, recordatorios y avisos en el celular',
    ],
  },
  cubeta: {
    tagline: 'Todo Matices, con WhatsApp conectado a tus clientes.',
    features: [
      `${users(PLANS.cubeta.maxUsers)}, con administradores`,
      'Todo lo del plan Galón',
      'Bandeja de WhatsApp ligada al CRM',
      'Cada chat con su cliente y sus cotizaciones',
      'Un asesor conecta el número de tu tienda',
    ],
  },
}

/** Filas de la tabla comparativa del sitio. */
export const PLAN_COMPARE: { label: string; values: Record<'litro' | 'galon' | 'cubeta', string | boolean> }[] = [
  { label: 'Usuarios', values: { litro: '1', galon: String(PLANS.galon.maxUsers), cubeta: String(PLANS.cubeta.maxUsers) } },
  { label: 'Contactos', values: { litro: String(PLANS.litro.maxContacts), galon: 'Sin límite', cubeta: 'Sin límite' } },
  { label: 'Sistema comercial: lista de Hoy y registro de llamadas', values: { litro: true, galon: true, cubeta: true } },
  { label: 'Oportunidades, metas por vendedor y pantalla Equipo', values: { litro: false, galon: true, cubeta: true } },
  { label: 'Agenda y avisos en el celular', values: { litro: true, galon: true, cubeta: true } },
  { label: 'Importar desde Excel', values: { litro: true, galon: true, cubeta: true } },
  { label: 'Administradores además del dueño', values: { litro: false, galon: false, cubeta: true } },
  { label: 'Bandeja de WhatsApp', values: { litro: false, galon: false, cubeta: true } },
]

export const planName = (p: PlanId) => PLANS[p].label
