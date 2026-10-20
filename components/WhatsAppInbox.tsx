'use client'

import { useQueryEffect } from '@/lib/useCachedQuery'


import { apiFetch, invalidateQueries } from '@/lib/apiClient'


import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Avatar, TipoChip, segmentColor } from '@/components/CrmUI'
import { StatusChip, nextLabel } from '@/components/CommercialUI'
import { todayISO } from '@/lib/commercial'
import { Select, toOptions } from '@/components/Select'
import { WhatsAppTemplatePicker, type WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import {
  Linkified, MediaContent, StatusTicks, WaIcon, WindowBadge,
  fmtDayLabel, fmtListWhen, fmtTime, mediaCaption,
} from '@/components/WhatsAppUI'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { isWindowOpen } from '@/lib/whatsappSafety'
import { MAX_CAPTION, MAX_SEND_BYTES, SEND_ACCEPT, SEND_TYPES, fmtSize, sendMimeOf } from '@/lib/whatsappFiles'
import { loadCatalogs, whatsappChannel, type Catalogs } from '@/lib/catalogs'
import { notifyDataChanged } from '@/lib/crmEvents'
import { useSession } from '@/lib/profile'
import type { NoWhatsApp } from '@/lib/campaignKinds'

/* ══════════════════════════════════════════════════════════════════════════
   Tipos
══════════════════════════════════════════════════════════════════════════ */
type Conversation = {
  phone: string
  contactId: string | null
  name: string | null
  profileName: string | null
  segment: string | null
  optOut: boolean
  lastBody: string | null
  lastDirection: 'inbound' | 'outbound'
  lastStatus: string
  lastMediaType: string | null
  lastTemplate: string | null
  lastAt: string
  unread: number
  lastInboundAt: string | null
  windowOpen: boolean
  /** Meta reportó que el número no tiene WhatsApp (puede ser un fijo): ya no se le envían campañas. */
  noWhatsApp?: boolean
}

type Message = {
  id: string
  phone: string
  direction: 'inbound' | 'outbound'
  body: string | null
  status: string
  error_message: string | null
  template_name: string | null
  media_id: string | null
  media_type: string | null
  media_mime: string | null
  created_at: string
}

type Contact = {
  id: string; name: string; phone: string; email: string | null; company: string | null
  segment: string | null; acquisition_channel: string | null; wa_opt_out: boolean
}

type CommercialLite = { status: string; next_action: string | null; next_action_at: string | null; last_note: string | null; mine: boolean }

type Thread = {
  phone: string
  messages: Message[]
  contact: Contact | null
  commercial: CommercialLite | null
  profileName: string | null
  lastInboundAt: string | null
  noWhatsApp: NoWhatsApp | null
}

type QuickReply = { id: string; title: string; body: string }
type Filter = 'all' | 'unread' | 'unknown'

/* ══════════════════════════════════════════════════════════════════════════
   Helpers
══════════════════════════════════════════════════════════════════════════ */

/** Ejecuta `fn` cada `ms` solo mientras la pestaña está visible (y al volver a ella). */
function useVisiblePolling(fn: () => void, ms: number, enabled = true) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    if (!enabled) return
    const tick = () => { if (document.visibilityState === 'visible') fnRef.current() }
    const t = setInterval(tick, ms)
    const onVisible = () => { if (document.visibilityState === 'visible') fnRef.current() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [ms, enabled])
}

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const byId = new Map(prev.filter(m => !m.id.startsWith('tmp-')).map(m => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  const pending = prev.filter(m => m.id.startsWith('tmp-'))
  return [...byId.values()]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .concat(pending)
}

const MEDIA_ICONS: Record<string, string> = { image: '📷', audio: '🎤', video: '🎥', document: '📄', sticker: '🏷️' }

function displayName(c: { name: string | null; profileName: string | null; phone: string }) {
  return c.name || (c.profileName ? `~ ${c.profileName}` : fmtPhone(c.phone))
}

const notifyUnreadChanged = () => { invalidateQueries(['/api/whatsapp/unread']); window.dispatchEvent(new CustomEvent('crm:wa-unread-changed')) }
const fmtShortDay = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

/* ══════════════════════════════════════════════════════════════════════════
   Bandeja
══════════════════════════════════════════════════════════════════════════ */
export default function WhatsAppInbox({ isAdmin }: { isAdmin: boolean }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const urlPhone     = normalizePhone(searchParams.get('phone') || '')

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingList, setLoadingList]     = useState(true)
  const [listError, setListError]         = useState('')
  const [hasMore, setHasMore]             = useState(false)
  const [filter, setFilter]               = useState<Filter>('all')
  const [search, setSearch]               = useState('')
  const [debounced, setDebounced]         = useState('')

  const [thread, setThread]               = useState<Thread | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [panelOpen, setPanelOpen]         = useState(false)
  // 'force': número sin WhatsApp, se intenta de todos modos (lo confirma quien envía)
  const [templateMode, setTemplateMode]   = useState<'normal' | 'force' | null>(null)
  const [newConvOpen, setNewConvOpen]     = useState(false)
  const [toast, setToast]                 = useState('')

  const listRequest = useRef(0)
  const threadRequest = useRef(0)
  const selectedRef = useRef<string | null>(null)
  const selected = /^\d{10}$/.test(urlPhone) ? urlPhone : null
  selectedRef.current = selected
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600) }

  // Panel del CRM abierto por defecto en pantallas anchas
  useEffect(() => {
    setPanelOpen(window.matchMedia('(min-width: 1281px)').matches)
  }, [])

  /* ── Lista de conversaciones ── */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadConversations = useCallback(async (opts: { append?: boolean } = {}) => {
    const request = ++listRequest.current
    try {
      const params = new URLSearchParams({ filter })
      if (debounced) params.set('q', debounced)
      if (opts.append && conversations.length) params.set('before', conversations[conversations.length - 1].lastAt)
      const r = await apiFetch(`/api/whatsapp/conversations?${params}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      if (request !== listRequest.current) return
      setConversations(prev => opts.append ? [...prev, ...d.conversations] : d.conversations)
      setHasMore(!!d.hasMore)
      setListError('')
    } catch (e: any) {
      if (request !== listRequest.current) return
      setListError(e?.message || 'No se pudieron cargar las conversaciones')
    } finally {
      if (request === listRequest.current) setLoadingList(false)
    }
  }, [filter, debounced, conversations])

  // Recarga completa al cambiar filtro/búsqueda (no depende de `conversations`)
  const loadRef = useRef(loadConversations)
  loadRef.current = loadConversations
  useQueryEffect(() => { loadRef.current() }, [filter, debounced])
  // The shared query scheduler polls the visible inbox every 15 seconds.

  /* ── Hilo seleccionado ── */
  const loadThread = useCallback(async (phone: string, { silent = false } = {}) => {
    const request = ++threadRequest.current
    if (!silent) setLoadingThread(true)
    try {
      // El encabezado pide marcar como leído (un enlace desde otro sitio no puede mandarlo)
      const r = await apiFetch(`/api/whatsapp/conversations/${phone}${silent ? '?limit=60' : ''}`, { headers: { 'x-crm-read': '1' } })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      if (request !== threadRequest.current || selectedRef.current !== phone) return
      setThread(prev => {
        if (silent && prev?.phone === phone) {
          return { ...prev, ...d, messages: mergeMessages(prev.messages, d.messages) }
        }
        return { phone, messages: d.messages, contact: d.contact, commercial: d.commercial ?? null, profileName: d.profileName, lastInboundAt: d.lastInboundAt, noWhatsApp: d.noWhatsApp ?? null }
      })
      if (d.markedRead > 0) {
        setConversations(prev => prev.map(c => c.phone === phone ? { ...c, unread: 0 } : c))
        notifyUnreadChanged()
      }
    } catch {
      if (!silent && request === threadRequest.current && selectedRef.current === phone) setThread({ phone, messages: [], contact: null, commercial: null, profileName: null, lastInboundAt: null, noWhatsApp: null })
    } finally {
      if (!silent && request === threadRequest.current) setLoadingThread(false)
    }
  }, [])

  useQueryEffect(() => {
    if (selected) loadThread(selected)
    else setThread(null)
  }, [selected, loadThread])
  useVisiblePolling(() => { if (selected) loadThread(selected, { silent: true }) }, 6_000, !!selected)

  // En móvil, con un chat abierto se oculta la barra inferior (el compositor va abajo)
  useEffect(() => {
    document.body.dataset.waThread = selected ? '1' : ''
    return () => { document.body.dataset.waThread = '' }
  }, [selected])

  const openConversation = (phone: string) => {
    router.replace(`${pathname}?phone=${phone}`, { scroll: false })
  }
  const closeConversation = () => router.replace(pathname, { scroll: false })

  const selectedConvo = conversations.find(c => c.phone === selected) ?? null
  const unreadTotal = conversations.filter(c => c.unread > 0).length

  return (
    <div className={`wa-inbox ${selected ? 'has-thread' : ''} ${panelOpen && selected ? 'with-panel' : ''}`}>
      {/* ── Lista ── */}
      <section className="wa-card wa-list-card" aria-label="Conversaciones">
        <div className="wa-list-head">
          <div className="wa-list-title">
            <span>Conversaciones</span>
            <button className="wa-chip-btn" onClick={() => setNewConvOpen(true)} title="Iniciar una conversación con un contacto">
              <WaIcon.plus size={14} /> Nueva
            </button>
          </div>
          <label className="wa-search">
            <WaIcon.search />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre o número…" aria-label="Buscar conversación" />
            {search && <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="wa-clear">×</button>}
          </label>
          <div className="wa-filters" role="tablist">
            {([['all', 'Todas'], ['unread', 'No leídas'], ['unknown', 'Sin contacto']] as [Filter, string][]).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={filter === key} className={`wa-filter ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
                {label}
                {key === 'unread' && unreadTotal > 0 && filter !== 'unread' && <span className="wa-filter-count">{unreadTotal}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="wa-list">
          {loadingList ? (
            <ListSkeleton />
          ) : listError ? (
            <div className="wa-empty small"><WaIcon.alert size={22} /><div>{listError}</div><button className="btn btn-ghost" onClick={() => loadConversations()}>Reintentar</button></div>
          ) : conversations.length === 0 ? (
            <div className="wa-empty small">
              <WaIcon.chat size={30} />
              <div>{debounced || filter !== 'all' ? 'Sin conversaciones con este filtro.' : 'Aquí aparecerán los chats cuando un cliente te escriba o le envíes una plantilla.'}</div>
            </div>
          ) : (
            <>
              {conversations.map(c => (
                <ConversationRow key={c.phone} c={c} active={c.phone === selected} onClick={() => openConversation(c.phone)} />
              ))}
              {hasMore && (
                <button className="wa-load-more" onClick={() => loadConversations({ append: true })}>Cargar más conversaciones</button>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Chat ── */}
      <section className="wa-card wa-thread-card" aria-label="Chat">
        {!selected ? (
          <div className="wa-empty">
            <div className="wa-empty-icon"><WaIcon.whatsapp size={34} /></div>
            <div className="wa-empty-title">Bandeja de WhatsApp</div>
            <div>Elige una conversación para leer y responder. Todo queda ligado al contacto y su seguimiento.</div>
          </div>
        ) : (
          <ChatView
            key={selected}
            phone={selected}
            thread={thread?.phone === selected ? thread : null}
            convo={selectedConvo}
            loading={loadingThread}
            isAdmin={isAdmin}
            onBack={closeConversation}
            onTogglePanel={() => setPanelOpen(o => !o)}
            panelOpen={panelOpen}
            onOpenTemplate={(force) => setTemplateMode(force ? 'force' : 'normal')}
            onMessageSent={(m) => {
              setThread(prev => prev && prev.phone === selected ? { ...prev, messages: mergeMessages(prev.messages, [m]) } : prev)
              loadRef.current()
            }}
            setThread={setThread}
          />
        )}
      </section>

      {/* ── Panel CRM ── */}
      {selected && (
        <>
          <div className={`wa-panel-scrim ${panelOpen ? 'open' : ''}`} onClick={() => setPanelOpen(false)} />
          <aside className={`wa-card wa-panel ${panelOpen ? 'open' : ''}`} aria-label="Ficha del CRM">
            <CrmPanel
              key={selected}
              phone={selected}
              thread={thread?.phone === selected ? thread : null}
              convo={selectedConvo}
              onClose={() => setPanelOpen(false)}
              onChanged={() => { loadThread(selected, { silent: true }); loadRef.current() }}
              toast={showToast}
            />
          </aside>
        </>
      )}

      {templateMode && selected && (
        <TemplateSendModal
          phone={selected}
          name={thread?.contact?.name || selectedConvo?.profileName || ''}
          force={templateMode === 'force'}
          onClose={() => setTemplateMode(null)}
          onSent={() => { setTemplateMode(null); showToast('Plantilla enviada ✓'); loadThread(selected, { silent: true }); loadRef.current() }}
        />
      )}

      {newConvOpen && (
        <NewConversationModal
          onClose={() => setNewConvOpen(false)}
          onPick={(phone) => { setNewConvOpen(false); openConversation(phone) }}
        />
      )}

      {toast && <div className="toast-fixed"><WaIcon.check /> {toast}</div>}
    </div>
  )
}

/* ── Fila de la lista ──────────────────────────────────────────────────── */
function ConversationRow({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  // El texto de un multimedia ya viene como "📷 Imagen · pie" desde el webhook
  const preview = c.lastTemplate && c.lastDirection === 'outbound'
    ? `Plantilla · ${c.lastBody ?? c.lastTemplate}`
    : c.lastBody || (c.lastMediaType ? MEDIA_ICONS[c.lastMediaType] ?? '' : '')
  return (
    <button className={`wa-conv ${active ? 'active' : ''}`} onClick={onClick} aria-current={active}>
      <span className="wa-avatar-wrap">
        <Avatar name={c.name || c.profileName || c.phone} size={42} />
        {isWindowOpen(c.lastInboundAt) && <span className="wa-online-dot" title="Ventana de 24 h abierta" />}
      </span>
      <span className="wa-conv-main">
        <span className="wa-conv-top">
          <span className={`wa-conv-name ${c.name ? '' : 'unknown'}`}>{displayName(c)}</span>
          <span className={`wa-conv-time ${c.unread ? 'unread' : ''}`}>{fmtListWhen(c.lastAt)}</span>
        </span>
        <span className="wa-conv-bottom">
          <span className="wa-conv-preview">
            {c.lastDirection === 'outbound' && <StatusTicks status={c.lastStatus} />}
            <span className="wa-ellipsis">{preview}</span>
          </span>
          {c.noWhatsApp && <span className="wa-nowa-tag" title="Meta reportó que no tiene WhatsApp: ya no se le envían campañas">Sin WhatsApp</span>}
          {c.optOut && <span className="wa-optout-mini" title="Pidió no recibir campañas"><WaIcon.ban size={12} /></span>}
          {c.unread > 0 && <span className="wa-unread">{c.unread > 99 ? '99+' : c.unread}</span>}
        </span>
      </span>
    </button>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div className="wa-conv skeleton" key={i}>
          <span className="sk sk-circle" />
          <span className="wa-conv-main"><span className="sk sk-line" style={{ width: '55%' }} /><span className="sk sk-line" style={{ width: '80%', marginTop: 7 }} /></span>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Chat
══════════════════════════════════════════════════════════════════════════ */
function ChatView({
  phone, thread, convo, loading, isAdmin, onBack, onTogglePanel, panelOpen, onOpenTemplate, onMessageSent, setThread,
}: {
  phone: string
  thread: Thread | null
  convo: Conversation | null
  loading: boolean
  isAdmin: boolean
  onBack: () => void
  onTogglePanel: () => void
  panelOpen: boolean
  onOpenTemplate: (force?: boolean) => void
  onMessageSent: (m: Message) => void
  setThread: React.Dispatch<React.SetStateAction<Thread | null>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const [showJump, setShowJump] = useState(false)

  const contact     = thread?.contact ?? null
  const profileName = thread?.profileName ?? convo?.profileName ?? null
  const title       = contact?.name || (profileName ? `~ ${profileName}` : fmtPhone(phone))
  const lastInbound = thread?.lastInboundAt ?? convo?.lastInboundAt ?? null
  const windowOpen  = isWindowOpen(lastInbound)
  const messages    = thread?.messages ?? []

  // Al abrir: hasta abajo. Con mensajes nuevos: seguir abajo solo si ya estabas ahí.
  const lastCount = useRef(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (lastCount.current === 0 || nearBottom.current) {
      el.scrollTop = el.scrollHeight
      setShowJump(false)
    } else if (messages.length > lastCount.current) {
      setShowJump(true)
    }
    lastCount.current = messages.length
  }, [messages.length])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom.current) setShowJump(false)
  }

  const jumpToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    setShowJump(false)
  }

  // Envío optimista: la burbuja aparece al instante y se confirma con el servidor
  const send = async (text: string) => {
    const tmp: Message = {
      id: `tmp-${Date.now()}`, phone, direction: 'outbound', body: text, status: 'pending',
      error_message: null, template_name: null, media_id: null, media_type: null, media_mime: null,
      created_at: new Date().toISOString(),
    }
    nearBottom.current = true
    setThread(prev => prev && prev.phone === phone ? { ...prev, messages: [...prev.messages, tmp] } : prev)
    try {
      const r = await apiFetch(`/api/whatsapp/conversations/${phone}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'No se pudo enviar')
      setThread(prev => prev && prev.phone === phone ? { ...prev, messages: prev.messages.filter(m => m.id !== tmp.id) } : prev)
      if (d.message) onMessageSent(d.message)
      return true
    } catch (e: any) {
      setThread(prev => prev && prev.phone === phone ? {
        ...prev, messages: prev.messages.map(m => m.id === tmp.id ? { ...m, status: 'failed', error_message: e?.message || 'No se pudo enviar' } : m),
      } : prev)
      return false
    }
  }

  // Archivos: se suben y envían en el servidor; regresa el error o null si salió
  const sendFile = async (file: File, caption: string): Promise<string | null> => {
    nearBottom.current = true
    try {
      const form = new FormData()
      form.append('file', file)
      if (caption) form.append('caption', caption)
      const r = await apiFetch(`/api/whatsapp/conversations/${phone}/media`, { method: 'POST', body: form })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return d.error || 'No se pudo enviar el archivo'
      if (d.message) onMessageSent(d.message)
      return null
    } catch {
      return 'Error de conexión al enviar el archivo'
    }
  }

  const discardFailed = (id: string) =>
    setThread(prev => prev ? { ...prev, messages: prev.messages.filter(m => m.id !== id) } : prev)

  // Un bloque por día: el separador es sticky dentro de su bloque, así el de
  // un día "empuja" al anterior en vez de encimarse con él al hacer scroll.
  const days = useMemo(() => {
    const out: { key: string; label: string; messages: Message[] }[] = []
    for (const m of messages) {
      const key = new Date(m.created_at).toDateString()
      if (out[out.length - 1]?.key !== key) out.push({ key, label: fmtDayLabel(m.created_at), messages: [] })
      out[out.length - 1].messages.push(m)
    }
    return out
  }, [messages])

  return (
    <>
      <header className="wa-thread-head">
        <button className="wa-icon-btn wa-back" onClick={onBack} aria-label="Volver a la lista"><WaIcon.back /></button>
        <button className="wa-thread-who" onClick={onTogglePanel} title="Ver ficha del CRM">
          <Avatar name={contact?.name || profileName || phone} size={38} />
          <span className="wa-thread-title">
            <span className="wa-thread-name">{title}</span>
            <span className="wa-thread-sub">
              {fmtPhone(phone)}
              {contact?.segment && <TipoChip value={contact.segment} small />}
              {!contact && <span className="wa-tag-muted">Sin registrar</span>}
              {thread?.noWhatsApp && <span className="wa-nowa-tag">Sin WhatsApp</span>}
            </span>
          </span>
        </button>
        <span className="wa-head-window"><WindowBadge lastInboundAt={lastInbound} /></span>
        <a className="wa-icon-btn wa-hide-sm" href={`tel:${phone}`} title="Llamar"><WaIcon.phone size={17} /></a>
        <button className={`wa-icon-btn ${panelOpen ? 'on' : ''}`} onClick={onTogglePanel} title="Ficha del CRM" aria-label="Ficha del CRM" aria-pressed={panelOpen}>
          <WaIcon.info />
        </button>
      </header>
      <div className="wa-window-mobile"><WindowBadge lastInboundAt={lastInbound} /></div>

      <div className="wa-messages" ref={scrollRef} onScroll={onScroll}>
        {loading && !messages.length ? (
          <div className="wa-thread-loading"><span className="wa-spinner" /></div>
        ) : messages.length === 0 ? (
          <div className="wa-empty small">
            <WaIcon.chat size={28} />
            <div>Aún no hay mensajes con {contact?.name || 'este número'}.<br />Para iniciar la conversación envía una plantilla aprobada.</div>
          </div>
        ) : days.map(d => (
          <div className="wa-day-group" key={d.key}>
            <div className="wa-day"><span>{d.label}</span></div>
            {d.messages.map(m => <Bubble key={m.id} m={m} onDiscard={() => discardFailed(m.id)} />)}
          </div>
        ))}
      </div>
      {showJump && <button className="wa-jump" onClick={jumpToBottom}>Nuevos mensajes ↓</button>}

      <Composer
        phone={phone}
        windowOpen={windowOpen}
        isAdmin={isAdmin}
        firstName={(contact?.name || profileName || '').split(/\s+/)[0] || ''}
        onSend={send}
        onSendFile={sendFile}
        onOpenTemplate={onOpenTemplate}
        noWhatsApp={thread?.noWhatsApp ?? null}
      />
    </>
  )
}

function Bubble({ m, onDiscard }: { m: Message; onDiscard: () => void }) {
  const out = m.direction === 'outbound'
  const caption = m.media_id ? mediaCaption(m.body) : m.body
  return (
    <div className={`wa-msg ${out ? 'out' : 'in'} ${m.status === 'failed' ? 'failed' : ''}`}>
      <div className="wa-bubble">
        {m.template_name && <div className="wa-template-tag"><WaIcon.template size={11} /> Plantilla · {m.template_name.replace(/_/g, ' ')}</div>}
        {m.media_id && m.media_type && <MediaContent mediaId={m.media_id} mediaType={m.media_type} mime={m.media_mime} />}
        {caption && <div className="wa-text"><Linkified text={caption} /></div>}
        <div className="wa-meta">
          <span>{fmtTime(m.created_at)}</span>
          {out && <StatusTicks status={m.status} />}
        </div>
        {m.status === 'failed' && (
          <div className="wa-error">
            {m.error_message || 'No se pudo entregar'}
            {m.id.startsWith('tmp-') && <button onClick={onDiscard} className="wa-error-x">Descartar</button>}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Compositor ────────────────────────────────────────────────────────── */
function Composer({ phone, windowOpen, isAdmin, firstName, onSend, onSendFile, onOpenTemplate, noWhatsApp }: {
  phone: string; windowOpen: boolean; isAdmin: boolean; firstName: string
  onSend: (text: string) => Promise<boolean>; onSendFile: (file: File, caption: string) => Promise<string | null>
  onOpenTemplate: (force?: boolean) => void
  noWhatsApp: NoWhatsApp | null
}) {
  const session = useSession()
  const draftKey = session?.store ? `crm:wa-draft:${session.user.id}:${session.store.id}:${phone}` : null
  const [draftState, setDraftState] = useState<{ key: string | null; value: string }>({ key: null, value: '' })
  const draft = draftState.key === draftKey ? draftState.value : ''
  function setDraft(value: string | ((current: string) => string)) {
    setDraftState(current => ({
      key: draftKey,
      value: typeof value === 'function' ? value(current.key === draftKey ? current.value : '') : value,
    }))
  }
  const [sending, setSending]   = useState(false)
  // Archivo adjunto (el texto del cuadro se manda como su comentario)
  const [file, setFile]         = useState<File | null>(null)
  const [fileUrl, setFileUrl]   = useState<string | null>(null)
  const [fileError, setFileError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])
  useEffect(() => { clearFile() }, [phone])   // al cambiar de chat no se arrastra el adjunto

  function clearFile() {
    setFile(null); setFileUrl(null); setFileError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const pickFile = (f: File | undefined) => {
    if (!f) return
    setFileError('')
    const mime = sendMimeOf(f.name, f.type)
    if (!mime) { setFileError('Ese tipo de archivo no se puede enviar. Usa foto (JPG o PNG), video MP4, PDF, Word, Excel, PowerPoint o texto.'); return }
    if (f.size > MAX_SEND_BYTES) { setFileError(`"${f.name}" pesa ${fmtSize(f.size)}; el máximo es ${fmtSize(MAX_SEND_BYTES)}.`); return }
    setFile(f)
    setFileUrl(SEND_TYPES[mime] === 'image' ? URL.createObjectURL(f) : null)
    inputRef.current?.focus()
  }
  const [quickOpen, setQuickOpen] = useState(false)
  const [quick, setQuick]       = useState<QuickReply[] | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const quickRef = useRef<HTMLDivElement>(null)

  // Borrador por usuario, tienda y conversación (se conserva al cambiar de chat).
  useEffect(() => {
    if (!draftKey) return
    let value = ''
    try { value = sessionStorage.getItem(draftKey) ?? '' } catch {}
    setDraftState({ key: draftKey, value })
  }, [draftKey])
  useEffect(() => {
    if (!draftKey || draftState.key !== draftKey) return
    try { draft ? sessionStorage.setItem(draftKey, draft) : sessionStorage.removeItem(draftKey) } catch {}
  }, [draft, draftKey, draftState.key])

  // Altura automática del textarea
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [draft])

  useQueryEffect(() => {
    if (!quickOpen) return
    apiFetch('/api/whatsapp/quick-replies').then(r => r.json()).then(d => setQuick(d.items ?? [])).catch(() => setQuick([]))
  }, [quickOpen])

  useEffect(() => {
    if (!quickOpen) return
    const h = (e: MouseEvent) => { if (!quickRef.current?.contains(e.target as Node)) setQuickOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [quickOpen])

  const submit = async () => {
    const text = draft.trim()
    if (file) {
      if (sending) return
      if (text.length > MAX_CAPTION) { setFileError(`El comentario del archivo puede tener hasta ${MAX_CAPTION} caracteres.`); return }
      setSending(true)
      setFileError('')
      const error = await onSendFile(file, text)
      setSending(false)
      if (error) { setFileError(error); return }
      clearFile()
      setDraft('')
      inputRef.current?.focus()
      return
    }
    if (!text || sending) return
    setSending(true)
    setDraft('')
    const ok = await onSend(text)
    if (!ok) setDraft(text)
    setSending(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // En escritorio Enter envía (Shift+Enter = salto). En táctil, Enter es salto de línea.
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const insertQuick = (q: QuickReply) => {
    const text = q.body.replace(/\{nombre\}/gi, firstName || '').replace(/\s{2,}/g, ' ')
    setDraft(d => (d.trim() ? `${d.trimEnd()} ${text}` : text))
    setQuickOpen(false)
    inputRef.current?.focus()
  }

  if (!windowOpen && noWhatsApp) {
    return (
      <div className="wa-composer">
        <div className="wa-closed-banner wa-nowa-banner">
          <WaIcon.ban size={16} />
          <div>
            <strong>Este número no tiene WhatsApp.</strong> Meta rechazó {noWhatsApp.failures === 1 ? 'el último envío' : `los últimos ${noWhatsApp.failures} envíos`} ({fmtShortDay(noWhatsApp.lastFailedAt)}). Puede ser un teléfono fijo: mejor llámale. Ya no se le incluye en campañas.
          </div>
        </div>
        <div className="wa-closed-actions">
          <a className="btn btn-primary" href={`tel:${phone}`}><WaIcon.phone /> Llamar</a>
          {isAdmin && <button className="btn btn-ghost" onClick={() => onOpenTemplate(true)}>Intentar de todos modos</button>}
        </div>
      </div>
    )
  }

  if (!windowOpen) {
    return (
      <div className="wa-composer">
        <div className="wa-closed-banner">
          <WaIcon.clock size={16} />
          <div>
            <strong>La ventana de 24 h está cerrada.</strong> WhatsApp solo permite escribir libremente durante las 24 h siguientes al último mensaje del cliente. Para retomar la conversación envía una plantilla aprobada.
          </div>
        </div>
        <div className="wa-closed-actions">
          {isAdmin ? (
            <button className="btn btn-primary" onClick={() => onOpenTemplate()}><WaIcon.template /> Enviar plantilla</button>
          ) : (
            <span className="wa-hint">Pide a un administrador que envíe una plantilla.</span>
          )}
          <a className="btn btn-ghost" href={`https://wa.me/52${phone}`} target="_blank" rel="noopener noreferrer"><WaIcon.external /> Abrir en mi WhatsApp</a>
        </div>
      </div>
    )
  }

  return (
    <div className="wa-composer">
      {(file || fileError) && (
        <div className="wa-attach">
          {file && (
            <div className="wa-attach-file">
              {fileUrl ? <img src={fileUrl} alt="" className="wa-attach-thumb" /> : <span className="wa-attach-icon"><WaIcon.file size={18} /></span>}
              <span className="wa-attach-name">
                <strong>{file.name}</strong>
                <small>{fmtSize(file.size)}{sending ? ' · enviando…' : ' · escribe un comentario si quieres'}</small>
              </span>
              <button className="wa-icon-btn" onClick={clearFile} disabled={sending} title="Quitar archivo" aria-label="Quitar archivo"><WaIcon.close size={16} /></button>
            </div>
          )}
          {fileError && <div className="wa-attach-error" role="alert">{fileError}</div>}
        </div>
      )}
      <div className="wa-composer-row">
        <input ref={fileRef} type="file" accept={SEND_ACCEPT} hidden onChange={e => pickFile(e.target.files?.[0])} />
        <button className={`wa-icon-btn ${file ? 'on' : ''}`} onClick={() => fileRef.current?.click()} disabled={sending}
          title="Adjuntar archivo (foto, PDF, Word, Excel…, hasta 4 MB)" aria-label="Adjuntar archivo">
          <WaIcon.clip />
        </button>
        <div className="wa-quick-wrap" ref={quickRef}>
          <button className={`wa-icon-btn ${quickOpen ? 'on' : ''}`} onClick={() => setQuickOpen(o => !o)} title="Respuestas rápidas" aria-label="Respuestas rápidas" aria-expanded={quickOpen}>
            <WaIcon.bolt />
          </button>
          {quickOpen && (
            <div className="wa-quick" role="menu">
              <div className="wa-quick-head">Respuestas rápidas</div>
              {quick === null ? (
                <div className="wa-quick-empty"><span className="wa-spinner sm" /></div>
              ) : quick.length === 0 ? (
                <div className="wa-quick-empty">Aún no hay respuestas rápidas.{isAdmin ? ' Créalas en Configuración → WhatsApp.' : ''}</div>
              ) : quick.map(q => (
                <button key={q.id} className="wa-quick-item" onClick={() => insertQuick(q)} role="menuitem">
                  <strong>{q.title}</strong>
                  <span>{q.body}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {isAdmin && (
          <button className="wa-icon-btn wa-hide-sm" onClick={() => onOpenTemplate()} title="Enviar plantilla" aria-label="Enviar plantilla"><WaIcon.template size={18} /></button>
        )}
        <textarea
          ref={inputRef}
          className="wa-input"
          rows={1}
          value={draft}
          maxLength={4096}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={file ? 'Comentario (opcional)' : 'Escribe un mensaje'}
          aria-label={file ? 'Comentario del archivo' : 'Mensaje'}
        />
        <button className="wa-send" onClick={submit} disabled={(!draft.trim() && !file) || sending} aria-label={file ? 'Enviar archivo' : 'Enviar'}>
          {sending ? <span className="wa-spinner light" /> : <WaIcon.send />}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Panel del CRM: contacto, sistema comercial, recordatorio, campañas
══════════════════════════════════════════════════════════════════════════ */
type ConfigLists = Catalogs

function CrmPanel({ phone, thread, convo, onClose, onChanged, toast }: {
  phone: string; thread: Thread | null; convo: Conversation | null
  onClose: () => void; onChanged: () => void; toast: (m: string) => void
}) {
  // Recibe/no recibe campañas solo tiene sentido en tiendas con Campañas
  const campaignsOn = !!useSession()?.store?.modules.campaigns
  const [config, setConfig] = useState<ConfigLists>({ segments: [], canales: [] })
  useQueryEffect(() => { loadCatalogs().then(setConfig).catch(() => {}) }, [])

  const contact = thread?.contact ?? null
  const profileName = thread?.profileName ?? convo?.profileName ?? null

  return (
    <div className="wa-panel-inner">
      <div className="wa-panel-top">
        <span>Ficha del CRM</span>
        <button className="wa-icon-btn" onClick={onClose} aria-label="Cerrar ficha"><WaIcon.close size={17} /></button>
      </div>

      {!thread ? (
        <div className="wa-thread-loading"><span className="wa-spinner" /></div>
      ) : contact ? (
        <>
          <section className="wa-panel-section wa-profile">
            <Avatar name={contact.name} size={60} />
            <div className="wa-profile-name">{contact.name}</div>
            <div className="wa-profile-phone">{fmtPhone(phone)}</div>
            {profileName && profileName !== contact.name && <div className="wa-profile-alias">En WhatsApp: ~ {profileName}</div>}
            <div className="wa-profile-chips">
              {contact.segment && <TipoChip value={contact.segment} small />}
              {contact.wa_opt_out && <span className="wa-optout-chip"><WaIcon.ban size={11} /> No recibe campañas</span>}
            </div>
            <div className="wa-profile-actions">
              <Link href={`/contactos?id=${contact.id}`} className="btn btn-ghost"><WaIcon.user /> Ver ficha</Link>
              <a href={`tel:${phone}`} className="btn btn-ghost"><WaIcon.phone /> Llamar</a>
            </div>
            {(contact.company || contact.email) && (
              <div className="wa-profile-meta">
                {contact.company && <div><span>Empresa</span>{contact.company}</div>}
                {contact.email && <div><span>Correo</span><a href={`mailto:${contact.email}`}>{contact.email}</a></div>}
              </div>
            )}
          </section>

          <CommercialSection contact={contact} commercial={thread.commercial} />
          <ReminderSection contact={contact} toast={toast} />
          {campaignsOn && <OptOutSection phone={phone} optOut={contact.wa_opt_out} onChanged={onChanged} toast={toast} />}
        </>
      ) : (
        <SaveContactSection phone={phone} profileName={profileName} config={config} onSaved={() => { onChanged(); notifyDataChanged('contact'); toast('Contacto guardado ✓') }} />
      )}
    </div>
  )
}

function SaveContactSection({ phone, profileName, config, onSaved }: {
  phone: string; profileName: string | null; config: ConfigLists; onSaved: () => void
}) {
  const [name, setName]       = useState(profileName ?? '')
  const [segment, setSegment] = useState('')
  const [canal, setCanal]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!segment && config.segments.length) setSegment(config.segments[0])
    if (!canal && config.canales.length) setCanal(whatsappChannel(config.canales))
  }, [config, segment, canal])

  const save = async () => {
    setSaving(true); setError('')
    try {
      const r = await apiFetch('/api/data/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone, segment, acquisition_channel: canal }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar'); return }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <section className="wa-panel-section">
      <div className="wa-unknown">
        <Avatar name={profileName || phone} size={52} />
        <div className="wa-profile-name">{profileName ? `~ ${profileName}` : fmtPhone(phone)}</div>
        <div className="wa-profile-phone">{fmtPhone(phone)}</div>
        <p>Este número aún no está en tus contactos. Guárdalo para ligar la conversación a su ficha, su seguimiento y sus recordatorios.</p>
      </div>
      <div className="field"><label>Nombre *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del cliente" /></div>
      <div className="field-row">
        <div className="field">
          <label>Segmento</label>
          <Select value={segment} onChange={setSegment} aria-label="Segmento" options={toOptions(config.segments, segmentColor)} placeholder="Elegir segmento" />
        </div>
        <div className="field">
          <label>Canal</label>
          <Select value={canal} onChange={setCanal} aria-label="Canal" options={toOptions(config.canales)} placeholder="Elegir canal" />
        </div>
      </div>
      {error && <div className="wa-form-error">{error}</div>}
      <button className="btn btn-primary wa-block" onClick={save} disabled={!name.trim() || saving}>
        <WaIcon.userPlus /> {saving ? 'Guardando…' : 'Guardar como contacto'}
      </button>
    </section>
  )
}

function CommercialSection({ contact, commercial }: { contact: Contact; commercial: CommercialLite | null }) {
  const today = todayISO()
  const next = commercial ? nextLabel(commercial.next_action_at, today) : null
  return (
    <section className="wa-panel-section">
      <div className="wa-panel-title">
        <span><WaIcon.leads size={13} /> Sistema comercial</span>
        <Link className="wa-link-btn" href={`/comercial?id=${contact.id}`}>Registrar →</Link>
      </div>
      {!commercial ? (
        <div className="wa-muted-box">Sin información comercial.</div>
      ) : (
        <div className="wa-lead-list">
          <Link href={`/comercial?id=${contact.id}`} className="wa-lead">
            <span className="wa-lead-top">
              <StatusChip value={commercial.status} />
              {next && commercial.next_action_at && <span className={`follow-chip ${next.tone}`}>{next.label}</span>}
            </span>
            <span className="wa-lead-sub">
              {commercial.next_action_at ? (commercial.next_action || 'Dar seguimiento') : commercial.mine ? 'Sin próxima acción' : 'Lo trabaja otra persona del equipo'}
            </span>
            {commercial.last_note && <span className="wa-lead-sub" style={{ whiteSpace: 'pre-wrap' }}>{commercial.last_note.slice(0, 160)}</span>}
          </Link>
        </div>
      )}
    </section>
  )
}

function ReminderSection({ contact, toast }: { contact: Contact; toast: (m: string) => void }) {
  const [when, setWhen]   = useState<'1h' | 'tomorrow' | 'monday'>('tomorrow')
  const [nota, setNota]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const target = () => {
    const d = new Date()
    if (when === '1h') d.setHours(d.getHours() + 1)
    if (when === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0) }
    if (when === 'monday') { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0) }
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const r = await apiFetch('/api/data/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nota: nota.trim() || `Dar seguimiento por WhatsApp a ${contact.name}`,
          fecha_recordatorio: target(),
          type: 'whatsapp', priority: 'medium',
          lead_id: null,
          lead_name: contact.name,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo crear'); return }
      setNota('')
      toast('Recordatorio creado ✓')
      notifyDataChanged('reminder')
    } finally { setSaving(false) }
  }

  return (
    <section className="wa-panel-section">
      <div className="wa-panel-title"><span><WaIcon.bell size={13} /> Recordatorio de seguimiento</span></div>
      <div className="wa-seg">
        {([['1h', 'En 1 hora'], ['tomorrow', 'Mañana 9am'], ['monday', 'Lunes 9am']] as const).map(([k, label]) => (
          <button key={k} className={when === k ? 'active' : ''} onClick={() => setWhen(k)}>{label}</button>
        ))}
      </div>
      <input className="wa-text-input" value={nota} onChange={e => setNota(e.target.value)} maxLength={1000} placeholder={`Dar seguimiento a ${contact.name.split(' ')[0]}…`} />
      {error && <div className="wa-form-error">{error}</div>}
      <button className="btn btn-ghost wa-block" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Crear recordatorio'}</button>
    </section>
  )
}

function OptOutSection({ phone, optOut, onChanged, toast }: { phone: string; optOut: boolean; onChanged: () => void; toast: (m: string) => void }) {
  const [saving, setSaving] = useState(false)
  const toggle = async () => {
    setSaving(true)
    try {
      const r = await apiFetch(`/api/whatsapp/conversations/${phone}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optOut: !optOut }),
      })
      if (r.ok) { toast(optOut ? 'Volverá a recibir campañas' : 'Ya no recibirá campañas'); notifyDataChanged('contact'); onChanged() }
    } finally { setSaving(false) }
  }
  return (
    <section className="wa-panel-section">
      <div className="wa-panel-title"><span><WaIcon.megaphone size={13} /> Campañas</span></div>
      <label className="wa-switch-row">
        <span>
          <strong>Recibe campañas</strong>
          <small>{optOut ? 'Pidió no recibir promociones: se excluye de todas las campañas.' : 'Se incluye al enviar plantillas de marketing.'}</small>
        </span>
        <button role="switch" aria-checked={!optOut} className={`wa-switch ${!optOut ? 'on' : ''}`} onClick={toggle} disabled={saving}><span /></button>
      </label>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Modales
══════════════════════════════════════════════════════════════════════════ */
function TemplateSendModal({ phone, name, force = false, onClose, onSent }: { phone: string; name: string; force?: boolean; onClose: () => void; onSent: () => void }) {
  const [selection, setSelection] = useState<WhatsAppTemplateSelection | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    if (!selection?.ready) return
    setSending(true); setError('')
    try {
      const r = await apiFetch('/api/whatsapp/campaigns/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone, template: selection.templateName, language: selection.language, category: selection.category,
          headerImageUrl: selection.savedImageUrl || undefined, personalize: selection.personalize,
          bodyPreview: selection.bodyPreview, bodyParams: selection.bodyParams, force,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.ok === false) { setError(d.error || 'No se pudo enviar'); return }
      onSent()
    } finally { setSending(false) }
  }

  return (
    <div className="modal" onClick={sending ? undefined : onClose}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Enviar plantilla</h3>
          <button className="modal-close btn-icon" onClick={onClose} disabled={sending} aria-label="Cerrar"><WaIcon.close size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="wa-modal-to">Para: <strong>{name || fmtPhone(phone)}</strong> · {fmtPhone(phone)}</div>
          {force && (
            <div className="wa-warn" style={{ marginTop: 0, marginBottom: 12 }}>
              Meta reportó que este número no tiene WhatsApp, así que lo más probable es que vuelva a fallar. Si esta vez se entrega, el número vuelve a estar disponible para campañas.
            </div>
          )}
          <WhatsAppTemplatePicker exampleName={(name || 'Cliente').split(/\s+/)[0]} onChange={setSelection} />
          {error && <div className="wa-form-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={sending}>Cancelar</button>
          <button className="btn btn-primary" onClick={send} disabled={!selection?.ready || sending}>
            <WaIcon.send size={15} /> {sending ? 'Enviando…' : 'Enviar plantilla'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewConversationModal({ onClose, onPick }: { onClose: () => void; onPick: (phone: string) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')

  useQueryEffect(() => {
    apiFetch('/api/data/contacts').then(r => r.json()).then(d => setContacts(d.contacts ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const digits = q.replace(/\D/g, '')
  const typedPhone = normalizePhone(digits)
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    const list = n ? contacts.filter(c => c.name.toLowerCase().includes(n) || (digits.length >= 3 && c.phone.includes(digits))) : contacts
    return list.slice(0, 80)
  }, [contacts, q, digits])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Nueva conversación</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><WaIcon.close size={16} /></button>
        </div>
        <div className="wa-modal-search">
          <label className="wa-search">
            <WaIcon.search />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar contacto o escribir un número…" />
          </label>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {typedPhone.length === 10 && !contacts.some(c => normalizePhone(c.phone) === typedPhone) && (
            <button className="wa-pick" onClick={() => onPick(typedPhone)}>
              <span className="wa-pick-icon"><WaIcon.plus /></span>
              <span><strong>Abrir chat con {fmtPhone(typedPhone)}</strong><small>Número que no está en contactos</small></span>
            </button>
          )}
          {loading ? (
            <div className="wa-thread-loading"><span className="wa-spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="wa-empty small">Sin contactos que coincidan.</div>
          ) : filtered.map(c => (
            <button key={c.id} className="wa-pick" onClick={() => onPick(normalizePhone(c.phone))}>
              <Avatar name={c.name} size={36} />
              <span><strong>{c.name}</strong><small>{fmtPhone(c.phone)}{c.segment ? ` · ${c.segment}` : ''}</small></span>
              {c.wa_opt_out && <span className="wa-optout-chip"><WaIcon.ban size={11} /> Baja</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
