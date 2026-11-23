/**
 * Funciones con candado en Litro: lo que dice cada una cuando alguien la toca
 * (aviso «Cambiar a Cubeta» y pantallas de muestra). Litro es para trabajar
 * solo; lo que conecta la tienda con su equipo o su WhatsApp es de Cubeta.
 */
import { PLANS } from './stores'

export type LockedFeature = 'equipo' | 'whatsapp' | 'reportes' | 'contactos' | 'productos' | 'prueba'

export type LockCopy = {
  /** Título del aviso */
  title: string
  /** Por qué es de Cubeta y qué gana (una o dos frases) */
  text: string
}

export const LOCKS: Record<LockedFeature, LockCopy> = {
  equipo: {
    title: 'Tu equipo viene en Cubeta',
    text: `En Litro trabajas tú solo. Con Cubeta invitas hasta ${PLANS.cubeta.maxUsers} personas, repartes clientes entre tus vendedores y ves los resultados de cada uno.`,
  },
  whatsapp: {
    title: 'WhatsApp viene en Cubeta',
    text: 'Conecta el número de tu tienda y contesta sus chats desde el CRM, con el historial y las cotizaciones de cada cliente.',
  },
  reportes: {
    title: 'Reportes viene en Cubeta',
    text: 'Cada vendedor contra su meta de hoy, y el día, la semana, el mes o el año contra el periodo anterior, con gráficas, filtros y Excel.',
  },
  prueba: {
    title: 'Sigue con Cubeta',
    text: 'Tu equipo, el WhatsApp de tu tienda, metas por vendedor y reportes, como en tu prueba. Lo que registraste sigue ahí.',
  },
  contactos: {
    title: 'Clientes sin límite con Cubeta',
    text: `Litro incluye ${PLANS.litro.maxContacts?.toLocaleString('es-MX')} clientes. Con Cubeta registras todos los que necesites, y los que ya tienes se quedan como están.`,
  },
  productos: {
    title: 'Todo tu catálogo con Cubeta',
    text: `Litro incluye ${PLANS.litro.maxProducts?.toLocaleString('es-MX')} productos. Con Cubeta importas y cotizas todo tu catálogo, sin límite, y los que ya tienes se quedan como están.`,
  },
}

/** Lo demás que trae Cubeta, debajo de la explicación del aviso. */
export const cubetaAlso = (feature: LockedFeature) => feature === 'prueba' ? 'Además te ayudamos a importar tu base y a capacitar a tu equipo.'
  : feature === 'whatsapp'
  ? `También incluye a tu equipo (hasta ${PLANS.cubeta.maxUsers} usuarios), metas por vendedor y reportes en Excel.`
  : 'También incluye el WhatsApp de tu tienda, metas por vendedor y reportes en Excel.'
