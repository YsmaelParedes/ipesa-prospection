'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown, CircleAlert, Copy, Download, ExternalLink, Eye, FileText, Lock, MoreHorizontal, Plus, RotateCcw, Send, Trash2, UserPlus, X, XCircle,
} from 'lucide-react'
import { fmtSize } from '@/lib/whatsappFiles'
import { apiFetch } from '@/lib/apiClient'
import { useSession } from '@/lib/profile'
import { notifyDataChanged } from '@/lib/crmEvents'
import { fmtPhone } from '@/lib/phone'
import { findContacts, type IndexContact } from '@/lib/searchIndex'
import {
  UNIT_SUGGESTIONS, addDaysIso, computeTotals, fmtMoney, folioLabel, isFilled, lineTotal,
  type QuoteDoc, type QuoteSettings, type QuoteStore,
} from '@/lib/quotes'
import { QuoteSheet } from '@/components/QuoteSheet'
import { Select } from '@/components/Select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadFailed } from '@/components/LoadFailed'
import ContactFormModal from '@/components/ContactFormModal'
import { QuoteEditorSkeleton } from '../Skeletons'
import { SendDialog } from '../SendDialog'
import { StatusBadge, viewedAt, type Quote } from '../ui'
import s from '../cotizaciones.module.css'

type ItemDraft = { key: string; description: string; quantity: string; unit: string; price: string }
type Draft = {
  contact_id: string | null; client_name: string; client_phone: string; client_email: string
  items: ItemDraft[]; discount_kind: 'percent' | 'amount'; discount_value: string; tax_rate: number
  notes: string; valid_until: string
  /** Solo en una subida: el total que se escribe (no hay renglones). */
  total: string
}
type Chat = { available: boolean; open: boolean }
type Suggestion = { description: string; unit: string; price: number }
type Dialog = null | 'send' | 'accept' | 'reject' | 'reopen' | 'delete' | 'contact'

let keySeq = 0
const newKey = () => `i${++keySeq}`
const blankItem = (): ItemDraft => ({ key: newKey(), description: '', quantity: '1', unit: '', price: '' })
const num = (v: string) => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0 }
const numText = (n: number) => (n ? String(n) : '')

function draftOf(q: Quote): Draft {
  return {
    contact_id: q.contact_id, client_name: q.client_name, client_phone: q.client_phone, client_email: q.client_email,
    items: q.items.length ? q.items.map(i => ({ key: newKey(), description: i.description, quantity: numText(i.quantity), unit: i.unit, price: numText(i.price) })) : [blankItem()],
    discount_kind: q.discount_kind, discount_value: numText(q.discount_value), tax_rate: q.tax_rate,
    // El total de una subida con sus centavos (4250.50, no 4250.5)
    notes: q.notes, valid_until: q.valid_until, total: q.total ? (Number.isInteger(q.total) ? String(q.total) : q.total.toFixed(2)) : '',
  }
}
const payloadOf = (d: Draft, uploaded: boolean) => {
  const client = { contact_id: d.contact_id, client_name: d.client_name, client_phone: d.client_phone, client_email: d.client_email }
  // Una subida solo guarda el cliente, el total y la validez
  if (uploaded) return { ...client, total: num(d.total), valid_until: d.valid_until }
  return {
    ...client,
    items: d.items.map(i => ({ description: i.description, quantity: num(i.quantity), unit: i.unit, price: num(i.price) })),
    discount_kind: d.discount_kind, discount_value: num(d.discount_value), tax_rate: d.tax_rate, notes: d.notes, valid_until: d.valid_until,
  }
}
/** Una cotización nueva se guarda (y toma su folio) hasta que tiene un producto. */
const hasProduct = (d: Draft | null) =>
  !!d && d.items.some(i => isFilled({ description: i.description, quantity: num(i.quantity), unit: i.unit, price: num(i.price) }))

/**
 * Editor de una cotización: el formulario a la izquierda y la hoja en vivo a
 * la derecha (en celular, en pestañas). Se guarda sola mientras se escribe;
 * una nueva se crea (y toma su folio) al agregar el primer producto. Una
 * subida muestra su archivo y solo se cambian el cliente, el total y la validez.
 */
