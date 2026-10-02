'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ico, Note, Panel, Spinner, WhatsAppGlyph, api, copyText, cx, fmtDate, send, useToast } from './ui'
import s from './configuracion.module.css'

type Connection = {
  connected: boolean
  source: 'store' | 'env'
  phoneNumberId: string | null
  wabaId: string | null
  displayPhone: string | null
  hasAppSecret: boolean
  connectedAt: string | null
  encryptionReady: boolean
  webhook: { url: string; verifyToken: string | null }
}
type Health = { displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string; messagingLimitTier?: string; nameStatus?: string }

const QUALITY: Record<string, { label: string; cls: string }> = {
  GREEN:   { label: 'Alta', cls: s.bActive },
  YELLOW:  { label: 'Media', cls: s.bWarn },
  RED:     { label: 'Baja', cls: s.bDanger },
  UNKNOWN: { label: 'Sin datos', cls: s.bMuted },
}
const TIERS: Record<string, string> = {
  TIER_50: '50 clientes/día', TIER_250: '250 clientes/día', TIER_1K: '1,000 clientes/día',
  TIER_10K: '10,000 clientes/día', TIER_100K: '100,000 clientes/día', TIER_UNLIMITED: 'Sin límite',
}
const tierLabel = (tier?: string) => (tier ? TIERS[tier] ?? tier : '—')

/* ── Conexión ───────────────────────────────────────────────────────────── */
function CopyField({ label, value, onCopied }: { label: string; value: string; onCopied: () => void }) {
  return (
    <div className={s.copyField}>
      <label>{label}</label>
      <input className={cx(s.input, s.mono)} readOnly value={value} onFocus={e => e.currentTarget.select()} aria-label={label} />
      <button type="button" className="btn btn-ghost" onClick={async () => { if (await copyText(value)) onCopied() }}>
        <Ico.copy style={{ width: 14, height: 14 }} />Copiar
      </button>
    </div>
  )
}

