'use client'

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { windowClosesAt } from '@/lib/whatsappSafety'

/* ── Iconos ─────────────────────────────────────────────────────────────── */
type IP = { size?: number; className?: string; style?: React.CSSProperties }
const svg = (size: number, children: ReactNode, extra?: IP) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    width={size} height={size} className={extra?.className} style={extra?.style} aria-hidden="true">{children}</svg>
)

export const WaIcon = {
  send:     (p: IP = {}) => svg(p.size ?? 18, <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>, p),
  back:     (p: IP = {}) => svg(p.size ?? 20, <path d="m15 18-6-6 6-6"/>, p),
  info:     (p: IP = {}) => svg(p.size ?? 18, <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>, p),
  search:   (p: IP = {}) => svg(p.size ?? 15, <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>, p),
  plus:     (p: IP = {}) => svg(p.size ?? 16, <path d="M12 5v14M5 12h14"/>, p),
  bolt:     (p: IP = {}) => svg(p.size ?? 18, <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>, p),
  template: (p: IP = {}) => svg(p.size ?? 16, <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></>, p),
  phone:    (p: IP = {}) => svg(p.size ?? 15, <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>, p),
  user:     (p: IP = {}) => svg(p.size ?? 15, <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>, p),
  userPlus: (p: IP = {}) => svg(p.size ?? 15, <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></>, p),
  leads:    (p: IP = {}) => svg(p.size ?? 15, <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>, p),
  bell:     (p: IP = {}) => svg(p.size ?? 15, <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>, p),
  close:    (p: IP = {}) => svg(p.size ?? 18, <path d="M18 6 6 18M6 6l12 12"/>, p),
  clock:    (p: IP = {}) => svg(p.size ?? 13, <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, p),
  alert:    (p: IP = {}) => svg(p.size ?? 14, <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>, p),
  check:    (p: IP = {}) => svg(p.size ?? 14, <path d="m5 13 4 4L19 7"/>, p),
  file:     (p: IP = {}) => svg(p.size ?? 16, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>, p),
  megaphone:(p: IP = {}) => svg(p.size ?? 16, <><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></>, p),
  chart:    (p: IP = {}) => svg(p.size ?? 16, <><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></>, p),
  chat:     (p: IP = {}) => svg(p.size ?? 16, <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>, p),
  ban:      (p: IP = {}) => svg(p.size ?? 14, <><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></>, p),
  external: (p: IP = {}) => svg(p.size ?? 13, <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></>, p),
  whatsapp: (p: IP = {}) => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={p.size ?? 16} height={p.size ?? 16} className={p.className} style={p.style} aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>
  ),
}

/* ── Palomitas de estado ───────────────────────────────────────────────── */
export function StatusTicks({ status }: { status: string }) {
  if (status === 'pending') return <span className="wa-tick" title="Enviando…"><WaIcon.clock size={12} /></span>
  if (status === 'failed')  return <span className="wa-tick failed" title="No se entregó"><WaIcon.alert size={13} /></span>
  const double = status === 'delivered' || status === 'read'
  return (
    <span className={`wa-tick ${status === 'read' ? 'read' : ''}`}
      title={status === 'read' ? 'Leído' : status === 'delivered' ? 'Entregado' : 'Enviado'}>
      <svg viewBox="0 0 18 12" width={16} height={11} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={double ? 'M1 6.5 4.5 10 11 2.5' : 'M4 6.5 7.5 10 14 2.5'} />
        {double && <path d="m7.5 10 1 .9L16 2.5" />}
      </svg>
    </span>
  )
}

/* ── Ventana de 24 h ───────────────────────────────────────────────────── */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function WindowBadge({ lastInboundAt }: { lastInboundAt: string | null }) {
  const now = useNow()
  const closes = windowClosesAt(lastInboundAt)
  if (!closes || closes <= now) {
    return <span className="wa-window closed" title="Pasaron más de 24 h desde el último mensaje del cliente: solo se pueden enviar plantillas">Ventana cerrada</span>
  }
  const mins = Math.max(1, Math.round((closes - now) / 60_000))
  const left = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim() : `${mins} min`
  return <span className="wa-window open" title="Puedes responder con texto libre mientras la ventana esté abierta"><span className="wa-dot" />Ventana abierta · {left}</span>
}

/* ── Fechas ─────────────────────────────────────────────────────────────── */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const pad = (n: number) => String(n).padStart(2, '0')

export function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Hora si es hoy; "Ayer"; día y mes si es de este año. */
export function fmtListWhen(iso: string) {
  const d = new Date(iso), now = new Date()
  if (d.toDateString() === now.toDateString()) return fmtTime(iso)
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Ayer'
  return d.getFullYear() === now.getFullYear() ? `${d.getDate()} ${MESES[d.getMonth()]}` : `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
}

export function fmtDayLabel(iso: string) {
  const d = new Date(iso), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Hoy'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Ayer'
  return `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`
}

/* ── Texto con enlaces ─────────────────────────────────────────────────── */
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) => i % 2 === 1
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="wa-link">{part}</a>
        : <Fragment key={i}>{part}</Fragment>)}
    </>
  )
}

/* ── Multimedia entrante (servida por el proxy autenticado) ─────────────── */
export function MediaContent({ mediaId, mediaType, mime }: { mediaId: string; mediaType: string; mime?: string | null }) {
  const src = `/api/whatsapp/media/${mediaId}`
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="wa-media-missing"><WaIcon.alert size={13} /> El archivo ya no está disponible en WhatsApp</div>
  switch (mediaType) {
    case 'image':
      return (
        <a href={src} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Imagen recibida" className="wa-media-img" loading="lazy" onError={() => setFailed(true)} />
        </a>
      )
    case 'sticker':
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt="Sticker" className="wa-media-sticker" loading="lazy" onError={() => setFailed(true)} />
    case 'audio':
      return <audio controls preload="none" src={src} className="wa-media-audio" onError={() => setFailed(true)} />
    case 'video':
      return <video controls preload="none" src={src} className="wa-media-video" onError={() => setFailed(true)} />
    default:
      return (
        <a href={src} target="_blank" rel="noopener noreferrer" className="wa-media-doc">
          <WaIcon.file /> <span>{mime === 'application/pdf' ? 'Ver PDF' : 'Descargar archivo'}</span>
        </a>
      )
  }
}

/** Para mensajes con multimedia el texto guardado es "📷 Imagen · pie de foto": solo se muestra el pie. */
export function mediaCaption(body: string | null): string {
  if (!body) return ''
  const i = body.indexOf(' · ')
  return i >= 0 ? body.slice(i + 3) : ''
}