export default function QuoteEditorPage() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const session = useSession()
  const storeReadonly = session?.store?.access === 'readonly'
  const isAdmin = !!session?.isAdmin

  const [quote, setQuote] = useState<Quote | null>(null)
  const [header, setHeader] = useState<QuoteStore | null>(null)
  const [settings, setSettings] = useState<QuoteSettings | null>(null)
  const [chat, setChat] = useState<Chat>({ available: false, open: false })
  const [today, setToday] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<'editar' | 'vista'>('editar')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [registerSale, setRegisterSale] = useState(true)
  const [registerLost, setRegisterLost] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')

  const quoteId = useRef<string | null>(null)
  const loaded = useRef<string | null>(null)
  const draftRef = useRef<Draft | null>(null)
  draftRef.current = draft
  const dirty = useRef(false)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement>(null)
  const uploadedRef = useRef(false)

  const showToast = (text: string) => { setToast(text); setTimeout(() => setToast(''), 2600) }

  // ── Carga ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadError('')
    try {
      if (id === 'nueva') {
        // Desde la ficha del cliente llegan sus datos; no se guarda nada hasta el primer producto
        const contact = search.get('contact')
        const r = await apiFetch(`/api/data/quotes/settings${contact ? `?contact=${encodeURIComponent(contact)}` : ''}`, { cache: 'reload' })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'No se pudo abrir el cotizador')
        const st = d.settings as QuoteSettings
        const client = d.client as { contact_id: string; client_name: string; client_phone: string; client_email: string } | null
        setHeader(d.header); setSettings(st); setToday(d.today); setQuote(null)
        setDraft({
          contact_id: client?.contact_id ?? null, client_name: client?.client_name ?? '',
          client_phone: client?.client_phone ?? '', client_email: client?.client_email ?? '', items: [blankItem()],
          discount_kind: 'percent', discount_value: '', tax_rate: st.taxDefault ? st.taxRate : 0,
          notes: st.terms, valid_until: addDaysIso(d.today, st.validDays), total: '',
        })
        loaded.current = 'nueva'
        return
      }
      const r = await apiFetch(`/api/data/quotes/${id}`, { cache: 'reload' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(r.status === 404 ? 'Esta cotización no existe o no es tuya.' : d.error || 'No se pudo abrir la cotización')
      setQuote(d.quote); setHeader(d.header); setSettings(d.settings); setChat(d.chat); setToday(d.today)
      setDraft(draftOf(d.quote))
      quoteId.current = d.quote.id
      uploadedRef.current = !!d.quote.file
      loaded.current = d.quote.id
    } catch (e) {
      setLoadError((e as Error).message || 'No se pudo abrir la cotización')
    }
  }, [id, search])

  useEffect(() => {
    // Ya cargada: al crearla, la dirección cambia a su id (y los parámetros
    // pueden llegar todavía como «nueva»). Solo se recarga si es otra cotización.
    if (loaded.current && (id === loaded.current || id === quoteId.current || (id === 'nueva' && quoteId.current))) return
    void load()
  }, [id, load])

  // ── Guardado automático ──────────────────────────────────────────────────
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current)
    // Uno a la vez: si otro guardado empezó mientras se esperaba, se espera también
    while (inFlight.current) await inFlight.current
    const d = draftRef.current
    if (!dirty.current || !d) return true
    if (!quoteId.current && !hasProduct(d)) { dirty.current = false; return true }
    dirty.current = false
    setSaveState('saving')
    const run = (async () => {
      try {
        const existing = quoteId.current
        const r = await apiFetch(existing ? `/api/data/quotes/${existing}` : '/api/data/quotes', {
          method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadOf(d, uploadedRef.current)),
        })
        const res = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(res.error || 'No se pudieron guardar los cambios')
        setQuote(res.quote)
        if (!existing) {
          quoteId.current = res.quote.id
          loaded.current = res.quote.id
          window.history.replaceState(null, '', `/cotizaciones/${res.quote.id}`)
        }
        setSaveState(dirty.current ? 'saving' : 'saved')
        return true
      } catch (e) {
        dirty.current = true
        setSaveError((e as Error).message === 'Failed to fetch' ? 'Sin conexión' : (e as Error).message)
        setSaveState('error')
        return false
      }
    })()
    inFlight.current = run
    const ok = await run
    inFlight.current = null
    if (ok && dirty.current) timer.current = setTimeout(() => void flush(), 600)
    return ok
  }, [])

  const change = useCallback((fn: (d: Draft) => Draft) => {
    setDraft(d => (d ? fn(d) : d))
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }, [flush])

  // Que no se pierda nada al cerrar la pestaña o salir del editor (sin productos no hay nada que guardar)
  useEffect(() => {
    const pending = () => (dirty.current && (!!quoteId.current || hasProduct(draftRef.current))) || !!inFlight.current
    const before = (e: BeforeUnloadEvent) => { if (pending()) { void flush(); e.preventDefault() } }
    const hide = () => { if (document.visibilityState === 'hidden' && dirty.current) void flush() }
    window.addEventListener('beforeunload', before)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('beforeunload', before)
      document.removeEventListener('visibilitychange', hide)
      if (dirty.current) void flush()
    }
  }, [flush])

  useEffect(() => {
    if (!menuOpen) return
    const down = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [menuOpen])

  const doc: QuoteDoc | null = useMemo(() => draft && {
    folio: quote?.folio ?? 0, status: quote?.status ?? 'draft',
    client_name: draft.client_name, client_phone: draft.client_phone, client_email: draft.client_email,
    items: draft.items.map(i => ({ description: i.description, quantity: num(i.quantity), unit: i.unit, price: num(i.price) })),
    discount_kind: draft.discount_kind, discount_value: num(draft.discount_value), tax_rate: draft.tax_rate,
    notes: draft.notes, issued_on: quote?.issued_on ?? today, valid_until: draft.valid_until,
    seller_name: quote?.seller_name ?? session?.user.name ?? null,
  }, [draft, quote, today, session?.user.name])

  if (loadError) return <><EditorTop /><LoadFailed message={loadError} onRetry={() => { loaded.current = null; void load() }} /></>
  if (!draft || !doc || !header || !settings) return <QuoteEditorSkeleton />

  const status = quote?.status ?? 'draft'
  const uploaded = !!quote?.file
  const photo = uploaded && quote?.file?.mime !== 'application/pdf'
  const decided = status === 'accepted' || status === 'rejected'
  const locked = storeReadonly || decided
  const totals = computeTotals(doc.items.filter(isFilled), doc.discount_kind, doc.discount_value, doc.tax_rate)
  const mine = !quote || quote.created_by === session?.user.id
  const canDelete = !!quote && !storeReadonly && (isAdmin || (mine && status === 'draft'))
  const taxOptions = [...new Set([settings.taxRate, ...(draft.tax_rate ? [draft.tax_rate] : [])])]
    .map(r => ({ value: String(r), label: `IVA ${r} %` })).concat({ value: '0', label: 'Sin IVA' })
  const ready = !!draft.client_name.trim() && (uploaded ? num(draft.total) > 0 : doc.items.some(isFilled))

  // ── Acciones ─────────────────────────────────────────────────────────────
  async function act(path: string, body: unknown, note: string, method = 'POST') {
    if (!quote) return null
    setBusy(true); setActionError('')
    try {
      const r = await apiFetch(`/api/data/quotes/${quote.id}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setActionError(d.error || 'No se pudo completar. Intenta de nuevo.'); return null }
      if (note) showToast(note)
      return d
    } catch {
      setActionError('Sin conexión. Intenta de nuevo.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function decide(next: 'accepted' | 'rejected' | 'sent') {
    const d = await act('/status', {
      status: next,
      registerSale: next === 'accepted' && registerSale && !!quote?.contact_id,
      registerLost: next === 'rejected' && registerLost && !!quote?.contact_id,
    },
      next === 'accepted' ? 'Cotización aceptada'
        : next === 'rejected' ? (registerLost && quote?.contact_id ? 'Cotización rechazada · el cliente pasó a No interesado' : 'Cotización rechazada')
        : 'Cotización reabierta')
    if (!d) return
    setQuote(d.quote); setDraft(draftOf(d.quote)); setDialog(null)
    notifyDataChanged('commercial')
  }

  async function remove() {
    const d = await act('', undefined, '', 'DELETE')
    if (!d) return
    dirty.current = false
    router.push('/cotizaciones')
  }

  async function duplicate() {
    setMenuOpen(false)
    if (!(await flush())) return
    const d = await act('/duplicate', {}, '')
    if (d) router.push(`/cotizaciones/${d.quote.id}`)
  }

  async function openSend() {
    setActionError('')
    if (!ready) {
      setActionError(!draft?.client_name.trim() ? 'Escribe el nombre del cliente antes de enviarla.'
        : uploaded ? 'Escribe el total antes de enviarla.' : 'Agrega al menos un producto antes de enviarla.')
      return
    }
    if (await flush()) setDialog('send')
  }

  async function download() {
    if (!(await flush()) || !quoteId.current) return
    window.location.href = `/api/data/quotes/${quoteId.current}/pdf`
  }

  const saveLabel = saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado'
    : !quote ? 'Se guarda al agregar el primer producto' : null

  return (
    <>
      <div className={s.editorHead}>
        <Link href="/cotizaciones" className={`${s.back} ${s.press}`} aria-label="Volver a Cotizaciones"><ArrowLeft aria-hidden="true" /></Link>
        <div className={s.titleBlock}>
          <h2>{quote ? `Cotización ${folioLabel(quote.folio)}` : 'Nueva cotización'}</h2>
          <StatusBadge status={quote?.display_status ?? 'draft'} />
          {quote?.viewed_at && <span className={s.viewed}><Eye aria-hidden="true" />Vista el {viewedAt(quote.viewed_at)}</span>}
          {saveState === 'error'
            ? <span className={`${s.saved} ${s.savedError}`}><CircleAlert aria-hidden="true" />{saveError || 'No se guardó'} · <button className="link-btn" onClick={() => void flush()}>Reintentar</button></span>
            : saveLabel && <span className={s.saved} aria-live="polite">{saveState === 'saved' && <Check aria-hidden="true" />}{saveLabel}</span>}
        </div>
        <div className={s.headActions}>
          <button className={`btn btn-ghost ${s.press}`} onClick={download} disabled={!quote && !hasProduct(draft)}><Download aria-hidden="true" /> {photo ? 'Foto' : 'PDF'}</button>
          {!storeReadonly && !decided && (
            <button className={`btn btn-primary ${s.press}`} onClick={openSend} disabled={busy}><Send aria-hidden="true" /> {status === 'draft' ? 'Enviar' : 'Volver a enviar'}</button>
          )}
          {quote && !storeReadonly && (
            <div className={s.menuWrap} ref={menuRef}>
              <button className={`btn-icon ${s.iconBtn} ${s.press}`} aria-label="Más acciones" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                <MoreHorizontal aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className={s.menu} role="menu">
                  {status === 'sent' && <>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); setRegisterSale(true); setDialog('accept') }}><CheckCircle2 aria-hidden="true" />Marcar como aceptada</button>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); setDialog('reject') }}><XCircle aria-hidden="true" />Marcar como rechazada</button>
                  </>}
                  {decided && <button role="menuitem" onClick={() => { setMenuOpen(false); setDialog('reopen') }}><RotateCcw aria-hidden="true" />Reabrir</button>}
                  {!uploaded && <button role="menuitem" onClick={duplicate}><Copy aria-hidden="true" />Duplicar</button>}
                  {canDelete && <>{(!uploaded || status === 'sent' || decided) && <hr />}<button role="menuitem" className={s.danger} onClick={() => { setMenuOpen(false); setDialog('delete') }}><Trash2 aria-hidden="true" />Borrar</button></>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`${s.seg} ${s.mobileTabs}`} role="tablist" aria-label="Vista">
        <button role="tab" aria-pressed={tab === 'editar'} aria-selected={tab === 'editar'} onClick={() => setTab('editar')}>Editar</button>
        <button role="tab" aria-pressed={tab === 'vista'} aria-selected={tab === 'vista'} onClick={() => setTab('vista')}>Vista previa</button>
      </div>

      <div className={s.editor} data-tab={tab}>
        <div className={s.form}>
          {actionError && !dialog && <div className={s.errorNote} role="alert">{actionError}</div>}
          {decided && (
            <div className={s.locked}><Lock aria-hidden="true" />
              <span>{status === 'accepted' ? 'Esta cotización ya se aceptó.' : 'Esta cotización se rechazó.'} Para cambiarla, reábrela desde <b>Más acciones</b>.</span>
            </div>
          )}

          <ClientCard draft={draft} locked={locked} onChange={change} onSaveContact={() => setDialog('contact')} />

          {uploaded ? (
            <section className={s.card} aria-labelledby="upload-title">
              <div className={s.cardHead}><h3 id="upload-title">Cotización subida</h3></div>
              <div className={s.grid2}>
                <div className="field">
                  <label htmlFor="q-total">Total <span className="label-muted">(con IVA)</span></label>
                  <span className={s.money}>
                    <input id="q-total" className={s.num} inputMode="decimal" value={draft.total} disabled={locked} placeholder="0"
                      onChange={e => change(d => ({ ...d, total: e.target.value.replace(/[^\d.]/g, '') }))} />
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="q-valid">Válida hasta</label>
                  <input id="q-valid" type="date" value={draft.valid_until} min={quote?.issued_on ?? today} disabled={locked}
                    onChange={e => { const v = e.target.value; if (v) change(d => ({ ...d, valid_until: v })) }} />
                </div>
              </div>
            </section>
          ) : <>
          <section className={s.card} aria-labelledby="items-title">
            <div className={s.cardHead}><h3 id="items-title">Productos</h3><span className={`${s.aside} label-muted`}>Precios sin IVA</span></div>
            <div className={s.items}>
              {draft.items.map((it, i) => (
                <ItemRow key={it.key} item={it} index={i} locked={locked} canRemove={draft.items.length > 1}
                  onChange={next => change(d => ({ ...d, items: d.items.map(x => (x.key === it.key ? { ...x, ...next } : x)) }))}
                  onRemove={() => change(d => ({ ...d, items: d.items.filter(x => x.key !== it.key) }))} />
              ))}
              {!locked && (
                <button className={`btn btn-ghost ${s.addItem} ${s.press}`} onClick={() => change(d => ({ ...d, items: [...d.items, blankItem()] }))}
                  disabled={draft.items.length >= 100}><Plus aria-hidden="true" /> Agregar producto</button>
              )}
            </div>
          </section>

          <section className={s.card} aria-labelledby="totals-title">
            <div className={s.cardHead}><h3 id="totals-title">Totales y condiciones</h3></div>
            <div className={s.grid2}>
              <div className="field">
                <label htmlFor="q-discount">Descuento</label>
                <div className={s.discount}>
                  <div className={s.seg} role="group" aria-label="Tipo de descuento">
                    <button type="button" aria-pressed={draft.discount_kind === 'percent'} disabled={locked} onClick={() => change(d => ({ ...d, discount_kind: 'percent' }))}>%</button>
                    <button type="button" aria-pressed={draft.discount_kind === 'amount'} disabled={locked} onClick={() => change(d => ({ ...d, discount_kind: 'amount' }))}>$</button>
                  </div>
                  <input id="q-discount" inputMode="decimal" value={draft.discount_value} disabled={locked} placeholder="0"
                    onChange={e => change(d => ({ ...d, discount_value: e.target.value.replace(/[^\d.]/g, '') }))} />
                </div>
              </div>
              <div className="field">
                <label>IVA</label>
                <Select value={String(draft.tax_rate)} disabled={locked} aria-label="IVA" options={taxOptions}
                  onChange={v => change(d => ({ ...d, tax_rate: Number(v) }))} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="q-valid">Válida hasta</label>
              <input id="q-valid" type="date" value={draft.valid_until} min={quote?.issued_on ?? today} disabled={locked}
                onChange={e => { const v = e.target.value; if (v) change(d => ({ ...d, valid_until: v })) }} />
            </div>
            <div className="field">
              <label htmlFor="q-notes">Condiciones</label>
              <textarea id="q-notes" rows={3} maxLength={2000} value={draft.notes} disabled={locked}
                onChange={e => change(d => ({ ...d, notes: e.target.value }))} />
            </div>
            <div className={s.totalLine}><span>Total</span><strong>{fmtMoney(totals.total)}</strong></div>
          </section>
          </>}
        </div>

        <div className={s.previewCol}>
          {quote?.file ? (
            <UploadedFile quoteId={quote.id} file={quote.file} />
          ) : <>
            <div className={s.previewBox}><QuoteSheet doc={doc} store={header} /></div>
            <p className={s.previewHint}>Así la verá tu cliente. El PDF sale igual.</p>
          </>}
        </div>
      </div>

      {dialog === 'send' && quote && (
        <SendDialog quote={quote} storeName={header.name} userEmail={session?.user.email ?? ''} chat={chat}
          onClose={() => setDialog(null)}
          onSent={(q, note) => { setQuote(q); setDialog(null); showToast(note) }} />
      )}

      <ConfirmDialog open={dialog === 'accept'} tone="warn" icon={CheckCircle2} busy={busy} error={actionError}
        title={`¿Marcar la cotización ${folioLabel(quote ? quote.folio : 0)} como aceptada?`}
        confirmLabel="Marcar aceptada" busyLabel="Guardando…"
        field={quote?.contact_id ? (
          <label className={s.saleCheck}>
            <input type="checkbox" checked={registerSale} onChange={e => setRegisterSale(e.target.checked)} />
            Registrar la venta por {fmtMoney(quote.total)} en el sistema comercial
          </label>
        ) : undefined}
        onConfirm={() => decide('accepted')} onCancel={() => { setDialog(null); setActionError('') }}>
        {quote?.contact_id ? 'El cliente pasa a Cliente y te recordamos ofrecerle recompra en 30 días.' : 'Ya no se podrá editar, salvo que la reabras.'}
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'reject'} tone="warn" icon={XCircle} busy={busy} error={actionError}
        title={`¿Marcar la cotización ${folioLabel(quote ? quote.folio : 0)} como rechazada?`}
        confirmLabel="Marcar rechazada" busyLabel="Guardando…"
        field={quote?.contact_id ? (
          <label className={s.saleCheck}>
            <input type="checkbox" checked={registerLost} onChange={e => setRegisterLost(e.target.checked)} />
            Registrar como No interesado en el sistema comercial
          </label>
        ) : undefined}
        onConfirm={() => decide('rejected')} onCancel={() => { setDialog(null); setActionError('') }}>
        {quote?.contact_id && registerLost
          ? 'El cliente sale de Oportunidades y te recordamos volver a ofrecerle en 90 días.'
          : 'No cambia nada del cliente en el sistema comercial.'}
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'reopen'} tone="warn" icon={RotateCcw} busy={busy} error={actionError}
        title={`¿Reabrir la cotización ${folioLabel(quote ? quote.folio : 0)}?`} confirmLabel="Reabrir" busyLabel="Reabriendo…"
        onConfirm={() => decide('sent')} onCancel={() => { setDialog(null); setActionError('') }}>
        Vuelve a quedar como enviada y la puedes editar.{quote?.sale_activity_id ? ' La venta que ya se registró en el sistema comercial se queda.' : ''}
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'delete'} busy={busy} error={actionError}
        title={`¿Borrar la cotización ${folioLabel(quote ? quote.folio : 0)}?`} confirmLabel="Borrar" busyLabel="Borrando…"
        onConfirm={remove} onCancel={() => { setDialog(null); setActionError('') }}>
        {status === 'draft' ? 'No se puede deshacer.' : 'El enlace que recibió el cliente deja de funcionar. Lo registrado en el sistema comercial se queda. No se puede deshacer.'}
      </ConfirmDialog>

      {dialog === 'contact' && (
        <ContactFormModal initialName={draft.client_name} initialPhone={draft.client_phone} initialEmail={draft.client_email}
          onClose={() => setDialog(null)}
          onSaved={c => { setDialog(null); change(d => ({ ...d, contact_id: c.id })); notifyDataChanged('contact'); showToast('Cliente guardado en Contactos') }} />
      )}

      {toast && <div className="toast-fixed"><Check size={14} strokeWidth={2.4} style={{ color: 'var(--warning-fill)' }} />{toast}</div>}
    </>
  )
}

/** El archivo de una subida: la foto tal cual o, si es PDF, para abrirlo en otra pestaña. */
function UploadedFile({ quoteId, file }: { quoteId: string; file: NonNullable<Quote['file']> }) {
  const src = `/api/data/quotes/${quoteId}/pdf?inline=1`
  if (file.mime !== 'application/pdf') {
    return <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className={s.previewBox}><img src={src} alt={`Cotización subida: ${file.name}`} className={s.photo} /></div>
      <p className={s.previewHint}>Así la verá tu cliente.</p>
    </>
  }
  return (
    <div className={`${s.card} ${s.fileCard}`}>
      <FileText aria-hidden="true" />
      <div><strong>{file.name}</strong><small>PDF · {fmtSize(file.size)}</small></div>
      <a href={src} target="_blank" rel="noopener noreferrer" className={`btn btn-ghost ${s.press}`}><ExternalLink aria-hidden="true" /> Ver PDF</a>
    </div>
  )
}

function EditorTop() {
  return (
    <div className={s.editorHead}>
      <Link href="/cotizaciones" className={s.back} aria-label="Volver a Cotizaciones"><ArrowLeft aria-hidden="true" /></Link>
      <div className={s.titleBlock}><h2>Cotización</h2></div>
    </div>
  )
}

/** Cliente: uno del CRM (sus datos se copian) o escrito a mano. */
function ClientCard({ draft, locked, onChange, onSaveContact }: {
  draft: Draft; locked: boolean; onChange: (fn: (d: Draft) => Draft) => void; onSaveContact: () => void
}) {
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<IndexContact[]>([])

  useEffect(() => {
    const text = q.trim()
    if (!text) { setMatches([]); return }
    let alive = true
    const t = setTimeout(() => { findContacts(text, 6).then(list => { if (alive) setMatches(list) }).catch(() => {}) }, 180)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  const pick = (c: IndexContact) => {
    onChange(d => ({
      ...d, contact_id: c.id, client_name: (c.company?.trim() || c.name).slice(0, 200),
      client_phone: c.phone ? fmtPhone(c.phone) : '', client_email: c.email ?? '',
    }))
    setQ(''); setMatches([])
  }

  return (
    <section className={s.card} aria-labelledby="client-title">
      <div className={s.cardHead}>
        <h3 id="client-title">Cliente</h3>
        {!locked && !draft.contact_id && draft.client_name.trim() && (
          <button type="button" className={`link-btn ${s.aside}`} onClick={onSaveContact}><UserPlus aria-hidden="true" /> Guardar en Contactos</button>
        )}
      </div>
      {!locked && (
        <div className="field">
          {draft.contact_id ? (
            <div className="linked-chip">
              <span>Cliente de tu base · <strong>{draft.client_name || 'Contacto'}</strong></span>
              <button type="button" onClick={() => onChange(d => ({ ...d, contact_id: null }))} aria-label="Quitar el contacto (los datos se quedan)"><X size={14} /></button>
            </div>
          ) : (
            <div className="picker-search">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en tus contactos por nombre o teléfono…" aria-label="Buscar cliente en tus contactos" />
              {matches.length > 0 && (
                <div className="picker-results" role="listbox">
                  {matches.map(c => (
                    <button key={c.id} type="button" role="option" aria-selected="false" onClick={() => pick(c)}>
                      <strong>{c.company?.trim() || c.name}</strong><small>{c.phone ? fmtPhone(c.phone) : c.company && c.company !== c.name ? c.name : ''}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="field">
        <label htmlFor="q-client">Nombre o empresa</label>
        <input id="q-client" value={draft.client_name} maxLength={200} disabled={locked} placeholder="A quién va la cotización"
          onChange={e => onChange(d => ({ ...d, client_name: e.target.value }))} />
      </div>
      <div className={s.grid2}>
        <div className="field">
          <label htmlFor="q-phone">Teléfono <span className="label-muted">(opcional)</span></label>
          <input id="q-phone" inputMode="tel" value={draft.client_phone} maxLength={30} disabled={locked}
            onChange={e => onChange(d => ({ ...d, client_phone: e.target.value.replace(/[^\d\s()+-]/g, '') }))} />
        </div>
        <div className="field">
          <label htmlFor="q-email">Correo <span className="label-muted">(opcional)</span></label>
          <input id="q-email" type="email" inputMode="email" value={draft.client_email} maxLength={254} disabled={locked}
            onChange={e => onChange(d => ({ ...d, client_email: e.target.value.trim() }))} />
        </div>
      </div>
    </section>
  )
}

/** Un renglón: descripción (con lo ya cotizado en la tienda), cantidad, unidad y precio. */
function ItemRow({ item, index, locked, canRemove, onChange, onRemove }: {
  item: ItemDraft; index: number; locked: boolean; canRemove: boolean
  onChange: (next: Partial<ItemDraft>) => void; onRemove: () => void
}) {
  const [focused, setFocused] = useState(false)
  const [list, setList] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const q = item.description.trim()

  useEffect(() => {
    if (!focused || locked) return
    let alive = true
    const t = setTimeout(() => {
      apiFetch(`/api/data/quotes/suggestions?q=${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : { suggestions: [] }))
        .then(d => { if (alive) { setList((d.suggestions as Suggestion[]).filter(x => x.description.toLowerCase() !== q.toLowerCase())); setActive(-1) } })
        .catch(() => {})
    }, 160)
    return () => { alive = false; clearTimeout(t) }
  }, [q, focused, locked])

  const choose = (sg: Suggestion) => {
    onChange({ description: sg.description, ...(item.unit ? {} : { unit: sg.unit }), ...(num(item.price) ? {} : { price: numText(sg.price) }) })
    setList([])
  }
  const open = focused && list.length > 0 && !locked
  const n = index + 1

  return (
    <div className={s.item}>
      <div className={s.descWrap}>
        <input value={item.description} maxLength={300} disabled={locked} placeholder="Producto, color o servicio"
          aria-label={`Producto ${n}`} role="combobox" aria-expanded={open} aria-autocomplete="list"
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 120)}
          onChange={e => onChange({ description: e.target.value })}
          onKeyDown={e => {
            if (!open) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(list.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(-1, a - 1)) }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(list[active]) }
            else if (e.key === 'Escape') setList([])
          }} />
        {open && (
          <div className={s.suggest} role="listbox" aria-label="Ya cotizado en tu tienda">
            {list.map((sg, i) => (
              <button key={sg.description} type="button" role="option" aria-selected={i === active}
                onMouseDown={e => { e.preventDefault(); choose(sg) }}>
                <span>{sg.description}</span><small>{sg.price ? fmtMoney(sg.price) : ''}{sg.unit ? ` / ${sg.unit}` : ''}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <input className={`${s.qty} ${s.num}`} inputMode="decimal" value={item.quantity} disabled={locked} placeholder="Cant." aria-label={`Cantidad del producto ${n}`}
        title="Cantidad" onChange={e => onChange({ quantity: e.target.value.replace(/[^\d.]/g, '') })} />
      <UnitInput value={item.unit} disabled={locked} label={`Unidad del producto ${n}`} onChange={unit => onChange({ unit })} />
      <span className={`${s.price} ${s.money}`}>
        <input className={s.num} inputMode="decimal" value={item.price} disabled={locked} placeholder="Precio" aria-label={`Precio unitario del producto ${n}, sin IVA`}
          title="Precio unitario sin IVA" onChange={e => onChange({ price: e.target.value.replace(/[^\d.]/g, '') })} />
      </span>
      <span className={s.lineTotal}>{fmtMoney(lineTotal({ quantity: num(item.quantity), price: num(item.price) }))}</span>
      {!locked && canRemove
        ? <button type="button" className={s.remove} onClick={onRemove} aria-label={`Quitar el producto ${n}`}><Trash2 aria-hidden="true" /></button>
        : null}
    </div>
  )
}

const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * Unidad: se elige de la lista (pza, L, galón…) o se escribe otra. Lista propia
 * en lugar de la del navegador, que no se ve igual en cada uno.
 */
function UnitInput({ value, disabled, label, onChange }: {
  value: string; disabled: boolean; label: string; onChange: (unit: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = plain(value)
  // Con una unidad ya elegida se ven todas (para cambiarla); al escribir, las que coinciden
  const options = UNIT_SUGGESTIONS.filter(u => !q || UNIT_SUGGESTIONS.some(x => plain(x) === q) || plain(u).includes(q))
  const show = open && !disabled && options.length > 0
  const pick = (u: string) => { onChange(u); setOpen(false); setActive(-1) }

  return (
    <span className={`${s.unit} ${s.unitWrap}`}>
      <input value={value} maxLength={20} disabled={disabled} placeholder="Unidad" aria-label={label} title="Unidad"
        role="combobox" aria-expanded={show} aria-autocomplete="list" autoComplete="off"
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(options.length - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(-1, a - 1)) }
          else if (e.key === 'Enter' && show && active >= 0) { e.preventDefault(); pick(options[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }} />
      {!disabled && <ChevronDown aria-hidden="true" />}
      {show && (
        <div className={s.suggest} role="listbox" aria-label="Unidades">
          {options.map((u, i) => (
            <button key={u} type="button" role="option" aria-selected={i === active || plain(u) === q}
              onMouseDown={e => { e.preventDefault(); pick(u) }}>
              <span>{u}</span>{plain(u) === q && <Check aria-hidden="true" className={s.unitCheck} />}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
