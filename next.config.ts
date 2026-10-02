import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === 'development'

// React en desarrollo necesita 'unsafe-eval' (overlay de errores); en
// producción nunca, así que ahí la política es estricta.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'"

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  // Imágenes de encabezado de plantillas guardadas en Supabase Storage
  "img-src 'self' data: blob: https://*.supabase.co",
  // Audio/video de WhatsApp: llegan por el proxy autenticado /api/whatsapp/media
  "media-src 'self' blob:",
  // Fuentes auto-hospedadas por next/font
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'X-XSS-Protection',        value: '0' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control',  value: 'off' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: csp },
]

const nextConfig: NextConfig = {
  // Remove the X-Powered-By: Next.js header to reduce fingerprinting surface
  poweredByHeader: false,
  allowedDevOrigins: ['169.254.50.114'],

  // Librerías solo de servidor — no intentar incluirlas en el bundle del cliente
  serverExternalPackages: ['web-push'],

  // Tree-shake Supabase — importa solo los módulos usados
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr'],
  },

  turbopack: {
    root: path.resolve(__dirname),
  },

  // Única fuente de verdad de las cabeceras (antes se duplicaban en
  // vercel.json y dos CSP distintas se aplicaban a la vez).
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/ipesa-logo.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
    ]
  },
}

export default nextConfig;
