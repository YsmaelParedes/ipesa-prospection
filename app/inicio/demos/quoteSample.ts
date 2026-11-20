import type { QuoteItem, QuoteStore } from '@/lib/quotes'

/* Datos de ejemplo de la cotización del sitio (demo y vistas de ejemplo). Tienda y clientes inventados. */

export const SAMPLE_STORE: QuoteStore = {
  name: 'Pinturas del Valle',
  phone: '222 555 0142',
  email: null,
  address: 'Av. Juárez 2915, col. La Paz',
  city: 'Puebla',
  state: 'Puebla',
  logoUrl: null,
  rfc: '',
  legalName: '',
  branded: false,
}

export const SAMPLE_CLIENT = { name: 'Carlos Ríos', phone: '222 318 4470' }
export const SAMPLE_SELLER = 'Luis Herrera'
export const SAMPLE_FOLIO = 128
export const SAMPLE_DISCOUNT = 5
export const SAMPLE_TERMS = 'Precios en pesos mexicanos. Sujetos a cambio sin previo aviso y a disponibilidad de producto.'

export const SAMPLE_ITEMS: QuoteItem[] = [
  { description: 'Vinílica Premium blanca 19 L', quantity: 4, unit: 'cubeta', price: 1890 },
  { description: 'Sellador acrílico 19 L', quantity: 2, unit: 'cubeta', price: 1240 },
  { description: 'Rodillo de felpa 9"', quantity: 3, unit: 'pza', price: 145 },
]

/** Lo que sugiere el buscador de productos: lo que la tienda ya cotizó, con su último precio. */
export const SAMPLE_SUGGESTIONS: QuoteItem[] = [
  { description: 'Esmalte alquidálico negro 4 L', quantity: 1, unit: 'galón', price: 689 },
  { description: 'Impermeabilizante 5 años 19 L', quantity: 1, unit: 'cubeta', price: 2150 },
  { description: 'Cinta masking 1"', quantity: 6, unit: 'pza', price: 38 },
]
