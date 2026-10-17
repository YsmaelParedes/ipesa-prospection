'use client'

import { useQueryEffect } from '@/lib/useCachedQuery'


import { apiFetch } from '@/lib/apiClient'


import { useCallback, useState } from 'react'
import { fmtDate } from './data'
import s from './admin.module.css'

/**
 * Conexión del número de WhatsApp de una tienda, dentro de su ficha del
 * panel. Solo el dueño de la plataforma (el asesor) ve credenciales y
 * webhook: la tienda solo ve si su número ya está conectado.
 */

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

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch { window.prompt('Copia el texto:', value); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className={s.waCopy}>
      <label>{label}</label>
      <input className={s.waField} readOnly value={value} onFocus={e => e.currentTarget.select()} aria-label={label} />
      <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
    </div>
  )
}

function ConnectForm({ storeId, encryptionReady, onConnected, onCancel }: {
  storeId: string; encryptionReady: boolean; onConnected: (msg: string) => void; onCancel?: () => void
}) {
  const [f, setF] = useState({ accessToken: '', phoneNumberId: '', wabaId: '', appSecret: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, digits = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: digits ? e.target.value.replace(/\D/g, '') : e.target.value.trim() }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await apiFetch(`/api/platform/stores/${storeId}/whatsapp`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo conectar')
      onConnected(`Conectado${d.displayPhone ? ` · ${d.displayPhone}` : ''}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      {!encryptionReady && <div className={s.error} style={{ marginBottom: 10 }}>Falta la llave de cifrado del servidor (<code>CREDENTIALS_ENCRYPTION_KEY</code>): no se pueden guardar credenciales.</div>}
      <div className={s.waForm}>
        <div className={`field ${s.waWide}`}>
          <label htmlFor="wa-token">Token de acceso permanente</label>
          <input id="wa-token" className={s.waField} type="password" autoComplete="off" value={f.accessToken} onChange={set('accessToken')} placeholder="EAAG…" required />
        </div>
        <div className="field">
          <label htmlFor="wa-phone">Phone number ID</label>
          <input id="wa-phone" className={s.waField} inputMode="numeric" value={f.phoneNumberId} onChange={set('phoneNumberId', true)} placeholder="123456789012345" required />
        </div>
        <div className="field">
          <label htmlFor="wa-waba">WABA ID</label>
          <input id="wa-waba" className={s.waField} inputMode="numeric" value={f.wabaId} onChange={set('wabaId', true)} placeholder="102030405060708" required />
        </div>
        <div className={`field ${s.waWide}`}>
          <label htmlFor="wa-secret">App Secret</label>
          <input id="wa-secret" className={s.waField} type="password" autoComplete="off" value={f.appSecret} onChange={set('appSecret')} placeholder="32 caracteres" required maxLength={32} />
        </div>
      </div>
      {error && <div className={s.error}>{error}</div>}
      <div className={s.waFoot}>
        <small>Se guardan cifrados y no se vuelven a mostrar.</small>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="btn btn-dark" disabled={busy || !encryptionReady}>{busy ? 'Verificando con Meta…' : 'Verificar y conectar'}</button>
      </div>
    </form>
  )
}

export function WhatsAppConnectionBlock({ storeId, onChanged }: { storeId: string; onChanged: () => Promise<void> }) {
  const [conn, setConn] = useState<Connection | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/platform/stores/${storeId}/whatsapp`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo consultar la conexión')
      setConn(d)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }, [storeId])
  useQueryEffect(() => { load() }, [load])

  const connected = async (text: string) => {
    setEditing(false)
    setMsg(text)
    await Promise.all([load(), onChanged()])
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      const r = await apiFetch(`/api/platform/stores/${storeId}/whatsapp`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo desconectar')
      setConfirmOff(false)
      setMsg('Número desconectado')
      await Promise.all([load(), onChanged()])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const envSource = conn?.source === 'env'

  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <strong>Conexión de WhatsApp</strong>
        <small>Solo tú la ves. La tienda solo ve si su número ya está conectado.</small>
      </div>
      {error && <div className={s.error}>{error}</div>}
      {!conn && !error && <div className={s.center} style={{ padding: 16 }}><span className={s.spinner} /></div>}

      {conn && (
        <>
          <div className={s.waConn}>
            {conn.connected ? (
              <>
                <span className={`${s.wa} ${s.waOn}`}><i />Conectado</span>
                <strong>{conn.displayPhone ?? 'Número conectado'}</strong>
                <span>{envSource ? 'Conexión del servidor (variables de entorno)' : `desde el ${fmtDate(conn.connectedAt)}`}</span>
                {!conn.hasAppSecret && <span className={`${s.badge} ${s.bDanger}`}>Falta App Secret: no llegan mensajes</span>}
              </>
            ) : (
              <><span className={s.wa}><i />Sin conectar</span><span>La tienda ve «Tu asesor está terminando de conectar el número».</span></>
            )}
          </div>
          {msg && <div className={`${s.msg} ${s.msgOk}`} role="status">{msg}</div>}

          {/* Conectar: 5 pasos + formulario */}
          {!conn.connected && !envSource && (
            <div className={s.waSub}>
              <strong>Conecta el número en 5 pasos</strong>
              <ol className={s.waSteps}>
                <li>En <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">Meta for Developers</a> crea una app de tipo <strong>Empresa</strong> y agrega el producto <strong>WhatsApp</strong>.</li>
                <li>En <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer">Configuración del negocio → Usuarios del sistema</a> crea un usuario administrador, asígnale la app y genera un <strong>token permanente</strong> con <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</li>
                <li>En WhatsApp → Configuración de la API copia el <strong>Phone number ID</strong> y el <strong>WABA ID</strong>.</li>
                <li>En Configuración de la app → Básica copia el <strong>App Secret</strong>.</li>
                <li>Pega todo aquí abajo y, al final, configura el webhook con los datos de abajo.</li>
              </ol>
              <ConnectForm storeId={storeId} encryptionReady={conn.encryptionReady} onConnected={connected} />
            </div>
          )}

          {/* Actualizar o desconectar */}
          {conn.connected && !envSource && (
            <div className={s.waFoot} style={{ marginTop: 12 }}>
              {confirmOff ? (
                <>
                  <small>La tienda dejará de recibir y enviar mensajes.</small>
                  <button className="btn btn-ghost" onClick={() => setConfirmOff(false)}>No</button>
                  <button className="btn btn-dark" onClick={disconnect} disabled={busy}>{busy ? 'Desconectando…' : 'Sí, desconectar'}</button>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost btn-ghost-danger" onClick={() => setConfirmOff(true)}>Desconectar</button>
                  <button className="btn btn-ghost" onClick={() => setEditing(e => !e)}>{editing ? 'Cerrar' : 'Actualizar credenciales'}</button>
                </>
              )}
            </div>
          )}
          {conn.connected && !envSource && editing && (
            <div className={s.waSub}>
              <ConnectForm storeId={storeId} encryptionReady={conn.encryptionReady} onConnected={connected} onCancel={() => setEditing(false)} />
            </div>
          )}

          {/* Webhook */}
          <div className={s.waSub}>
            <strong>Webhook para recibir mensajes</strong>
            <div className={s.waNote}>En la app de Meta: WhatsApp → Configuración → Webhook. Después suscribe el campo <code>messages</code>.</div>
            <CopyRow label="URL de devolución" value={conn.webhook.url} />
            {conn.webhook.verifyToken
              ? <CopyRow label="Token de verificación" value={conn.webhook.verifyToken} />
              : <div className={s.waNote}>Esta tienda usa la conexión del servidor: el token es la variable <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>.</div>}
          </div>
        </>
      )}
    </div>
  )
}
