import Link from 'next/link'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME } from '@/lib/brand'
import s from './legal.module.css'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.page}>
      <div className="brand-line" aria-hidden="true" />
      <header className={s.top}>
        <div className={s.topInner}>
          <Link href="/inicio" className={s.brand} aria-label={`${APP_NAME}, inicio`}>
            <BrandLogo />
          </Link>
          <nav className={s.topNav} aria-label="Documentos legales">
            <Link href="/terminos">Términos</Link>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/login" className={s.topCta}>Entrar</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className={s.footer}>
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <nav aria-label="Enlaces">
          <Link href="/inicio">Inicio</Link>
          <Link href="/terminos">Términos de uso</Link>
          <Link href="/privacidad">Aviso de privacidad</Link>
        </nav>
      </footer>
    </div>
  )
}