function ConnectForm({ encryptionReady, onConnected, onCancel }: { encryptionReady: boolean; onConnected: (msg: string) => void; onCancel?: () => void }) {
  const [f, setF]       = useState({ accessToken: '', phoneNumberId: '', wabaId: '', appSecret: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, digits = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: digits ? e.target.value.replace(/\D/g, '') : e.target.value.trim() }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const d = await api<{ displayPhone: string | null; verifiedName: string | null }>('/api/store/whatsapp', send('PUT', f))
      onConnected(`Conectado${d.displayPhone ? ` · ${d.displayPhone}` : ''}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      {!encryptionReady && (
        <div style={{ marginBottom: 14 }}>
          <Note kind="warn">El servidor aún no tiene la llave de cifrado (<code>CREDENTIALS_ENCRYPTION_KEY</code>), así que no puede guardar credenciales. Avisa al administrador de la plataforma.</Note>
        </div>
      )}
      <div className={s.formGrid}>
        <div className={cx('field', s.span2)}>
          <label htmlFor="wa-token">Token de acceso permanente</label>
          <input id="wa-token" type="password" autoComplete="off" value={f.accessToken} onChange={set('accessToken')} placeholder="EAAG…" required className={s.mono} />
          <div className="field-hint">De un usuario del sistema con permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</div>
        </div>
        <div className="field">
          <label htmlFor="wa-phone">Identificador del número (Phone number ID)</label>
          <input id="wa-phone" inputMode="numeric" value={f.phoneNumberId} onChange={set('phoneNumberId', true)} placeholder="123456789012345" required className={s.mono} />
        </div>
        <div className="field">
          <label htmlFor="wa-waba">Identificador de la cuenta (WABA ID)</label>
          <input id="wa-waba" inputMode="numeric" value={f.wabaId} onChange={set('wabaId', true)} placeholder="102030405060708" required className={s.mono} />
        </div>
        <div className={cx('field', s.span2)}>
          <label htmlFor="wa-secret">Clave secreta de la app (App Secret)</label>
          <input id="wa-secret" type="password" autoComplete="off" value={f.appSecret} onChange={set('appSecret')} placeholder="32 caracteres" required maxLength={32} className={s.mono} />
          <div className="field-hint">Con ella comprobamos que los mensajes que llegan vienen de verdad de Meta.</div>
        </div>
      </div>
      {error && <div className={s.error}>{error}</div>}
      <div className={s.formFoot}>
        <small><Ico.lock style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 4 }} />Se guardan cifrados y no se vuelven a mostrar.</small>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="btn btn-primary" disabled={busy || !encryptionReady}>{busy ? 'Verificando con Meta…' : 'Verificar y conectar'}</button>
      </div>
    </form>
  )
}

function ConnectionPanels({ isOwner, showToast, onStatus }: { isOwner: boolean; showToast: (m: string) => void; onStatus: (connected: boolean) => void }) {
  const [conn, setConn]     = useState<Connection | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError]   = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [busy, setBusy]     = useState(false)

  const load = useCallback(async () => {
    try {
      const c = await api<Connection>('/api/store/whatsapp')
      setConn(c)
      onStatus(c.connected)
      setHealth(c.connected ? (await api<{ health: Health | null }>('/api/whatsapp/status').catch(() => ({ health: null }))).health : null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [onStatus])
  useEffect(() => { load() }, [load])

  const disconnect = async () => {
    setBusy(true)
    try {
      await api('/api/store/whatsapp', { method: 'DELETE' })
      showToast('WhatsApp desconectado')
      setConfirmOff(false)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Note kind="danger">{error}</Note>
  if (!conn) return <Panel icon={WhatsAppGlyph} tone="tWa" title="Conexión de WhatsApp"><Spinner /></Panel>

  const envSource = conn.source === 'env'
  const quality = QUALITY[health?.qualityRating ?? 'UNKNOWN'] ?? QUALITY.UNKNOWN
  const webhookPanel = (
    <Panel icon={Ico.link} tone="tInk" title="Webhook para recibir mensajes" subtitle="Configúralo en tu app de Meta: WhatsApp → Configuración → Webhook. Después suscribe el campo messages.">
      <CopyField label="URL de devolución" value={conn.webhook.url} onCopied={() => showToast('URL copiada')} />
      {conn.webhook.verifyToken
        ? <CopyField label="Token de verificación" value={conn.webhook.verifyToken} onCopied={() => showToast('Token copiado')} />
        : <Note>Esta tienda usa la conexión del servidor: el token de verificación es la variable <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>.</Note>}
    </Panel>
  )

  return (
    <>
      <Panel icon={WhatsAppGlyph} tone="tWa" title="Conexión de WhatsApp" subtitle="Cada tienda usa su propio número de WhatsApp Business con la API oficial de Meta.">
        <div className={s.waHero}>
          <span className={cx(s.waBadge, !conn.connected && s.waBadgeOff)}><WhatsAppGlyph /></span>
          <div className={s.waMain}>
            <strong>{conn.connected ? (health?.displayPhoneNumber || conn.displayPhone || 'Número conectado') : 'Sin conectar'}</strong>
            <span>
              {conn.connected
                ? <>{health?.verifiedName ? `${health.verifiedName} · ` : ''}{envSource ? 'Conexión del servidor' : `Conectado el ${fmtDate(conn.connectedAt, { day: 'numeric', month: 'long', year: 'numeric' })}`}</>
                : 'Conecta el número de tu tienda para atender y enviar campañas desde el CRM.'}
            </span>
          </div>
          {conn.connected && <span className={cx(s.badge, s.bActive)}><i />Activo</span>}
        </div>
        {conn.connected && (
          <div className={s.kvs}>
            <div className={s.kv}><small>Calidad</small><strong><span className={cx(s.badge, quality.cls)} style={{ padding: '2px 9px' }}>{quality.label}</span></strong></div>
            <div className={s.kv}><small>Límite de envíos</small><strong>{tierLabel(health?.messagingLimitTier)}</strong></div>
            <div className={s.kv}><small>Phone number ID</small><strong className={s.mono}>{envSource ? 'Variables del servidor' : conn.phoneNumberId}</strong></div>
            <div className={s.kv}><small>Firma de mensajes</small><strong>{conn.hasAppSecret ? 'Verificada' : 'Falta App Secret'}</strong></div>
          </div>
        )}
        {conn.connected && health?.qualityRating && health.qualityRating !== 'GREEN' && health.qualityRating !== 'UNKNOWN' && (
          <div style={{ marginTop: 14 }}>
            <Note kind="warn">La calidad del número bajó. Pausa las campañas y revisa las plantillas antes de que Meta limite el número.</Note>
          </div>
        )}
        {conn.connected && !conn.hasAppSecret && (
          <div style={{ marginTop: 14 }}>
            <Note kind="danger">
              Falta la clave secreta de la app: los mensajes que te escriben los clientes se rechazan hasta configurarla
              {envSource ? <> (variable <code>WHATSAPP_APP_SECRET</code> del servidor)</> : <> (actualiza las credenciales)</>}.
            </Note>
          </div>
        )}
        {conn.connected && !envSource && isOwner && (
          <div className={s.formFoot} style={{ marginTop: 18 }}>
            <small>¿Cambiaste el token o el número? Actualiza las credenciales.</small>
            {(confirmOff ? (
              <>
                <button className="btn btn-ghost" onClick={() => setConfirmOff(false)}>Cancelar</button>
                <button className="btn btn-dark" onClick={disconnect} disabled={busy}>{busy ? 'Desconectando…' : 'Sí, desconectar'}</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-ghost-danger" onClick={() => setConfirmOff(true)}>Desconectar</button>
            ))}
            {!confirmOff && <button className="btn btn-primary" onClick={() => setEditing(e => !e)}>{editing ? 'Cerrar' : 'Actualizar credenciales'}</button>}
          </div>
        )}
        {conn.connected && !envSource && isOwner && editing && (
          <div style={{ marginTop: 18 }}>
            <ConnectForm encryptionReady={conn.encryptionReady} onCancel={() => setEditing(false)}
              onConnected={msg => { setEditing(false); showToast(msg); load() }} />
          </div>
        )}
      </Panel>

      {!conn.connected && !envSource && !isOwner && (
        <Note kind="info">Solo el dueño de la tienda puede conectar el número de WhatsApp. Pídele que lo haga desde aquí mismo.</Note>
      )}
      {!conn.connected && !envSource && isOwner && (
        <Panel icon={Ico.bolt} tone="tAmber" title="Conecta tu número en 5 pasos" subtitle="Necesitas una cuenta de Meta Business y el número de tu tienda registrado en WhatsApp Business Platform.">
          <ol className={s.steps}>
            <li>En <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">Meta for Developers</a> crea una app de tipo <strong>Empresa</strong> y agrega el producto <strong>WhatsApp</strong>.</li>
            <li>En <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer">Configuración del negocio → Usuarios del sistema</a> crea un usuario administrador, asígnale la app y genera un <strong>token permanente</strong> con los permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</li>
            <li>En WhatsApp → Configuración de la API copia el <strong>identificador del número</strong> y el de la <strong>cuenta de WhatsApp Business</strong>.</li>
            <li>En Configuración de la app → Básica copia la <strong>clave secreta de la app</strong>.</li>
            <li>Pega todo aquí abajo y, al final, configura el webhook con los datos de la siguiente sección.</li>
          </ol>
          <div style={{ marginTop: 20 }}>
            <ConnectForm encryptionReady={conn.encryptionReady} onConnected={msg => { showToast(msg); load() }} />
          </div>
        </Panel>
      )}

      {webhookPanel}
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

/* ── Envío de prueba ────────────────────────────────────────────────────── */
function TestSendPanel() {
  const [f, setF] = useState({ to: '', template: '', language: 'es_MX', bodyParam: '', headerImageUrl: '' })
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF(prev => ({ ...prev, [k]: k === 'to' ? e.target.value.replace(/\D/g, '') : e.target.value }))
    setResult(null)
  }
  const canSend = /^\d{10,15}$/.test(f.to) && f.template.trim().length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const d = await api<{ messageId: string }>('/api/whatsapp/test-send', send('POST', { ...f, template: f.template.trim() }))
      setResult({ ok: true, msg: `Mensaje enviado (id ${d.messageId})` })
    } catch (err) {
      setResult({ ok: false, msg: (err as Error).message })
    } finally {
      setSending(false)
    }
  }

  return (
    <Panel icon={Ico.send} tone="tCyan" title="Envío de prueba" subtitle="Manda una plantilla aprobada a tu propio número para confirmar que todo quedó bien.">
      <form onSubmit={submit}>
        <div className={s.formGrid}>
          <div className="field"><label htmlFor="t-template">Nombre de la plantilla</label><input id="t-template" value={f.template} onChange={set('template')} placeholder="saludo_tienda" /></div>
          <div className="field"><label htmlFor="t-lang">Idioma</label><input id="t-lang" value={f.language} onChange={set('language')} placeholder="es_MX" /></div>
          <div className="field"><label htmlFor="t-param">Variable {'{{1}}'} (opcional)</label><input id="t-param" value={f.bodyParam} onChange={set('bodyParam')} placeholder="Carlos" /></div>
          <div className="field"><label htmlFor="t-img">Imagen de encabezado (opcional)</label><input id="t-img" value={f.headerImageUrl} onChange={set('headerImageUrl')} placeholder="https://…" /></div>
          <div className={cx('field', s.span2)}><label htmlFor="t-to">Número destino con lada de país</label><input id="t-to" inputMode="numeric" value={f.to} onChange={set('to')} placeholder="522221234567" /></div>
        </div>
        {result && <Note kind={result.ok ? 'ok' : 'danger'}>{result.msg}</Note>}
        <div className={s.formFoot}>
          <button type="submit" className="btn btn-primary" disabled={!canSend || sending}>{sending ? 'Enviando…' : 'Enviar prueba'}</button>
        </div>
      </form>
    </Panel>
  )
}

export function WhatsAppTab({ isOwner }: { isOwner: boolean }) {
  const [toast, showToast] = useToast()
  const [connected, setConnected] = useState(false)
  return (
    <>
      <ConnectionPanels isOwner={isOwner} showToast={showToast} onStatus={setConnected} />
      <QuickRepliesPanel showToast={showToast} />
      {connected && <TestSendPanel />}
      {toast}
    </>
  )
}
