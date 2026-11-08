import type { Metadata } from 'next'
import Link from 'next/link'
import { NO_INDEX } from '@/lib/site'
import { BrandLogo } from '@/components/Brand'

// Solo /registro sale en Google (su layout lo vuelve a abrir); el resto es de cada persona
export const metadata: Metadata = NO_INDEX

/** Las muestras del abanico: color, nombre y clave como en una carta de colores. */
const SWATCHES = [
  { color: '#E2E415', name: 'Amarillo Mostrador', code: 'MT-104', angle: -52 },
  { color: '#4EC39C', name: 'Verde Fachada', code: 'MT-221', angle: -30 },
  { color: '#00BBD9', name: 'Turquesa Alberca', code: 'MT-318', angle: -9 },
  { color: '#E51585', name: 'Magenta Taller', code: 'MT-407', angle: 12 },
  { color: '#FD0B2B', name: 'Rojo Matices', code: 'MT-001', angle: 33 },
]

/**
 * Pantallas de acceso: el arte es una carta de colores abierta en abanico
 * (en celular, una franja arriba) y el formulario va en una tarjeta.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="brand-line" aria-hidden="true" />
      <aside className="auth-art">
        <Link href="/inicio" className="auth-art-logo" aria-label="Matices, ir al sitio">
          <BrandLogo />
        </Link>
        <p className="auth-art-title">
          Cada cliente, en su lugar. <span>Como tu carta de colores.</span>
        </p>
        <div className="auth-fan" aria-hidden="true">
          {SWATCHES.map(s => (
            <div key={s.code} className="auth-chip" style={{ '--r': `${s.angle}deg` } as React.CSSProperties}>
              <div className="auth-chip-color" style={{ background: s.color }} />
              <div className="auth-chip-label"><b>{s.name}</b><span>{s.code}</span></div>
            </div>
          ))}
          <div className="auth-fan-pin" />
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">{children}</div>
        <nav className="auth-legal">
          <Link href="/terminos">Términos</Link>
          <span>·</span>
          <Link href="/privacidad">Aviso de privacidad</Link>
        </nav>
      </main>
    </div>
  )
}
