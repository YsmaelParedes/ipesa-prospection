'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Avatar, fmtPhone } from '@/components/IpesaUI'

const Ico = {
  send:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>,
  chat:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, color: 'var(--muted-2)' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
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

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function fmtWhen(iso: string) {
  const d = new Date(iso), now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return time
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${time}`
}

export default function WhatsAppPage() {
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
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)', minHeight: 480 }}>
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
