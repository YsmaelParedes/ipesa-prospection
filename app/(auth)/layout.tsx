import Link from 'next/link'
import { BrandLogo } from '@/components/Brand'

/**
 * Pantallas de acceso: panel de marca (escritorio) + formulario.
 * Un remolino de manchas de pintura con la paleta de la app es el arte del panel.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="brand-line" aria-hidden="true" />
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-swirl">
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
          <span className="blob b4" /><span className="blob b5" />
        </div>
        <div className="auth-art-inner">
          <Link href="/inicio" className="auth-art-logo" tabIndex={-1}>
            <BrandLogo />
          </Link>
          <div className="auth-art-copy">
            <h2>El CRM hecho para tiendas <span className="spectrum-text">de pintura</span></h2>
            <p>Contactos, ventas, WhatsApp y fórmulas de color en un solo lugar. La información de cada tienda, separada y protegida.</p>
            <ul className="auth-art-list">
              <li><span className="dot d1" />Bandeja de WhatsApp ligada a cada cliente</li>
              <li><span className="dot d2" />Pipeline de ventas, cotizaciones y recordatorios</li>
              <li><span className="dot d3" />Fórmulas de color convertidas a mL</li>
            </ul>
          </div>
          <div className="auth-art-foot">Prueba gratis 14 días · Sin tarjeta</div>
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
