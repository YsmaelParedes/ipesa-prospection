'use client'

import { apiFetch } from '@/lib/apiClient'


import { useCallback, useRef, useState } from 'react'
import s from './configuracion.module.css'
import { WhatsAppIcon } from '@/components/icons'
import {
  Store, LayoutGrid, MapPin, Tag, Activity, Users, UserPlus, CreditCard, User, Image as ImageIcon, Upload, Download,
  Trash2, Plus, Check, Copy, Link as LinkIcon, Info, TriangleAlert, Lock, Megaphone, FlaskConical, Zap, Send, LogOut,
  Mail, Bell, Shield,
} from 'lucide-react'

/* Piezas compartidas por las secciones de Configuración */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** fetch que lanza Error con el mensaje de la API. */
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Algo salió mal. Intenta de nuevo.')
  return data as T
}
export const send = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

type IconProps = { className?: string; style?: React.CSSProperties }
/* Iconos de Lucide (mismos nombres de siempre para no tocar cada pantalla) */
export const Ico = {
  store: Store, grid: LayoutGrid, pin: MapPin, tag: Tag, channel: Activity, users: Users, userPlus: UserPlus,
  card: CreditCard, user: User, image: ImageIcon, upload: Upload, download: Download, trash: Trash2, plus: Plus,
  check: Check, copy: Copy, link: LinkIcon, info: Info, alert: TriangleAlert, lock: Lock, megaphone: Megaphone,
  flask: FlaskConical, bolt: Zap, send: Send, logout: LogOut, mail: Mail, bell: Bell, shield: Shield,
}
export function WhatsAppGlyph(p: IconProps) {
  return <WhatsAppIcon className={p.className} style={p.style} />
}

/* Ajustes en filas: a la izquierda qué es, a la derecha el control. Todas las secciones usan estas piezas. */

export function SectionHead({ title, description }: { title: string; description: string }) {
  return (
    <header className={s.sectionHead}>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  )
}

/** Tarjeta de ajustes. Con título lleva su propio encabezado; sin título, solo agrupa filas. */
export function Card({ title, description, actions, children, as: As = 'section', onSubmit }: {
  title?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  as?: 'section' | 'form'
  onSubmit?: (e: React.FormEvent) => void
}) {
  return (
    <As className={s.card} onSubmit={onSubmit}>
      {title && (
        <header className={s.cardHead}>
          <div className={s.cardTitle}>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className={s.cardActions}>{actions}</div>}
        </header>
      )}
      {children}
    </As>
  )
}

export function Row({ label, hint, htmlFor, children, align }: {
  label: string
  hint?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
  align?: 'center'
}) {
  return (
    <div className={cx(s.setRow, align === 'center' && s.setRowCenter)}>
      <div className={s.setLabel}>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <strong>{label}</strong>}
        {hint && <p>{hint}</p>}
      </div>
      <div className={s.setControl}>{children}</div>
    </div>
  )
}

/** Pie de la tarjeta: estado a la izquierda y el botón principal siempre abajo a la derecha. */
export function CardFoot({ status, children }: { status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={s.cardFoot}>
      {status && <small>{status}</small>}
      {children}
    </div>
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
