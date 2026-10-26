import type { Metadata, Viewport } from 'next'
import { Manrope, Outfit } from 'next/font/google'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { SHARE_IMAGE, SITE_DESCRIPTION, SITE_URL } from '@/lib/site'
import './globals.css'

// Fuentes auto-hospedadas por Next (sin @import a Google Fonts que bloqueaba
// el primer render ni peticiones a terceros). Variables usadas en globals.css.
// Outfit: geométrica (títulos, cifras y el nombre en el logo)
const display = Outfit({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-outfit',
  display: 'swap',
})
const body = Manrope({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  // Con esto, las direcciones relativas (canonical, imágenes) salen completas
  metadataBase: new URL(SITE_URL),
  title: `${APP_NAME} · ${APP_TAGLINE}`,
  description: SITE_DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: { type: 'website', siteName: APP_NAME, locale: 'es_MX', title: `${APP_NAME} · ${APP_TAGLINE}`, description: SITE_DESCRIPTION, url: '/', images: [SHARE_IMAGE] },
  twitter: { card: 'summary_large_image', title: `${APP_NAME} · ${APP_TAGLINE}`, description: SITE_DESCRIPTION, images: [SHARE_IMAGE.url] },
  // Search Console: el código lo da Google al agregar el sitio (variable en Vercel, opcional)
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } } : {}),
  manifest: '/manifest.json',
  icons: { apple: { url: '/apple-touch-icon.png', sizes: '180x180' } },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  // Next ya emite mobile-web-app-capable; iOS < 16.4 necesita el prefijo apple-
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#E50A26',
  width: 'device-width',
  initialScale: 1,
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
