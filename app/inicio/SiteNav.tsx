'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME } from '@/lib/brand'
import { SITE_LINKS } from './links'
import s from './inicio.module.css'

/** Menú del sitio de presentación: enlace activo, y en celular un panel que se abre y cierra. */
export function SiteNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const isActive = (href: string) => (href === '/inicio' ? pathname === '/inicio' || pathname === '/' : pathname.startsWith(href))

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className={`${s.nav} ${open ? s.navOpen : ''}`}>
      <div className={`${s.wrap} ${s.navInner}`}>
        <Link href="/inicio" className={s.navBrand} aria-label={`${APP_NAME}, inicio`}>
          <BrandLogo />
        </Link>
        <nav className={s.navLinks} aria-label="Secciones del sitio">
          {SITE_LINKS.map(l => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? s.navActive : undefined} aria-current={isActive(l.href) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={s.navCta}>
          <Link href="/login" className={`${s.btn} ${s.btnGhost} ${s.hideSm}`}>Iniciar sesión</Link>
          <Link href="/registro" className={`${s.btn} ${s.btnPrimary}`}>
            <span className={s.hideXs}>Pide una invitación</span><span className={s.showXs}>Invitación</span>
          </Link>
          <button
            ref={btnRef}
            type="button"
            className={s.menuBtn}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setOpen(o => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
      <nav id="site-menu" className={s.mobileMenu} aria-label="Secciones del sitio" hidden={!open}>
        <div className={s.wrap}>
          {SITE_LINKS.map(l => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? s.navActive : undefined} aria-current={isActive(l.href) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
          <Link href="/login" className={s.mobileLogin}>Iniciar sesión</Link>
        </div>
      </nav>
    </header>
  )
}
