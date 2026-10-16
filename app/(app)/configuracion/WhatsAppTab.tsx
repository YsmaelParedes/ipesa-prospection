'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ico, Note, Panel, Spinner, WhatsAppGlyph, api, cx, fmtDate, send, useToast } from './ui'
import s from './configuracion.module.css'
import { tierLabel } from '@/lib/whatsappSafety'

// Sin datos técnicos: la conexión (credenciales y webhook) la hace el asesor desde su panel
type Connection = { connected: boolean; displayPhone: string | null; connectedAt: string | null; receivesMessages: boolean }
type Health = {
  displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string; messagingLimitTier?: string; nameStatus?: string
  canSendMessage?: string; healthNotes?: string[]
}

const QUALITY: Record<string, { label: string; cls: string }> = {
  GREEN:   { label: 'Alta', cls: s.bActive },
  YELLOW:  { label: 'Media', cls: s.bWarn },
  RED:     { label: 'Baja', cls: s.bDanger },
  UNKNOWN: { label: 'Sin datos', cls: s.bMuted },
}

/* ── Estado del número ──────────────────────────────────────────────────── */
function ConnectionPanel() {
  const [conn, setConn]     = useState<Connection | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError]   = useState('')

  useEffect(() => {
    (async () => {
      try {
        const c = await api<Connection>('/api/store/whatsapp')
        setConn(c)
        if (c.connected) setHealth((await api<{ health: Health | null }>('/api/whatsapp/status').catch(() => ({ health: null }))).health)
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [])

  if (error) return <Note kind="danger">{error}</Note>
  if (!conn) return <Panel icon={WhatsAppGlyph} tone="tWa" title="Tu número de WhatsApp"><Spinner /></Panel>

  const quality = QUALITY[health?.qualityRating ?? 'UNKNOWN'] ?? QUALITY.UNKNOWN
  return (
    <Panel icon={WhatsAppGlyph} tone="tWa" title="Tu número de WhatsApp" subtitle="El número con el que tu tienda atiende y envía promociones desde el CRM.">
      <div className={s.waHero}>
        <span className={cx(s.waBadge, !conn.connected && s.waBadgeOff)}><WhatsAppGlyph /></span>
        <div className={s.waMain}>
          <strong>{conn.connected ? (health?.displayPhoneNumber || conn.displayPhone || 'Número conectado') : 'En configuración'}</strong>
          <span>
            {conn.connected
              ? <>{health?.verifiedName ? `${health.verifiedName} · ` : ''}{conn.connectedAt ? `Conectado el ${fmtDate(conn.connectedAt, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Conectado'}</>
              : 'Tu asesor está terminando de conectar el número de tu tienda. Te avisará cuando quede listo.'}
          </span>
        </div>
        {conn.connected && <span className={cx(s.badge, s.bActive)}><i />Activo</span>}
      </div>
      {conn.connected && (
        <div className={s.kvs}>
          <div className={s.kv}><small>Calidad</small><strong><span className={cx(s.badge, quality.cls)} style={{ padding: '2px 9px' }}>{quality.label}</span></strong></div>
          <div className={s.kv}><small>Límite de envíos</small><strong>{tierLabel(health?.messagingLimitTier)}</strong></div>
        </div>
      )}
      {conn.connected && health?.qualityRating && health.qualityRating !== 'GREEN' && health.qualityRating !== 'UNKNOWN' && (
        <div style={{ marginTop: 14 }}>
          <Note kind="warn">La calidad del número bajó (bloqueos, reportes o pocas lecturas). Si sigue así, Meta puede pausar tus plantillas o restringir el número: envía solo a quien aceptó recibir tus mensajes y revisa tus plantillas.</Note>
        </div>
      )}
      {conn.connected && health?.canSendMessage === 'BLOCKED' && (
        <div style={{ marginTop: 14 }}>
          <Note kind="danger">Meta tiene bloqueado el envío desde este número. {(health.healthNotes ?? []).join(' ')}</Note>
        </div>
      )}
      {conn.connected && health?.canSendMessage === 'LIMITED' && !!health.healthNotes?.length && (
        <div style={{ marginTop: 14 }}>
          <Note kind="warn">{health.healthNotes.join(' ')}</Note>
        </div>
      )}
      {conn.connected && !conn.receivesMessages && (
        <div style={{ marginTop: 14 }}>
          <Note kind="danger">Por ahora no llegan los mensajes que te escriben tus clientes. Avísale a tu asesor para que lo revise.</Note>
        </div>
      )}
    </Panel>
  )
}

/* ── Respuestas rápidas ─────────────────────────────────────────────────── */
type QuickReply = { id: string; title: string; body: string }

function QuickRepliesPanel({ showToast }: { showToast: (m: string) => void }) {
  const [items, setItems]   = useState<QuickReply[] | null>(null)
  const [title, setTitle]   = useState('')
  const [body, setBody]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setItems((await api<{ items: QuickReply[] }>('/api/whatsapp/quick-replies')).items ?? []) }
    catch (err) { setError((err as Error).message); setItems([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api('/api/whatsapp/quick-replies', send('POST', { title: title.trim(), body: body.trim() }))
      setTitle('')
      setBody('')
      showToast('Respuesta rápida guardada')
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try { await api(`/api/whatsapp/quick-replies/${id}`, { method: 'DELETE' }); showToast('Respuesta eliminada') }
    catch (err) { setError((err as Error).message) }
    setConfirmDel(null)
    await load()
  }

  return (
    <Panel icon={Ico.bolt} tone="tMagenta" title="Respuestas rápidas" subtitle={<>Mensajes frecuentes que el equipo inserta en el chat con un clic. Usa <code>{'{nombre}'}</code> para el nombre del cliente.</>}>
      {!items ? <Spinner /> : (
        <div className={s.list}>
          {items.length === 0 && <div className={s.empty}>Aún no hay respuestas. Ideas: «Horario», «Ubicación», «Formas de pago».</div>}
          {items.map(q => (
            <div key={q.id} className={s.item} style={{ alignItems: 'flex-start', padding: '10px 10px 10px 14px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>{q.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{q.body}</div>
              </div>
              <span className={s.itemActions}>
                {confirmDel === q.id ? (
                  <>
                    <button className={cx(s.mini, s.miniDanger)} onClick={() => remove(q.id)}>Sí</button>
                    <button className={cx(s.mini, s.miniGhost)} onClick={() => setConfirmDel(null)}>No</button>
                  </>
                ) : (
                  <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDel(q.id)} title="Eliminar" aria-label={`Eliminar ${q.title}`}><Ico.trash /></button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14, background: 'var(--paper)', border: '1px solid var(--line)' }}>
        <input className={s.input} value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Título (ej. Horario)" aria-label="Título" />
        <textarea className={s.input} value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={3} style={{ resize: 'vertical' }}
          placeholder="¡Hola {nombre}! Abrimos de lunes a sábado de 9:00 a 19:00 h." aria-label="Mensaje" />
        {error && <div className={s.error}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={!title.trim() || !body.trim() || saving} style={{ alignSelf: 'flex-end' }}>
          <Ico.plus style={{ width: 14, height: 14 }} />{saving ? 'Guardando…' : 'Agregar respuesta'}
        </button>
      </form>
    </Panel>
  )
}

export function WhatsAppTab() {
  const [toast, showToast] = useToast()
  return (
    <>
      <ConnectionPanel />
      <QuickRepliesPanel showToast={showToast} />
      {toast}
    </>
  )
}
