'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Avatar, TipoChip, fmtPhone } from '@/components/IpesaUI'
import { WhatsAppTemplatePicker, type WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import { useWhatsAppCampaignQuota, CampaignQuotaNote } from '@/components/WhatsAppCampaignQuota'
import { getUserRole } from '@/lib/profile'

const Ico = {
  send:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>,
  chat:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, color: 'var(--muted-2)' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  megaphone: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
  check:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m5 13 4 4L19 7"/></svg>,
  search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--muted-2)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
}

type Conversation = {
  phone: string
  name: string | null
  lastMessage: string | null
  lastDirection: 'inbound' | 'outbound'
  lastAt: string
  unread: number
}

type Message = {
  id: string
  phone: string
  direction: 'inbound' | 'outbound'
  body: string | null
  status: string
  error_message: string | null
  created_at: string
}

type Contact = { id: string; name: string; phone: string; segment?: string | null }

const SEGMENTOS_DEFAULT = ['Constructor', 'Arquitecto', 'Hogar', 'Empresa']

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function fmtWhen(iso: string) {
  const d = new Date(iso), now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return time
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${time}`
}

export default function WhatsAppPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [tab, setTab] = useState<'bandeja' | 'campanas'>('bandeja')

  useEffect(() => { getUserRole().then(r => setIsAdmin(r === 'admin')) }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: 'calc(100vh - 140px)', minHeight: 480 }}>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 4, background: 'var(--paper)', padding: 4, borderRadius: 11, width: 'fit-content' }}>
          <button
            onClick={() => setTab('bandeja')}
            className="btn"
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: tab === 'bandeja' ? 'var(--card)' : 'transparent',
              color: tab === 'bandeja' ? 'var(--ink)' : 'var(--muted)',
              boxShadow: tab === 'bandeja' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Ico.chat /> Bandeja
          </button>
          <button
            onClick={() => setTab('campanas')}
            className="btn"
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: tab === 'campanas' ? 'var(--card)' : 'transparent',
              color: tab === 'campanas' ? 'var(--ink)' : 'var(--muted)',
              boxShadow: tab === 'campanas' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Ico.megaphone /> Campañas
          </button>
        </div>
      )}

      {tab === 'bandeja' ? <InboxPanel /> : <CampaignsPanel />}
    </div>
  )
}

/* ── Bandeja de entrada ── */
function InboxPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<string | null>(null)
  const [messages, setMessages]       = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [draft, setDraft]             = useState('')
  const [sending, setSending]         = useState(false)
  const [sendError, setSendError]     = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch('/api/whatsapp/conversations')
      const d = await r.json()
      setConversations(d.conversations || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadConversations()
    const t = setInterval(loadConversations, 20000)
    return () => clearInterval(t)
  }, [loadConversations])

  const openConversation = useCallback(async (phone: string) => {
    setSelected(phone)
    setLoadingThread(true)
    setSendError('')
    try {
      const r = await fetch(`/api/whatsapp/conversations/${phone}`)
      const d = await r.json()
      setMessages(d.messages || [])
      setConversations(prev => prev.map(c => c.phone === phone ? { ...c, unread: 0 } : c))
    } catch {} finally { setLoadingThread(false) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!selected || !draft.trim() || sending) return
    setSending(true); setSendError('')
    const text = draft.trim()
    try {
      const r = await fetch(`/api/whatsapp/conversations/${selected}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const d = await r.json()
      if (!r.ok) { setSendError(d.error || 'Error al enviar'); return }
      setMessages(prev => [...prev, d.message])
      setDraft('')
      loadConversations()
    } catch {
      setSendError('Error de red')
    } finally {
      setSending(false)
    }
  }

  const selectedConvo = conversations.find(c => c.phone === selected)

  return (
    <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
      {/* Lista de conversaciones */}
      <div style={{
        width: 320, flexShrink: 0, background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 14 }}>
          Conversaciones {conversations.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({conversations.length})</span>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Sin conversaciones todavía. Aquí aparecerán cuando un contacto te escriba o le mandes un mensaje.
            </div>
          ) : conversations.map(c => (
            <button
              key={c.phone}
              onClick={() => openConversation(c.phone)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--line)',
                background: selected === c.phone ? 'var(--paper)' : 'transparent', cursor: 'pointer',
              }}
            >
              <Avatar name={c.name || c.phone} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name || fmtPhone(c.phone)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{fmtWhen(c.lastAt)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {c.lastDirection === 'outbound' ? 'Tú: ' : ''}{c.lastMessage || ''}
                  </span>
                  {c.unread > 0 && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'var(--ipesa-orange)', borderRadius: 20, minWidth: 18, height: 18, display: 'grid', placeItems: 'center', padding: '0 5px', flexShrink: 0 }}>
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Hilo de conversación */}
      <div style={{
        flex: 1, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
      }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)' }}>
            <Ico.chat />
            <div style={{ fontSize: 13.5 }}>Selecciona una conversación para ver los mensajes</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={selectedConvo?.name || selected} size={32} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{selectedConvo?.name || fmtPhone(selected)}</div>
                {selectedConvo?.name && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{fmtPhone(selected)}</div>}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loadingThread ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                </div>
              ) : messages.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '70%', padding: '9px 13px', borderRadius: 14,
                    background: m.direction === 'outbound' ? 'var(--ipesa-orange)' : 'var(--paper)',
                    color: m.direction === 'outbound' ? '#fff' : 'var(--ink)',
                    borderBottomRightRadius: m.direction === 'outbound' ? 4 : 14,
                    borderBottomLeftRadius:  m.direction === 'outbound' ? 14 : 4,
                  }}>
                    <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.75, textAlign: 'right' }}>
                      {fmtWhen(m.created_at)}
                      {m.direction === 'outbound' && m.status === 'failed' && ' · falló'}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
              {sendError && <div style={{ fontSize: 12, color: 'var(--ipesa-rose)', marginBottom: 8 }}>{sendError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Escribe un mensaje… (solo funciona si el contacto escribió en las últimas 24h)"
                  style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 22, background: 'var(--paper)', fontSize: 13.5, outline: 'none' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="btn btn-primary"
                  style={{ borderRadius: '50%', width: 42, height: 42, padding: 0, justifyContent: 'center', flexShrink: 0 }}
                >
                  <Ico.send />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Campañas: elegir contactos + plantilla y enviar ── */
function CampaignsPanel() {
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [segmentos, setSegmentos] = useState<string[]>(SEGMENTOS_DEFAULT)
  const [segmentFilter, setSegmentFilter] = useState('Todos')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<WhatsAppTemplateSelection | null>(null)
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  const [results, setResults]     = useState<{ sent: number; failed: number; details: any[] } | null>(null)
  const { quota, refetch: refetchQuota } = useWhatsAppCampaignQuota()

  useEffect(() => {
    fetch('/api/data/contacts')
      .then(r => r.json())
      .then(d => setContacts((d.contacts || []).filter((c: any) => !!c.phone)))
      .catch(() => {})
      .finally(() => setLoading(false))
    fetch('/api/data/config?type=segment')
      .then(r => r.json())
      .then(d => { if (d.items?.length) setSegmentos(d.items.map((i: any) => i.label)) })
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter(c => {
      if (segmentFilter !== 'Todos' && c.segment !== segmentFilter) return false
      if (!q) return true
      return c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
    })
  }, [contacts, search, segmentFilter])

  const toggle = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAllFiltered = () => setCheckedIds(prev => {
    const next = new Set(prev)
    const cap = quota?.maxPerRequest ?? Infinity
    for (const c of filtered) {
      if (next.size >= cap) break
      next.add(c.id)
    }
    return next
  })
  const clearSelection = () => setCheckedIds(new Set())

  const selectedContacts = contacts.filter(c => checkedIds.has(c.id))
  const exampleName = (selectedContacts[0]?.name || 'Cliente').trim().split(/\s+/)[0]
  const overQuota = !!quota && (selectedContacts.length > quota.maxPerRequest || selectedContacts.length > quota.remaining)
  const canSend = !!selection?.ready && !sending && selectedContacts.length > 0 && !overQuota

  const handleSend = async () => {
    if (!selection) return
    setSending(true); setError('')
    try {
      const r = await fetch('/api/whatsapp/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: [...checkedIds], template: selection.templateName, language: selection.language,
          headerImageUrl: selection.savedImageUrl || undefined, personalize: selection.personalize,
          bodyPreview: selection.bodyPreview,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error al enviar la campaña'); return }
      setResults({ sent: d.sent, failed: d.failed, details: d.results })
      refetchQuota()
    } catch {
      setError('Error de red al enviar')
    } finally {
      setSending(false)
    }
  }

  if (results) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 20, maxWidth: 560 }}>
        <h3 style={{ margin: '0 0 14px' }}>Resultado del envío</h3>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: '14px', background: 'var(--ipesa-green-soft)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ipesa-green)' }}>{results.sent}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>enviados</div>
          </div>
          <div style={{ flex: 1, padding: '14px', background: results.failed > 0 ? 'var(--ipesa-rose-soft)' : 'var(--paper)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: results.failed > 0 ? 'var(--ipesa-rose)' : 'var(--muted)' }}>{results.failed}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>fallidos</div>
          </div>
        </div>
        {results.failed > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
            {results.details.filter((r: any) => !r.ok).map((r: any, i: number) => (
              <div key={i} style={{ padding: '8px 12px', background: 'var(--paper)', borderRadius: 8, fontSize: 12.5 }}>
                <strong>{r.name || 'Contacto'}</strong>: <span style={{ color: 'var(--ipesa-rose)' }}>{r.error}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary" onClick={() => { setResults(null); clearSelection() }}>
          Enviar otra campaña
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
      {/* Selector de contactos */}
      <div style={{
        width: 320, flexShrink: 0, background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
            Contactos {checkedIds.size > 0 && <span style={{ color: 'var(--ipesa-orange)', fontWeight: 600 }}>({checkedIds.size} elegidos)</span>}
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}><Ico.search /></span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar nombre o teléfono…"
              style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--paper)', fontSize: 13, outline: 'none' }}
            />
          </div>
          <select
            value={segmentFilter}
            onChange={e => setSegmentFilter(e.target.value)}
            style={{ width: '100%', marginTop: 8, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--paper)', fontSize: 12.5, outline: 'none' }}
          >
            <option value="Todos">Todos los tipos</option>
            {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 12 }}>
            <button onClick={selectAllFiltered} style={{ background: 'none', border: 'none', color: 'var(--ipesa-orange)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              Elegir todos {(search || segmentFilter !== 'Todos') ? `(${filtered.length})` : ''}
            </button>
            {checkedIds.size > 0 && (
              <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Sin contactos con teléfono que coincidan.
            </div>
          ) : filtered.map(c => (
            <label
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '10px 16px', borderBottom: '1px solid var(--line)', cursor: 'pointer',
                background: checkedIds.has(c.id) ? 'var(--paper)' : 'transparent',
              }}
            >
              <input type="checkbox" checked={checkedIds.has(c.id)} onChange={() => toggle(c.id)} />
              <Avatar name={c.name || c.phone} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name || fmtPhone(c.phone)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{fmtPhone(c.phone)}</span>
                  {c.segment && <TipoChip value={c.segment} small />}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Plantilla + envío */}
      <div style={{
        flex: 1, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <WhatsAppTemplatePicker exampleName={exampleName} onChange={setSelection} />
          <CampaignQuotaNote quota={quota} selectedCount={selectedContacts.length} />
          {error && <div style={{ color: 'var(--ipesa-rose)', fontSize: 12.5, marginTop: 12 }}>{error}</div>}
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            {selectedContacts.length === 0
              ? 'Elige al menos un contacto de la lista.'
              : <>Se enviará a <strong>{selectedContacts.length}</strong> contacto{selectedContacts.length !== 1 ? 's' : ''}.</>}
          </span>
          <button className="btn btn-primary" onClick={handleSend} disabled={!canSend}>
            <Ico.send /> {sending ? 'Enviando…' : `Enviar a ${selectedContacts.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
