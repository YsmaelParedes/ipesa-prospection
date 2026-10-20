import Link from 'next/link'
import { EMAILS } from '@/lib/legal'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { SiteNav } from './SiteNav'
import { SITE_LINKS } from './links'
import s from './inicio.module.css'

/* Sitio de presentación (público): menú y pie compartidos por todas sus páginas. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.lp}>
      <div className="brand-line" aria-hidden="true" />
      <a href="#contenido" className={s.skip}>Saltar al contenido</a>
      <SiteNav />
      <main id="contenido">{children}</main>
      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footGrid}`}>
          <div className={s.footBrand}>
            <BrandLogo className={s.footLogo} />
            <span>{APP_TAGLINE}.</span>
          </div>
          <nav className={s.footCol} aria-label="Sitio">
            <strong>Sitio</strong>
            {SITE_LINKS.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          </nav>
          <nav className={s.footCol} aria-label="Cuenta">
            <strong>Cuenta</strong>
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/registro">Crear cuenta gratis</Link>
          </nav>
          <nav className={s.footCol} aria-label="Contacto">
            <strong>Contacto</strong>
            <a href={`mailto:${EMAILS.hola}`}>{EMAILS.hola}</a>
            <a href={`mailto:${EMAILS.soporte}`}>{EMAILS.soporte}</a>
          </nav>
          <nav className={s.footCol} aria-label="Legal">
            <strong>Legal</strong>
            <Link href="/terminos">Términos</Link>
            <Link href="/privacidad">Aviso de privacidad</Link>
          </nav>
        </div>
        <div className={`${s.wrap} ${s.footBottom}`}>
          <small>© {new Date().getFullYear()} {APP_NAME}</small>
          <small>Hecho para tiendas de pintura en México</small>
        </div>
      </footer>
    </div>
  )
}
