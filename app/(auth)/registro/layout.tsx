import type { Metadata } from 'next'
import { APP_NAME } from '@/lib/brand'
import { pageMeta } from '@/lib/site'

// La página es de cliente (formulario): los metadatos viven en su layout
export const metadata: Metadata = {
  ...pageMeta({
    title: `Crear cuenta gratis · ${APP_NAME}`,
    description: 'Crea tu cuenta gratis en Matices, el CRM para tiendas de pintura: contactos, cotizaciones y agenda desde el primer día. Sin tarjeta.',
    path: '/registro',
  }),
  robots: { index: true, follow: true },
}

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return children
}
