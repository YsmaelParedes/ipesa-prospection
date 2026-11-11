'use client'

import { Fragment, useEffect, useState } from 'react'
import { windowClosesAt } from '@/lib/whatsappSafety'
import { splitMessagePrefix, type MessageKind } from '@/lib/messagePrefix'
import { WhatsAppIcon } from '@/components/icons'
import {
  Send, ChevronLeft, Info, Search, Plus, Paperclip, Zap, LayoutTemplate, Phone, User, UserPlus, Activity, Bell, X,
  Clock, TriangleAlert, Check, CheckCheck, File, Megaphone, ChartLine, MessageCircle, Ban, ExternalLink,
  Image, Mic, Video, FileText, Sticker, CornerDownRight, MapPin, UserRound, Hand, type LucideIcon,
} from 'lucide-react'

/* ── Iconos (Lucide + logo de WhatsApp) ─────────────────────────────────── */
type IP = { size?: number; className?: string; style?: React.CSSProperties }
const lu = (Icon: LucideIcon, size: number) => function WaLucide(p: IP = {}) {
  return <Icon size={p.size ?? size} className={p.className} style={p.style} aria-hidden="true" />
}

export const WaIcon = {
  send:      lu(Send, 18),
  back:      lu(ChevronLeft, 20),
  info:      lu(Info, 18),
  search:    lu(Search, 15),
  plus:      lu(Plus, 16),
  clip:      lu(Paperclip, 18),
  bolt:      lu(Zap, 18),
  template:  lu(LayoutTemplate, 16),
  phone:     lu(Phone, 15),
  user:      lu(User, 15),
  userPlus:  lu(UserPlus, 15),
  leads:     lu(Activity, 15),
  bell:      lu(Bell, 15),
  close:     lu(X, 18),
  clock:     lu(Clock, 13),
  alert:     lu(TriangleAlert, 14),
  check:     lu(Check, 14),
  file:      lu(File, 16),
  megaphone: lu(Megaphone, 16),
  chart:     lu(ChartLine, 16),
  chat:      lu(MessageCircle, 16),
  ban:       lu(Ban, 14),
  external:  lu(ExternalLink, 13),
  whatsapp:  (p: IP = {}) => <WhatsAppIcon size={p.size ?? 16} className={p.className} style={p.style} />,
}

/** Icono para cada marca guardada al inicio de un mensaje (ver lib/messagePrefix). */
const KIND_ICONS: Record<MessageKind, LucideIcon> = {
  image: Image, audio: Mic, video: Video, document: FileText, sticker: Sticker, reply: CornerDownRight,
  location: MapPin, contact: UserRound, template: LayoutTemplate, file: Paperclip, handoff: Hand, message: MessageCircle,
}

/** Texto de un mensaje con la marca del inicio de cada renglón cambiada por su icono. */
export function MessageText({ text, links = false }: { text: string; links?: boolean }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        const { kind, text: rest } = splitMessagePrefix(line)
        const Icon = kind ? KIND_ICONS[kind] : null
        return (
          <Fragment key={i}>
            {i > 0 && '\n'}
            {Icon && <Icon className="i-inline" style={{ marginRight: 4, opacity: 0.75 }} aria-hidden="true" />}
            {links ? <Linkified text={rest} /> : rest}
          </Fragment>
        )
      })}
    </>
  )
}

/* ── Palomitas de estado ───────────────────────────────────────────────── */
export function StatusTicks({ status }: { status: string }) {
  if (status === 'pending') return <span className="wa-tick" title="Enviando…"><WaIcon.clock size={12} /></span>
  if (status === 'failed')  return <span className="wa-tick failed" title="No se entregó"><WaIcon.alert size={13} /></span>
  const double = status === 'delivered' || status === 'read'
  return (
    <span className={`wa-tick ${status === 'read' ? 'read' : ''}`}
      title={status === 'read' ? 'Leído' : status === 'delivered' ? 'Entregado' : 'Enviado'}>
      {double ? <CheckCheck size={16} strokeWidth={2.2} aria-hidden="true" /> : <Check size={16} strokeWidth={2.2} aria-hidden="true" />}
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

/* ── Multimedia del chat, recibida o enviada (servida por el proxy autenticado) ── */
export function MediaContent({ mediaId, mediaType, mime }: { mediaId: string; mediaType: string; mime?: string | null }) {
  const src = `/api/whatsapp/media/${mediaId}`
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="wa-media-missing"><WaIcon.alert size={13} /> El archivo ya no está disponible en WhatsApp</div>
  switch (mediaType) {
    case 'image':
      return (
        <a href={src} target="_blank" rel="noopener noreferrer">
          <img src={src} alt="Imagen recibida" className="wa-media-img" loading="lazy" onError={() => setFailed(true)} />
        </a>
      )
    case 'sticker':
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

/** Para mensajes con multimedia el texto guardado es "<marca> Imagen · pie de foto": solo se muestra el pie. */
export function mediaCaption(body: string | null): string {
  if (!body) return ''
  const i = body.indexOf(' · ')
  return i >= 0 ? body.slice(i + 3) : ''
}
