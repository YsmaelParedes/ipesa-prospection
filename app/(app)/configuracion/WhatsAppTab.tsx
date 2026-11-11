'use client'

import { useCachedQuery, useQueryEffect } from '@/lib/useCachedQuery'


import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, Ico, Note, Spinner, WhatsAppGlyph, api, cx, fmtDate, send, useToast } from './ui'
import { invalidateSession } from '@/lib/profile'
import s from './configuracion.module.css'
import { tierLabel } from '@/lib/whatsappSafety'
import { ExternalLink } from 'lucide-react'

// Sin datos técnicos ni secretos. selfService: la tienda lo conectó sola (Embedded Signup) y puede desconectarlo
type Connection = {
  connected: boolean; displayPhone: string | null; connectedAt: string | null; receivesMessages: boolean
  selfService: boolean; coexistence: boolean
  history: { status: 'requested' | 'importing' | 'done' | 'declined' | 'failed' | null; imported: number; canRetry?: boolean } | null
  wabaId: string | null
}

const HISTORY_LABEL: Record<string, string> = {
  requested: 'En camino', importing: 'Llegando…', declined: 'No compartido', failed: 'No disponible',
}
const historyText = (h: NonNullable<Connection['history']>) =>
  h.status === 'done' || (h.imported > 0 && h.status !== 'importing')
    ? `${h.imported.toLocaleString('es-MX')} mensajes`
    : h.status === 'importing' ? `${h.imported.toLocaleString('es-MX')} y contando` : HISTORY_LABEL[h.status ?? ''] ?? 'Sin datos'
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
  const router = useRouter()
  const params = useSearchParams()
  const justConnected = params.get('conectado') === '1'
  const [toastNode, toast] = useToast()
  const [conn, setConn]     = useState<Connection | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [askingHistory, setAskingHistory] = useState(false)
  const healthQuery = useCachedQuery<{ health: Health | null }>(conn?.connected ? '/api/whatsapp/status' : null)
  const health = healthQuery.data?.health ?? null
  const [error, setError]   = useState('')

  useQueryEffect(() => {
    (async () => {
      try {
        const c = await api<Connection>('/api/store/whatsapp')
        setConn(c)
        setError('')
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [])

  if (error) return <Note kind="danger">{error}</Note>
  if (!conn) return <Card title="Tu número"><Spinner /></Card>

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await api('/api/store/whatsapp', { method: 'DELETE' })
      invalidateSession()
      router.replace('/configuracion?tab=whatsapp', { scroll: false })
    } catch (err) {
      setDisconnecting(false); setConfirmOff(false)
      setError('')
      toast((err as Error).message)
    }
  }

  // Coexistencia: el historial no se pidió o falló y Meta aún lo permite (24 h)
  const retryHistory = async () => {
    setAskingHistory(true)
    try {
      await api('/api/store/whatsapp/history', { method: 'POST' })
      setConn(c => c && c.history ? { ...c, history: { ...c.history, status: 'requested', canRetry: false } } : c)
      toast('Listo: pedimos tus chats a Meta. Irán apareciendo en la bandeja.')
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setAskingHistory(false)
    }
  }

  const quality = QUALITY[health?.qualityRating ?? 'UNKNOWN'] ?? QUALITY.UNKNOWN
  return (
    <>
    {toastNode}
    {justConnected && conn.connected && (
      <div className={s.waJustConnected} role="status">
        <Ico.check />
        <span><b>¡Listo! Tu WhatsApp quedó conectado.</b> Tus chats ya llegan a la bandeja. <a href="/whatsapp">Ir a WhatsApp →</a></span>
      </div>
    )}
    <Card title="Tu número" description="Con él tu tienda atiende a sus clientes desde el CRM.">
      <div className={s.cardBody}>
      <div className={s.waHero}>
        <span className={cx(s.waBadge, !conn.connected && s.waBadgeOff)}><WhatsAppGlyph /></span>
        <div className={s.waMain}>
          <strong>{conn.connected ? (health?.displayPhoneNumber || conn.displayPhone || 'Número conectado') : 'En configuración'}</strong>
          <span>
            {conn.connected
              ? <>{health?.verifiedName ? `${health.verifiedName} · ` : ''}{conn.connectedAt ? `Conectado el ${fmtDate(conn.connectedAt, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Conectado'}</>
              : conn.selfService
                ? 'La conexión con Meta quedó a medias. Termínala en esta misma pantalla.'
                : 'Tu asesor está terminando de conectar el número de tu tienda. Te avisará cuando quede listo.'}
          </span>
        </div>
        {conn.connected && <span className={cx(s.badge, s.bActive)}><i />Activo</span>}
      </div>
      {conn.connected && (
        <div className={s.kvs}>
          <div className={s.kv}><small>Calidad</small><strong><span className={cx(s.badge, quality.cls)} style={{ padding: '2px 9px' }}>{quality.label}</span></strong></div>
          <div className={s.kv}><small>Límite de envíos</small><strong>{tierLabel(health?.messagingLimitTier)}</strong></div>
          {conn.coexistence && <div className={s.kv}><small>En tu celular</small><strong>También activo</strong></div>}
          {conn.history && <div className={s.kv}><small>Chats importados</small><strong>{historyText(conn.history)}</strong></div>}
        </div>
      )}
      {conn.connected && conn.history?.status === 'declined' && (
        <div className={s.noteGap}>
          <Note kind="info">Tus chats anteriores no se trajeron porque en WhatsApp Business no se aceptó compartir el historial. Los mensajes nuevos sí llegan.</Note>
        </div>
      )}
      {conn.connected && conn.history?.canRetry && (
        <div className={s.noteGap}>
          <Note kind="warn">
            <b>Tus chats anteriores no llegaron.</b> Meta solo deja traerlos en las primeras 24 horas después de conectar.{' '}
            <button type="button" className={s.waInlineBtn} onClick={retryHistory} disabled={askingHistory}>
              {askingHistory ? 'Pidiéndolos…' : 'Pedirlos otra vez'}
            </button>
          </Note>
        </div>
      )}
      {conn.connected && conn.selfService && (
        <div className={s.noteGap}>
          <Note kind="warn">
            <b>Para escribirles tú primero</b> (plantillas), Meta pide una tarjeta en tu cuenta de WhatsApp. Responder a quien te escribe no cuesta.{' '}
            <a href={`https://business.facebook.com/wa/manage/home/${conn.wabaId ? `?waba_id=${encodeURIComponent(conn.wabaId)}` : ''}`} target="_blank" rel="noopener noreferrer">Agregar tarjeta en Meta <ExternalLink className="i-inline" /></a>
          </Note>
        </div>
      )}
      {conn.connected && health?.qualityRating && health.qualityRating !== 'GREEN' && health.qualityRating !== 'UNKNOWN' && (
        <div className={s.noteGap}>
          <Note kind="warn">La calidad del número bajó (bloqueos, reportes o pocas lecturas). Si sigue así, Meta puede pausar tus plantillas o restringir el número: envía solo a quien aceptó recibir tus mensajes y revisa tus plantillas.</Note>
        </div>
      )}
      {conn.connected && health?.canSendMessage === 'BLOCKED' && (
        <div className={s.noteGap}>
          <Note kind="danger">Meta tiene bloqueado el envío desde este número. {(health.healthNotes ?? []).join(' ')}</Note>
        </div>
      )}
      {conn.connected && health?.canSendMessage === 'LIMITED' && !!health.healthNotes?.length && (
        <div className={s.noteGap}>
          <Note kind="warn">{health.healthNotes.join(' ')}</Note>
        </div>
      )}
      {conn.connected && !conn.receivesMessages && (
        <div className={s.noteGap}>
          <Note kind="danger">Por ahora no llegan los mensajes que te escriben tus clientes. Avísale a tu asesor para que lo revise.</Note>
        </div>
      )}
      </div>
      {conn.selfService && (
        <div className={s.waFoot}>
          {confirmOff ? (
            <>
              <span>Matices dejará de recibir y enviar mensajes de este número. Tus chats guardados se quedan{conn.coexistence ? ' y tu celular sigue igual' : ''}.</span>
              <span className={s.waFootActions}>
                <button type="button" className="btn" onClick={() => setConfirmOff(false)} disabled={disconnecting}>Cancelar</button>
                <button type="button" className={cx('btn', s.waDanger)} onClick={disconnect} disabled={disconnecting}>{disconnecting ? 'Desconectando…' : 'Sí, desconectar'}</button>
              </span>
            </>
          ) : (
            <>
              <span>¿Cambiaste de número o ya no quieres usarlo aquí?</span>
              <button type="button" className={cx('btn', s.waDanger)} onClick={() => setConfirmOff(true)}>Desconectar</button>
            </>
          )}
        </div>
      )}
    </Card>
    </>
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
  useQueryEffect(() => { load() }, [load])

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
    <Card title="Respuestas rápidas" description={<>Mensajes frecuentes que el equipo inserta en el chat con un clic. Usa <code>{'{nombre}'}</code> para el nombre del cliente.</>}
      actions={items && <span className={s.count}>{items.length}</span>}>
      {!items ? <Spinner /> : (
        <ul className={s.list}>
          {items.length === 0 && <li className={s.empty}>Aún no hay respuestas. Ideas: «Horario», «Ubicación», «Formas de pago».</li>}
          {items.map(q => (
            <li key={q.id} className={s.item} style={{ alignItems: 'flex-start' }}>
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
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className={s.replyForm}>
        <input className={s.input} value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Título (ej. Horario)" aria-label="Título" />
        <textarea className={s.input} value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={3} style={{ resize: 'vertical' }}
          placeholder="¡Hola {nombre}! Abrimos de lunes a sábado de 9:00 a 19:00 h." aria-label="Mensaje" />
        {error && <div className={s.error}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={!title.trim() || !body.trim() || saving} style={{ alignSelf: 'flex-end' }}>
          <Ico.plus style={{ width: 14, height: 14 }} />{saving ? 'Guardando…' : 'Agregar respuesta'}
        </button>
      </form>
    </Card>
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
