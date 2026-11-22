'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Handshake, Mail, MessageCircle, Share2, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { EVENTS, track } from '@/lib/analytics'
import { notifyDataChanged } from '@/lib/crmEvents'
import { toWhatsAppNumber, waChatPhone } from '@/lib/phone'
import { clientQuoteName, emailMessage, folioLabel, pdfFilename, quotePublicPath, whatsappMessage, type SendVia } from '@/lib/quotes'
import type { Quote } from './ui'
import s from './send.module.css'

type Tab = 'whatsapp' | 'correo' | 'otro'
type Chat = { available: boolean; open: boolean }

/**
 * Enviar una cotización: por WhatsApp (el del vendedor o, en Cubeta, el de la
 * tienda con el PDF), por correo (lo manda Matices con el PDF) o de otra forma
 * (compartir el PDF, copiar el enlace o entregarla en persona). Al enviarla se
 * registra en el sistema comercial.
 */
export function SendDialog({ quote, storeName, userEmail, chat, onClose, onSent }: {
  quote: Quote
  storeName: string
  userEmail: string
  chat: Chat
  onClose: () => void
  onSent: (q: Quote, note: string) => void
}) {
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}${quotePublicPath(quote.share_token)}`
  const [tab, setTab] = useState<Tab>('whatsapp')
  const [waFrom, setWaFrom] = useState<'mine' | 'store'>(chat.available && chat.open ? 'store' : 'mine')
  const [waText, setWaText] = useState(() => whatsappMessage(quote, storeName, url))
  const [to, setTo] = useState(quote.client_email)
  const [subject, setSubject] = useState(`${clientQuoteName(quote.folio)} de ${storeName}`)
  const [mailText, setMailText] = useState(() => emailMessage(quote, storeName))
  const [busy, setBusy] = useState<SendVia | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const pdf = useRef<File | null>(null)
  const [canShare, setCanShare] = useState(false)
  const phone = waChatPhone(quote.client_phone)
  // Una subida manda su archivo (PDF o foto); una de Matices, su PDF
  const photo = !!quote.file && quote.file.mime !== 'application/pdf'
  const fileWord = photo ? 'la foto' : 'el PDF'

  // El archivo se pide al abrir «Otra forma»: compartir tiene que pasar justo al tocar el botón
  useEffect(() => {
    if (tab !== 'otro' || pdf.current || typeof navigator === 'undefined' || !navigator.canShare) return
    let alive = true
    fetch(`/api/data/quotes/${quote.id}/pdf`).then(r => (r.ok ? r.blob() : null)).then(blob => {
      if (!alive || !blob) return
      const file = new File([blob], quote.file?.name ?? pdfFilename(quote.folio ?? 0, storeName), { type: quote.file?.mime || 'application/pdf' })
      if (navigator.canShare({ files: [file] })) { pdf.current = file; setCanShare(true) }
    }).catch(() => {})
    return () => { alive = false }
  }, [tab, quote.id, quote.folio, quote.file, storeName])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [busy, onClose])

  /** Marca la cotización como enviada (y en algunos casos la manda el servidor). */
  async function mark(via: SendVia, extra: Record<string, unknown> = {}, note = 'Cotización enviada') {
    setBusy(via); setError('')
    try {
      const r = await apiFetch(`/api/data/quotes/${quote.id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ via, ...extra }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo enviar. Intenta de nuevo.'); return false }
      track(EVENTS.quoteSent, { via })
      notifyDataChanged('commercial')
      onSent(d.quote, note)
      return true
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const waLink = useMemo(() => {
    const text = encodeURIComponent(waText.trim())
    return phone ? `https://wa.me/${toWhatsAppNumber(phone)}?text=${text}` : `https://wa.me/?text=${text}`
  }, [phone, waText])

  function sendWhatsApp() {
    if (waFrom === 'store') { void mark('chat', { message: waText.trim() }, 'Se envió el PDF por el WhatsApp de la tienda'); return }
    // Se abre en el mismo clic (si no, el navegador lo bloquea) y después se registra
    window.open(waLink, '_blank', 'noopener,noreferrer')
    void mark('whatsapp', {}, 'Cotización enviada por WhatsApp')
  }

  async function share() {
    if (!pdf.current) return
    try {
      await navigator.share({ files: [pdf.current], title: clientQuoteName(quote.folio), text: waText.trim() })
      await mark('compartir', {}, 'Cotización compartida')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(`No se pudo compartir ${fileWord}.`)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      await mark('enlace', {}, 'Enlace copiado: pégalo donde quieras mandarlo')
    } catch {
      setError('No se pudo copiar. Copia el enlace a mano: ' + url)
    }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={`modal-card ${s.card}`} role="dialog" aria-modal="true" aria-labelledby="send-title">
        <div className="modal-head">
          <h3 id="send-title">Enviar cotización {folioLabel(quote.folio)}</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar" disabled={!!busy}><X size={17} /></button>
        </div>

        <div className={s.tabs} role="tablist" aria-label="Cómo enviarla">
          {([['whatsapp', 'WhatsApp', MessageCircle], ['correo', 'Correo', Mail], ['otro', 'Otra forma', Share2]] as const).map(([key, label, Icon]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={s.tab} onClick={() => { setTab(key); setError('') }}>
              <Icon aria-hidden="true" />{label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'whatsapp' && (
            <>
              {chat.available && (
                <div className={s.choices} role="radiogroup" aria-label="Desde qué WhatsApp">
                  <label className={`radio-card ${waFrom === 'mine' ? 'active' : ''}`}>
                    <input type="radio" name="wa-from" checked={waFrom === 'mine'} onChange={() => setWaFrom('mine')} />
                    <span><strong>Desde tu WhatsApp</strong><small>Se abre con el mensaje y el enlace listos.</small></span>
                  </label>
                  <label className={`radio-card ${waFrom === 'store' ? 'active' : ''} ${!chat.open ? s.off : ''}`}>
                    <input type="radio" name="wa-from" checked={waFrom === 'store'} disabled={!chat.open} onChange={() => setWaFrom('store')} />
                    <span>
                      <strong>Desde el WhatsApp de la tienda, con {fileWord}</strong>
                      <small>{chat.open ? 'Queda en el chat del cliente en Matices.' : 'Disponible cuando el cliente te escribe: WhatsApp solo deja mandar archivos dentro de las 24 h desde su último mensaje.'}</small>
                    </span>
                  </label>
                </div>
              )}
              <p className={s.to}>{phone ? <>Para: <b>{quote.client_phone}</b></> : 'Sin teléfono: WhatsApp te dejará elegir el chat.'}</p>
              <div className="field">
                <label htmlFor="wa-text">Mensaje</label>
                <textarea id="wa-text" rows={5} maxLength={1000} value={waText} onChange={e => setWaText(e.target.value)} />
              </div>
            </>
          )}

          {tab === 'correo' && (
            <>
              <p className={s.lead}>Lo mandamos a nombre de <b>{storeName}</b> con {fileWord} adjunt{photo ? 'a' : 'o'}. Si el cliente responde, te llega a <b>{userEmail}</b>.</p>
              <div className="field">
                <label htmlFor="mail-to">Para</label>
                <input id="mail-to" type="email" inputMode="email" autoComplete="off" value={to} onChange={e => setTo(e.target.value)} placeholder="correo@cliente.com" maxLength={254} />
              </div>
              <div className="field">
                <label htmlFor="mail-subject">Asunto</label>
                <input id="mail-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} />
              </div>
              <div className="field">
                <label htmlFor="mail-text">Mensaje</label>
                <textarea id="mail-text" rows={7} maxLength={4000} value={mailText} onChange={e => setMailText(e.target.value)} />
              </div>
            </>
          )}

          {tab === 'otro' && (
            <div className={s.options}>
              {canShare && (
                <button className={s.option} onClick={share} disabled={!!busy}>
                  <Share2 aria-hidden="true" />
                  <span><strong>Compartir {fileWord}</strong><small>Por WhatsApp, Telegram o la app que elijas.</small></span>
                </button>
              )}
              <button className={s.option} onClick={copyLink} disabled={!!busy}>
                <Copy aria-hidden="true" />
                <span><strong>{copied ? 'Enlace copiado' : 'Copiar el enlace'}</strong><small>El cliente la ve en línea y descarga {fileWord}.</small></span>
              </button>
              <button className={s.option} onClick={() => mark('en_persona', {}, 'Cotización marcada como entregada')} disabled={!!busy}>
                <Handshake aria-hidden="true" />
                <span><strong>Ya la entregué en persona</strong><small>Solo la marca como enviada.</small></span>
              </button>
            </div>
          )}

          {error && <div className="field-error" role="alert" style={{ marginTop: 4 }}>{error}</div>}
        </div>

        {tab !== 'otro' && (
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={onClose} disabled={!!busy}>Cancelar</button>
            {tab === 'whatsapp' ? (
              <button className="btn btn-primary" onClick={sendWhatsApp} disabled={!!busy || !waText.trim()}>
                {busy ? 'Enviando…' : waFrom === 'store' ? 'Enviar por el chat' : 'Abrir WhatsApp'}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={!!busy || !emailOk || !mailText.trim()}
                onClick={() => mark('correo', { email: to.trim(), subject: subject.trim(), message: mailText.trim() }, `Correo enviado a ${to.trim()}`)}>
                {busy ? 'Enviando…' : 'Enviar correo'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
