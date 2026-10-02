import Link from 'next/link'
import s from './legal.module.css'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.page}>
      <div className="brand-line" aria-hidden="true" />
      <header className={s.top}>
        <div className={s.topInner}>
          <Link href="/inicio" className={s.brand} aria-label="IPESA CRM, inicio">
            <img src="/ipesa-logo.png" alt="IPESA Pinturas" width={480} height={209} />
            <span>CRM</span>
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
        <span>© {new Date().getFullYear()} IPESA CRM</span>
        <nav aria-label="Enlaces">
          <Link href="/inicio">Inicio</Link>
          <Link href="/terminos">Términos de uso</Link>
          <Link href="/privacidad">Aviso de privacidad</Link>
        </nav>
      </footer>
    </div>
  )
}
