'use client'

import { useCallback, useRef, useState } from 'react'
import s from './configuracion.module.css'

/* Piezas compartidas por las secciones de Configuración */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** fetch que lanza Error con el mensaje de la API. */
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Algo salió mal. Intenta de nuevo.')
  return data as T
}
export const send = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

type IconProps = React.SVGProps<SVGSVGElement>
const icon = (d: React.ReactNode) => function Svg(p: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
}
export const Ico = {
  store:    icon(<><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9Z" /><path d="M5 13v7h14v-7" /></>),
  grid:     icon(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  tag:      icon(<><path d="M12 2H2v10l10 10 10-10L12 2Z" /><circle cx="7" cy="7" r="1.2" /></>),
  channel:  icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  users:    icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  userPlus: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
  card:     icon(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>),
  user:     icon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  image:    icon(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>),
  upload:   icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>),
  trash:    icon(<path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />),
  plus:     icon(<path d="M12 5v14M5 12h14" />),
  check:    icon(<path d="m5 13 4 4L19 7" />),
  copy:     icon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  link:     icon(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>),
  info:     icon(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>),
  alert:    icon(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>),
  lock:     icon(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  megaphone: icon(<><path d="m3 11 18-5v12L3 14v-3Z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>),
  flask:    icon(<><path d="M9 2v6.3a2 2 0 0 1-.3 1L3.5 18a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3l-5.2-8.7a2 2 0 0 1-.3-1V2" /><path d="M7 2h10M6 14h12" /></>),
  bolt:     icon(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />),
  send:     icon(<><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>),
  logout:   icon(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />),
  mail:     icon(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>),
  shield:   icon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />),
}
export function WhatsAppGlyph(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z" />
    </svg>
  )
}

export function Panel({ icon: I, tone, title, subtitle, actions, children }: {
  icon?: (p: IconProps) => React.ReactElement
  tone?: 'tWa' | 'tCyan' | 'tMagenta' | 'tTeal' | 'tAmber' | 'tInk'
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={s.panel}>
      <header className={s.panelHead}>
        {I && <span className={cx(s.panelIcon, tone && s[tone])}><I /></span>}
        <div className={s.panelTitle}>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className={s.panelActions}>{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function Note({ kind = 'plain', children }: { kind?: 'plain' | 'info' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  const I = kind === 'warn' || kind === 'danger' ? Ico.alert : kind === 'ok' ? Ico.check : Ico.info
  const cls = { plain: '', info: s.noteInfo, warn: s.noteWarn, danger: s.noteDanger, ok: s.noteOk }[kind]
  return <div className={cx(s.note, cls)} role={kind === 'danger' ? 'alert' : undefined}><I /><div>{children}</div></div>
}

export function Spinner() {
  return <div className={s.spin} role="status" aria-label="Cargando"><span /></div>
}

/** Aviso flotante breve (usa .toast-fixed del sistema de diseño). */
export function useToast() {
  const [msg, setMsg] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((text: string) => {
    setMsg(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 2400)
  }, [])
  const node = msg ? <div className="toast-fixed" role="status"><Ico.check style={{ width: 15, height: 15, color: 'var(--success-fill)' }} />{msg}</div> : null
  return [node, show] as const
}

/** Copiar al portapapeles con respaldo para navegadores sin permiso. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    window.prompt('Copia el texto:', text)
    return false
  }
}

export const AVATAR_TONES = [
  { bg: 'var(--brand-soft)', fg: 'var(--brand-strong)' },
  { bg: 'var(--c-cyan-soft)', fg: 'var(--c-cyan-ink)' },
  { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  { bg: 'var(--c-magenta-soft)', fg: 'var(--c-magenta-ink)' },
  { bg: 'var(--c-teal-soft)', fg: 'var(--c-teal-ink)' },
  { bg: 'var(--success-soft)', fg: 'var(--success)' },
]
export function avatarTone(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}
export function initialsOf(text: string) {
  const parts = text.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return (parts.slice(0, 2).map(p => Array.from(p)[0]).join('') || '?').toUpperCase()
}

export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', opts) : '—'
