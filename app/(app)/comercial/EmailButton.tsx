'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '@/lib/profile'
import s from './comercial.module.css'

// Sin espacios ni caracteres que rompan el enlace (?, &, #, comas): uno solo
const EMAIL_RE = /^[^\s@?&#,;<>"]+@[^\s@?&#,;<>"]+\.[^\s@?&#,;<>"]+$/

/** Asunto del correo nuevo: «Tienda · Cliente». */
const mailSubject = (store: string | null | undefined, client: string) => [store?.trim(), client].filter(Boolean).join(' · ')

/** El correo del contacto si sirve para abrir un correo nuevo; si no, ''. */
function emailOf(raw: string | null | undefined): string {
  const e = (raw ?? '').trim()
  return EMAIL_RE.test(e) ? e : ''
}

const enc = encodeURIComponent
/**
 * Con qué se abre el correo. «Outlook u otro programa» es el programa de correo
 * predeterminado de la computadora (Outlook de escritorio, Mail de la Mac…):
 * sirve para cuentas de la tienda en cualquier proveedor, como IONOS o GoDaddy.
 */
const OPTIONS = [
  { key: 'app', label: 'Outlook u otro programa', sub: 'El programa de correo de esta computadora', badge: '@', cls: s.mailApp,
    href: (to: string, su: string) => `mailto:${to}?subject=${enc(su)}` },
  { key: 'gmail', label: 'Gmail', sub: 'En el navegador', badge: 'G', cls: s.mailG,
    href: (to: string, su: string) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(su)}` },
  { key: 'outlook', label: 'Outlook.com o Hotmail', sub: 'Cuenta personal, en el navegador', badge: 'O', cls: s.mailO,
    href: (to: string, su: string) => `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to)}&subject=${enc(su)}` },
  { key: 'office', label: 'Outlook de Microsoft 365', sub: 'Cuenta de empresa, en el navegador', badge: 'O', cls: s.mailO,
    href: (to: string, su: string) => `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(su)}` },
] as const
type OptionKey = typeof OPTIONS[number]['key']

/** La opción que eligió esta persona en esta computadora (se abre directo la próxima vez). */
const PREF_KEY = (uid: string) => `matices:correo:${uid}`
function readPref(uid: string | undefined): OptionKey | null {
  if (!uid) return null
  try {
    const v = localStorage.getItem(PREF_KEY(uid))
    return OPTIONS.some(o => o.key === v) ? (v as OptionKey) : null
  } catch { return null }
}
function savePref(uid: string | undefined, key: OptionKey) {
  if (!uid) return
  try { localStorage.setItem(PREF_KEY(uid), key) } catch { /* sin almacenamiento: se vuelve a preguntar */ }
}
function openOption(key: OptionKey, href: string) {
  if (key === 'app') window.location.href = href
  else window.open(href, '_blank', 'noopener,noreferrer')
}

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
 * Botón «Correo», el único para todo el Sistema Comercial: abre un correo nuevo
 * con el asunto puesto, desde la cuenta del propio vendedor (Matices no envía
 * nada). Si el contacto tiene un correo válido ya va como destinatario; si no,
 * el vendedor lo escribe. En el celular abre su app de correo; en computadora
 * deja elegir el programa de correo, Gmail u Outlook en el navegador. La
 * elección se recuerda por persona y computadora: la próxima vez abre directo
 * y un aviso breve deja cambiarla. Al abrir, onOpen() deja la ficha lista
 * para registrar el correo.
 */
export function EmailButton({ email: raw, store, client, className, label, children, onOpen }: {
  /** El correo del contacto tal como está guardado (puede faltar o venir mal). */
  email: string | null | undefined
  /** Nombre de la tienda y del cliente, para el asunto. */
  store: string | null | undefined
  client: string
  className: string
  /** Para lectores de pantalla, ej. "Correo a Ferretería 33". */
  label?: string
  children: ReactNode
  onOpen: () => void
}) {
  const email = emailOf(raw)
  const subject = mailSubject(store, client)
  const desktop = useDesktopPointer()
  const uid = useSession()?.user.id
  const [open, setOpen] = useState(false)
  // Después de abrir directo con la opción guardada: «Se abrió con … · Cambiar»
  const [notice, setNotice] = useState<OptionKey | null>(null)
  const [shown, setShown] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = (focus = false) => {
    setOpen(false); setShown(false)
    if (focus) btnRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  function press() {
    if (open) { close(); return }
    const pref = readPref(uid)
    if (!pref) { setOpen(true); return }
    const o = OPTIONS.find(x => x.key === pref)!
    openOption(o.key, o.href(email, subject))
    setNotice(o.key)
    onOpen()
  }

  useEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const W = 240, M = 8, H = email ? 330 : 354
      const left = Math.min(Math.max(M, r.left + r.width / 2 - W / 2), window.innerWidth - W - M)
      const below = r.bottom + 6
      setPos({ top: below + H > window.innerHeight ? Math.max(M, r.top - 6 - H) : below, left })
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
  }, [open, email])

  if (!desktop) {
    return (
      <a href={OPTIONS[0].href(email, subject)} className={className} aria-label={label}
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
        onClick={e => { e.stopPropagation(); press() }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}>
        {children}
      </button>
      {notice && !open && btnRef.current && createPortal(
        <div className={s.mailNotice} role="status" onClick={e => e.stopPropagation()}
          style={{ top: btnRef.current.getBoundingClientRect().bottom + 6, left: Math.max(8, btnRef.current.getBoundingClientRect().left) }}>
          Se abrió con {OPTIONS.find(o => o.key === notice)?.label}.
          <button type="button" onClick={() => { setNotice(null); setOpen(true) }}>Cambiar</button>
        </div>,
        document.body,
      )}
      {open && pos && createPortal(
        <div ref={menuRef} role="menu" aria-label="Abrir el correo con" className={`${s.mailMenu} ${shown ? s.mailMenuShown : ''}`}
          style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey} onClick={e => e.stopPropagation()}>
          <p className={s.mailMenuHead}>Abrir con</p>
          {!email && <p className={s.mailMenuNote}>Sin correo guardado: lo escribes al abrir.</p>}
          {OPTIONS.map(o => (
            <a key={o.key} role="menuitem" href={o.href(email, subject)} className={`${s.mailOpt} ${s.press}`}
              {...(o.key === 'app' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              onClick={() => { savePref(uid, o.key); close(); onOpen() }}>
              <span className={`${s.mailBadge} ${o.cls}`} aria-hidden="true">{o.badge}</span>
              <span><b>{o.label}</b><small>{o.sub}</small></span>
            </a>
          ))}
          <p className={s.mailMenuFoot}>
            La próxima vez se abre directo con la que elijas. ¿Usas Outlook en la computadora? Ponlo como tu programa de correo
            predeterminado (en Windows: Configuración › Aplicaciones › Aplicaciones predeterminadas).
          </p>
        </div>,
        document.body,
      )}
    </>
  )
}
