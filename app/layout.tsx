import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Manrope } from 'next/font/google'
import './globals.css'

// Fuentes auto-hospedadas por Next (sin @import a Google Fonts que bloqueaba
// el primer render ni peticiones a terceros). Variables usadas en globals.css.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  variable: '--font-bricolage',
  display: 'swap',
})
const body = Manrope({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'IPESA — CRM Pinturas',
  description: 'Sistema de gestión de contactos y leads — IPESA Pinturas Lomas de Angelópolis',
  manifest: '/manifest.json',
  icons: { apple: { url: '/apple-touch-icon.png', sizes: '180x180' } },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'IPESA CRM',
  },
  // Next ya emite mobile-web-app-capable; iOS < 16.4 necesita el prefijo apple-
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#EE5A24',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Permite usar env(safe-area-inset-*) en la barra inferior del iPhone
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
