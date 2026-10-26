/**
 * Páginas por giro ("Para tu tienda"): el mismo producto contado con las
 * palabras de cada negocio, para que lo encuentren al buscar en Google.
 */
export type Giro = {
  slug: string
  name: string
  /** Cómo se busca en Google (título de la página). */
  title: string
  description: string
  h1: [string, string]
  lead: string
  pains: { title: string; text: string }[]
  example: string
}

export const GIROS: Giro[] = [
  {
    slug: 'tiendas-de-pintura',
    name: 'Tiendas de pintura',
    title: 'CRM para tiendas de pintura',
    description: 'El CRM hecho para tiendas de pintura: clientes por segmento, seguimiento a cada cotización, metas por vendedor y WhatsApp con agente de IA.',
    h1: ['El CRM hecho para', 'tiendas de pintura'],
    lead: 'Pintores, constructoras, arquitectos y clientes de hogar en una sola base. Tu equipo sabe a quién llamar cada día y ninguna cotización se queda sin seguimiento.',
    pains: [
      { title: 'Cotizaciones que se enfrían', text: 'Cada cotización queda en Oportunidades con su monto y su fecha; Matices te avisa cuando lleva días sin contacto.' },
      { title: 'Clientes que compran cada mes', text: 'Pintores y constructoras regresan a la lista cuando toca su siguiente compra.' },
      { title: 'Preguntas por colores y rendimiento', text: 'El agente de IA contesta en WhatsApp cuánto rinde una cubeta o si igualan colores, a cualquier hora.' },
    ],
    example: 'Una cubeta de vinílica cotizada el lunes aparece en la lista del vendedor el miércoles para volver a llamar.',
  },
  {
    slug: 'ferreterias',
    name: 'Ferreterías',
    title: 'CRM para ferreterías y tlapalerías',
    description: 'CRM para ferreterías y tlapalerías: tu base de clientes por zona, llamadas registradas en 3 toques, cotizaciones con seguimiento y metas por vendedor.',
    h1: ['Un CRM para', 'ferreterías y tlapalerías'],
    lead: 'Herreros, contratistas y clientes de mostrador ordenados por zona. Tus vendedores llaman a quien toca hoy y tú ves cuánto se cotizó y se vendió.',
    pains: [
      { title: 'Muchos clientes, poco tiempo', text: 'La lista de Hoy pone primero lo vencido y lo de hoy; el resto espera su turno sin perderse.' },
      { title: 'Rutas por zona', text: 'Filtra por zona y arma tu ruta de visitas, incluso con los negocios que no tienen teléfono.' },
      { title: 'Base en Excel', text: 'Importa tu lista de clientes en un paso y empieza a trabajarla el mismo día.' },
    ],
    example: 'Un herrero de tu zona que pidió precio de esmalte aparece mañana en la lista de su vendedor.',
  },
  {
    slug: 'distribuidores',
    name: 'Distribuidores',
    title: 'CRM para distribuidores de pintura y materiales',
    description: 'CRM para distribuidores de pintura y materiales: prospección por zona, seguimiento de cotizaciones grandes, equipo de vendedores con metas y WhatsApp.',
    h1: ['Un CRM para', 'distribuidores'],
    lead: 'Prospecta constructoras, hoteles e industrias, da seguimiento a cotizaciones grandes y mide a cada vendedor contra su meta del día y del mes.',
    pains: [
      { title: 'Cotizaciones de alto monto', text: 'Ves cuánto tienes cotizado y cuánto esperas vender, con cada oportunidad a la vista.' },
      { title: 'Equipo en la calle', text: 'Cada vendedor registra llamadas y visitas desde su celular; tú ves el avance de todos en Equipo.' },
      { title: 'Clientes que se reparten', text: 'El primero que trabaja a un prospecto se queda con él; el administrador puede reasignarlo.' },
    ],
    example: 'Una constructora con una obra de 40 departamentos queda en Oportunidades hasta que se decide.',
  },
]

export const giroBySlug = (slug: string) => GIROS.find(g => g.slug === slug) ?? null
