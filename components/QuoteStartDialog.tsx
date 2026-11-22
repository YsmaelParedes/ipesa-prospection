'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Paperclip, Upload, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { notifyDataChanged } from '@/lib/crmEvents'
import { fmtPhone } from '@/lib/phone'
import { findContacts, type IndexContact } from '@/lib/searchIndex'
import { QUOTE_FILE_ACCEPT, quoteFileProblem } from '@/lib/quoteFiles'
import { uploadQuoteFile } from '@/lib/quoteUpload'
import { fmtSize } from '@/lib/whatsappFiles'
import { newQuoteHref } from './ClientQuotes'
import s from './QuoteStartDialog.module.css'

/** El cliente desde cuya ficha se cotiza. */
export type QuoteClient = { id: string; name: string }

type Via = 'whatsapp' | 'correo' | 'en_persona'
const VIAS: [Via, string][] = [['whatsapp', 'WhatsApp'], ['correo', 'Correo'], ['en_persona', 'En persona']]

/**
 * «Cotizar»: hacerla en Matices o subir una que ya se hizo en otro sistema o
 * a mano (PDF o foto). La subida cuenta como enviada: si es de un cliente, se
 * registra «Cotización enviada» con su total y el seguimiento a 2 días.
 */
export function QuoteStartDialog({ client, onClose, onUploaded }: {
  client?: QuoteClient | null
  onClose: () => void
  /** Después de subirla; por omisión se abre la cotización. */
  onUploaded?: (quoteId: string) => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<'choose' | 'upload'>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [contact, setContact] = useState<QuoteClient | null>(client ?? null)
  const [name, setName] = useState('')
  const [matches, setMatches] = useState<IndexContact[]>([])
  const [total, setTotal] = useState('')
  const [via, setVia] = useState<Via>('whatsapp')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [busy, onClose])

  // Sin cliente: se busca en Contactos o se escribe el nombre
  useEffect(() => {
    const text = name.trim()
    if (contact || !text) { setMatches([]); return }
    let alive = true
    const t = setTimeout(() => { findContacts(text, 5).then(list => { if (alive) setMatches(list) }).catch(() => {}) }, 180)
    return () => { alive = false; clearTimeout(t) }
  }, [name, contact])

  function make() {
    onClose()
    router.push(contact ? newQuoteHref(contact.id) : '/cotizaciones/nueva')
  }

  function choose(f: File | undefined) {
    if (!f) return
    const problem = quoteFileProblem(f)
    setError(problem ?? '')
    setFile(problem ? null : f)
  }

  async function upload() {
    const amount = Number(total.replace(/[,$\s]/g, ''))
    if (!file) { setError('Elige el archivo de la cotización'); return }
    if (!contact && !name.trim()) { setError('Escribe el nombre del cliente'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Escribe el total de la cotización'); return }
    setBusy(true); setError('')
    try {
      const path = await uploadQuoteFile(file)
      const r = await apiFetch('/api/data/quotes/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path, file_name: file.name, total: amount, via,
          ...(contact ? { contact_id: contact.id } : { client_name: name.trim() }),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar la cotización')
      notifyDataChanged('commercial')
      onClose()
      if (onUploaded) onUploaded(d.quote.id)
      else router.push(`/cotizaciones/${d.quote.id}`)
    } catch (e) {
      setError((e as Error).message === 'Failed to fetch' ? 'Sin conexión. Intenta de nuevo.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = contact ? `Cotizar a ${contact.name}` : 'Nueva cotización'

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={`modal-card ${s.card}`} role="dialog" aria-modal="true" aria-labelledby="quote-start-title">
        <div className="modal-head">
          <h3 id="quote-start-title">{step === 'upload' ? 'Subir cotización' : title}</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar" disabled={busy}><X size={17} /></button>
        </div>

        <div className="modal-body">
          {step === 'choose' ? (
            <div className={s.options}>
              <button className={s.option} onClick={make}>
                <FileText aria-hidden="true" />
                <span><strong>Hacer cotización en Matices</strong><small>Con tus productos y precios; la mandas por WhatsApp o correo.</small></span>
              </button>
              <button className={s.option} onClick={() => setStep('upload')}>
                <Upload aria-hidden="true" />
                <span><strong>Subir cotización</strong><small>Un PDF o una foto de una que ya hiciste en otro sistema o a mano.</small></span>
              </button>
            </div>
          ) : (
            <>
              <div className="field">
                <input ref={fileInput} type="file" accept={QUOTE_FILE_ACCEPT} hidden
                  onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
                <button type="button" className={s.pick} onClick={() => fileInput.current?.click()} disabled={busy}>
                  <Paperclip aria-hidden="true" />
                  {file
                    ? <><span><strong>{file.name}</strong><small>{fmtSize(file.size)}</small></span><em>Cambiar</em></>
                    : <span><strong>Elegir archivo</strong><small>PDF, JPG o PNG de hasta 10 MB</small></span>}
                </button>
              </div>

              <div className="field">
                <label htmlFor="up-client">Cliente</label>
                {contact ? (
                  <div className="linked-chip">
                    <span><strong>{contact.name}</strong></span>
                    {!client && <button type="button" onClick={() => setContact(null)} aria-label="Quitar el cliente"><X size={14} /></button>}
                  </div>
                ) : (
                  <div className="picker-search">
                    <input id="up-client" value={name} onChange={e => setName(e.target.value)} maxLength={200} autoComplete="off"
                      placeholder="Busca en tus contactos o escribe el nombre" />
                    {matches.length > 0 && (
                      <div className="picker-results" role="listbox">
                        {matches.map(c => (
                          <button key={c.id} type="button" role="option" aria-selected="false"
                            onClick={() => { setContact({ id: c.id, name: c.company?.trim() || c.name }); setName('') }}>
                            <strong>{c.company?.trim() || c.name}</strong><small>{c.phone ? fmtPhone(c.phone) : ''}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="up-total">Total <span className="label-muted">(con IVA)</span></label>
                <span className={s.money}>
                  <input id="up-total" inputMode="decimal" value={total} placeholder="0" disabled={busy}
                    onChange={e => setTotal(e.target.value.replace(/[^\d.,]/g, ''))} />
                </span>
              </div>

              <div className="field">
                <label>¿Por dónde se la mandaste?</label>
                <div className={s.seg} role="group" aria-label="Por dónde se la mandaste">
                  {VIAS.map(([v, label]) => (
                    <button key={v} type="button" aria-pressed={via === v} onClick={() => setVia(v)} disabled={busy}>{label}</button>
                  ))}
                </div>
                {contact && <p className={s.note}>Queda como «Cotización enviada» y te recordamos darle seguimiento en 2 días.</p>}
              </div>

              {error && <div className="field-error" role="alert">{error}</div>}
            </>
          )}
          {step === 'choose' && error && <div className="field-error" role="alert">{error}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={step === 'upload' && !busy ? () => { setStep('choose'); setError('') } : onClose} disabled={busy}>
            {step === 'upload' ? 'Atrás' : 'Cancelar'}
          </button>
          {step === 'upload' && (
            <button className="btn btn-primary" onClick={upload} disabled={busy}>{busy ? 'Subiendo…' : 'Subir cotización'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
