import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === 'development'

// React dev mode requires 'unsafe-eval' for error overlays and call-stack reconstruction.
// In production it is never needed — kept strict there.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net"
  : "script-src 'self' 'unsafe-inline' https://connect.facebook.net"

const securityHeaders = [
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'X-XSS-Protection',        value: '0' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control',  value: 'off' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.facebook.com https://*.facebook.net",
      "img-src 'self' data: blob: https://*.facebook.com https://*.facebook.net https://*.fbcdn.net",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-src https://*.facebook.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // Remove the X-Powered-By: Next.js header to reduce fingerprinting surface
  poweredByHeader: false,
  allowedDevOrigins: ['169.254.50.114'],

  // Librerías solo de servidor — no intentar incluirlas en el bundle del cliente
  serverExternalPackages: ['web-push', 'sharp'],

  // Tree-shake Supabase — importa solo los módulos usados
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr'],
  },

  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig;
