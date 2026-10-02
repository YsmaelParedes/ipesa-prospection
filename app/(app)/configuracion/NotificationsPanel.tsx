'use client'

import { useEffect, useState } from 'react'
import { Ico, Note, Panel, cx } from './ui'
import s from './configuracion.module.css'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output.buffer as ArrayBuffer
}

/** Avisa al shell (campana) que cambió la suscripción de este dispositivo. */
const notifyPushChanged = () => window.dispatchEvent(new Event('crm:push-changed'))

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null))
}

/**
 * Avisos en este dispositivo (notificaciones push): recordatorios que vencen
 * y mensajes de WhatsApp. Antes vivía dentro de la campana de recordatorios.
 */
export function NotificationsPanel() {
  const [supported, setSupported]   = useState<boolean | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [whatsapp, setWhatsapp]     = useState(true)
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState('')
  const [info, setInfo]             = useState('')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setSupported(false); return }
    setSupported(true)
    getRegistration().then(reg => reg?.pushManager.getSubscription()).then(sub => {
      setSubscribed(!!sub)
      if (!sub) return
      fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setWhatsapp(d.notifyWhatsapp !== false) })
        .catch(() => {})
    }).catch(() => {})
  }, [])

  const enable = async () => {
    setBusy(true); setError(''); setInfo('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setError('El navegador bloqueó los avisos. Actívalos en los ajustes del sitio y vuelve a intentar.'); return }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) throw new Error('Los avisos no están configurados en el servidor.')
      const reg = await getRegistration()
      if (!reg) throw new Error('Este navegador no permite avisos.')
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), notifyWhatsapp: whatsapp }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'No se pudo guardar la suscripción')
      }
      setSubscribed(true)
      notifyPushChanged()
    } catch (err) {
      setError((err as Error).message || 'No se pudieron activar los avisos')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true); setError(''); setInfo('')
    try {
      const reg = await getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      notifyPushChanged()
    } finally {
      setBusy(false)
    }
  }

  const toggleWhatsapp = async () => {
    const next = !whatsapp
    setWhatsapp(next)
    const reg = await getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const r = await fetch('/api/push/subscribe', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, notifyWhatsapp: next }),
    }).catch(() => null)
    if (!r?.ok) setWhatsapp(!next)
  }

  const test = async () => {
    setBusy(true); setError(''); setInfo('')
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error || `Error ${res.status}`)
      else if (d.sent === 0) setError('Se envió, pero este dispositivo no la recibió. Revisa los permisos del sitio.')
      else setInfo('Listo: debió llegarte un aviso de prueba.')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel icon={Ico.bolt} tone="tAmber" title="Avisos en este dispositivo"
      subtitle="Te avisamos cuando vence un recordatorio o te escribe un cliente, aunque la app esté cerrada.">
      {supported === false ? (
        <Note>Este navegador no permite avisos. En iPhone, primero agrega la app a tu pantalla de inicio.</Note>
      ) : (
        <div className={s.formGrid}>
          <div className={cx(s.span2)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className={cx(s.badge, subscribed ? s.bActive : s.bMuted)}><i />{subscribed ? 'Activados' : 'Desactivados'}</span>
            <span style={{ flex: 1 }} />
            {subscribed && <button className="btn btn-ghost" onClick={test} disabled={busy}>Enviar prueba</button>}
            <button className={subscribed ? 'btn btn-ghost' : 'btn btn-primary'} onClick={subscribed ? disable : enable} disabled={busy || supported === null}>
              {busy ? '…' : subscribed ? 'Desactivar' : 'Activar avisos'}
            </button>
          </div>
          {subscribed && (
            <label className={s.span2} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={whatsapp} onChange={toggleWhatsapp} style={{ accentColor: '#25D366', width: 16, height: 16 }} />
              Avisarme también cuando llegue un mensaje de WhatsApp
            </label>
          )}
          {error && <div className={cx(s.error, s.span2)}>{error}</div>}
          {info && <div className={s.span2}><Note kind="ok">{info}</Note></div>}
        </div>
      )}
    </Panel>
  )
}
