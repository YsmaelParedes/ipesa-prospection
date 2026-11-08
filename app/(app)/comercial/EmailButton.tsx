'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import s from './comercial.module.css'

// Sin espacios ni caracteres que rompan el enlace (?, &, #, comas): uno solo
const EMAIL_RE = /^[^\s@?&#,;<>"]+@[^\s@?&#,;<>"]+\.[^\s@?&#,;<>"]+$/

/** Asunto del correo nuevo: «Tienda · Cliente». */
export const mailSubject = (store: string | null | undefined, client: string) => [store?.trim(), client].filter(Boolean).join(' · ')

/** El correo del contacto si sirve para abrir un correo nuevo; si no, ''. */
export function emailOf(raw: string | null | undefined): string {
  const e = (raw ?? '').trim()
  return EMAIL_RE.test(e) ? e : ''
}

const enc = encodeURIComponent
const OPTIONS = [
  { key: 'gmail', label: 'Gmail', sub: 'Pestaña nueva', badge: 'G', cls: s.mailG,
    href: (to: string, su: string) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(su)}` },
  { key: 'outlook', label: 'Outlook o Hotmail', sub: 'Pestaña nueva', badge: 'O', cls: s.mailO,
    href: (to: string, su: string) => `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to)}&subject=${enc(su)}` },
  { key: 'app', label: 'App de correo', sub: 'La de esta computadora', badge: '@', cls: s.mailApp,
    href: (to: string, su: string) => `mailto:${to}?subject=${enc(su)}` },
] as const

/** Computadora con mouse: ahí no siempre hay una app de correo configurada. */
function useDesktopPointer(): boolean {
  const [fine, setFine] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setFine(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return fine
}

/**
 * Botón «Correo»: abre un correo nuevo al contacto con el asunto puesto, desde
 * la cuenta del propio vendedor (Matices no envía nada). En el celular abre su
 * app de correo; en computadora deja elegir Gmail, Outlook o la app. Al
 * elegir, onOpen() deja la ficha lista para registrar el correo.
 */
export function EmailButton({ email, subject, className, label, children, onOpen }: {
  email: string
  subject: string
  className: string
  /** Para lectores de pantalla, ej. "Correo a Ferretería 33". */
  label?: string
  children: ReactNode
  onOpen: () => void
}) {
  const desktop = useDesktopPointer()
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = (focus = false) => {
    setOpen(false); setShown(false)
    if (focus) btnRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const W = 240, M = 8
      const left = Math.min(Math.max(M, r.left + r.width / 2 - W / 2), window.innerWidth - W - M)
      const below = r.bottom + 6
      setPos({ top: below + 190 > window.innerHeight ? Math.max(M, r.top - 6 - 190) : below, left })
    }
    const t = setTimeout(() => { setShown(true); menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true }) }, 0)
    const outside = (e: PointerEvent) => {
      const n = e.target as Node
      if (!menuRef.current?.contains(n) && !btnRef.current?.contains(n)) close()
    }
    const away = () => close()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', away)
    window.addEventListener('scroll', away, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', away)
      window.removeEventListener('scroll', away, true)
    }
  }, [open])

  if (!desktop) {
    return (
      <a href={OPTIONS[2].href(email, subject)} className={className} aria-label={label}
        onClick={e => { e.stopPropagation(); onOpen() }}>{children}</a>
    )
  }

  const onMenuKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Tab') close()
  }

  return (
    <>
      <button ref={btnRef} type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={e => { e.stopPropagation(); if (open) close(); else setOpen(true) }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}>
        {children}
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} role="menu" aria-label="Abrir el correo con" className={`${s.mailMenu} ${shown ? s.mailMenuShown : ''}`}
          style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey} onClick={e => e.stopPropagation()}>
          <p className={s.mailMenuHead}>Abrir con</p>
          {OPTIONS.map(o => (
            <a key={o.key} role="menuitem" href={o.href(email, subject)} className={`${s.mailOpt} ${s.press}`}
              {...(o.key === 'app' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              onClick={() => { close(); onOpen() }}>
              <span className={`${s.mailBadge} ${o.cls}`} aria-hidden="true">{o.badge}</span>
              <span><b>{o.label}</b><small>{o.sub}</small></span>
            </a>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
