'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME } from '@/lib/brand'
import { NAV, type NavEntry } from './links'
import s from './inicio.module.css'

const pathOf = (href: string) => href.split('#')[0]

/**
 * Menú del sitio de presentación. En computadora, "Producto" y "Para tu
 * tienda" abren un panel con sus páginas por categoría (al pasar el mouse o
 * al tocar; Escape o tocar fuera lo cierran). En celular, todo va en el panel
 * del botón de menú, agrupado igual.
 */
export function SiteNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)          // menú de celular
  const [menu, setMenu] = useState<string | null>(null)  // panel abierto en computadora
  const btnRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Si el mouse acaba de abrir el panel, el clic que sigue no debe cerrarlo
  const openedByHover = useRef(false)

  const isActive = (href: string) => {
    const p = pathOf(href)
    return p === '/inicio' ? pathname === '/inicio' || pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)
  }
  const entryActive = (e: NavEntry) => ('href' in e ? isActive(e.href) : e.groups.some(g => g.items.some(i => isActive(i.href))))

  useEffect(() => { setOpen(false); setMenu(null) }, [pathname])
  useEffect(() => {
    if (!open && !menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (open) { setOpen(false); btnRef.current?.focus() }
      setMenu(null)
    }
    const onDown = (e: MouseEvent) => { if (menu && !navRef.current?.contains(e.target as Node)) setMenu(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open, menu])

  // Al pasar el mouse (solo con mouse): abre al entrar y cierra con una pequeña espera al salir
  const hover = (label: string | null) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (label) { if (menu !== label) openedByHover.current = true; setMenu(label) }
    else closeTimer.current = setTimeout(() => { openedByHover.current = false; setMenu(null) }, 160)
  }

  return (
    <header className={`${s.nav} ${open ? s.navOpen : ''}`}>
      <div className={`${s.wrap} ${s.navInner}`}>
        <Link href="/inicio" className={s.navBrand} aria-label={`${APP_NAME}, inicio`}>
          <BrandLogo />
        </Link>
        <nav ref={navRef} className={s.navLinks} aria-label="Secciones del sitio" onPointerLeave={hover(null)}>
          {NAV.map(e => 'href' in e ? (
            <Link key={e.label} href={e.href} className={isActive(e.href) ? s.navActive : undefined} aria-current={isActive(e.href) ? 'page' : undefined} onPointerEnter={hover(null)}>
              {e.label}
            </Link>
          ) : (
            <div key={e.label} className={s.navMenu} onPointerEnter={hover(e.label)}>
              <button
                type="button" className={`${s.navMenuBtn} ${entryActive(e) ? s.navActive : ''}`}
                aria-expanded={menu === e.label} aria-controls={`menu-${e.label}`}
                onClick={() => {
                  if (openedByHover.current) { openedByHover.current = false; setMenu(e.label); return }
                  setMenu(m => (m === e.label ? null : e.label))
                }}
              >
                {e.label}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div id={`menu-${e.label}`} className={`${s.mega} ${e.groups.length === 1 ? s.megaOne : ''}`} hidden={menu !== e.label}>
                <div className={s.megaCols}>
                  {e.groups.map(g => (
                    <div key={g.title} className={s.megaCol}>
                      <p className={s.megaTitle}>{g.title}</p>
                      {g.items.map(i => (
                        <Link key={i.href} href={i.href} className={s.megaItem} aria-current={isActive(i.href) && !i.href.includes('#') ? 'page' : undefined}>
                          <span className={`${s.megaIcon} ${i.tone}`}><i.icon /></span>
                          <span><strong>{i.label}</strong><small>{i.desc}</small></span>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
                {e.footer && <Link href={e.footer.href} className={s.megaFoot}>{e.footer.label} <span aria-hidden="true">→</span></Link>}
              </div>
            </div>
          ))}
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
          <Link href="/inicio" className={isActive('/inicio') ? s.navActive : undefined}>Inicio</Link>
          {NAV.map(e => 'href' in e ? (
            <Link key={e.label} href={e.href} className={isActive(e.href) ? s.navActive : undefined} aria-current={isActive(e.href) ? 'page' : undefined}>{e.label}</Link>
          ) : (
            <div key={e.label} className={s.mobileGroup}>
              <p className={s.megaTitle}>{e.label}</p>
              {e.groups.flatMap(g => g.items).map(i => (
                <Link key={i.href} href={i.href} className={s.mobileItem}>
                  <span className={`${s.megaIcon} ${i.tone}`}><i.icon /></span>{i.label}
                </Link>
              ))}
            </div>
          ))}
          <Link href="/login" className={s.mobileLogin}>Iniciar sesión</Link>
        </div>
      </nav>
    </header>
  )
}
