'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME } from '@/lib/brand'
import { ALL_LINKS, MORE_LINKS, SITE_LINKS } from './links'
import s from './inicio.module.css'

/** Menú del sitio de presentación: enlace activo, y en celular un panel que se abre y cierra. */
export function SiteNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const isActive = (href: string) => (href === '/inicio' ? pathname === '/inicio' || pathname === '/' : pathname.startsWith(href))

  useEffect(() => { setOpen(false); setMore(false) }, [pathname])
  // "Más": se cierra con Escape o al tocar fuera
  useEffect(() => {
    if (!more) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false) }
    const onDown = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMore(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [more])
  const moreActive = MORE_LINKS.some(l => isActive(l.href))
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
          <div className={s.navMore} ref={moreRef}>
            <button type="button" className={moreActive ? s.navActive : undefined} aria-expanded={more} aria-controls="site-more" onClick={() => setMore(m => !m)}>
              Más <span aria-hidden="true">▾</span>
            </button>
            <div id="site-more" className={s.navMoreMenu} hidden={!more}>
              {MORE_LINKS.map(l => (
                <Link key={l.href} href={l.href} className={isActive(l.href) ? s.navActive : undefined} aria-current={isActive(l.href) ? 'page' : undefined}>{l.label}</Link>
              ))}
            </div>
          </div>
        </nav>
        <div className={s.navCta}>
          <Link href="/login" className={`${s.btn} ${s.btnGhost} ${s.hideSm}`}>Iniciar sesión</Link>
          <Link href="/registro" className={`${s.btn} ${s.btnPrimary}`}>
            <span className={s.hideXs}>Crear cuenta gratis</span><span className={s.showXs}>Crear cuenta</span>
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
          {ALL_LINKS.map(l => (
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
