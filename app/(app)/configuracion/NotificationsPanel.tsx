'use client'

import { useEffect, useState } from 'react'
import { currentSubscription, disableDevicePush, enableDevicePush, pushSupport, testDevicePush } from '@/lib/pushClient'
import { Ico, Note, Panel, cx } from './ui'
import s from './configuracion.module.css'

type Status = 'loading' | 'ios-install' | 'unsupported' | 'blocked' | 'off' | 'on'
const STATUS_LABEL: Record<Status, string> = {
  loading: '…', 'ios-install': 'Desactivados', unsupported: 'No disponibles', blocked: 'Bloqueados', off: 'Desactivados', on: 'Activados',
}

/**
 * Avisos en este dispositivo (notificaciones push): recordatorios a su hora,
 * el resumen de la mañana y mensajes de WhatsApp. Cada celular o computadora
 * se activa por separado.
 */
export function NotificationsPanel() {
  const [status, setStatus]     = useState<Status>('loading')
  const [whatsapp, setWhatsapp] = useState(true)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')

  useEffect(() => {
    const support = pushSupport()
    if (support !== 'ok') { setStatus(support); return }
    currentSubscription().then(sub => {
      if (!sub) { setStatus(Notification.permission === 'denied' ? 'blocked' : 'off'); return }
      setStatus('on')
      fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setWhatsapp(d.notifyWhatsapp !== false) })
        .catch(() => {})
    }).catch(() => setStatus('off'))
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setInfo('')
    try { await fn() } catch (err) {
      setError((err as Error).message || 'No se pudo conectar con el servidor.')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    const r = await testDevicePush({ notifyWhatsapp: whatsapp })
    if (r.ok) setInfo('Te mandamos un aviso de prueba. Si no aparece, revisa que el dispositivo no esté en "No molestar".')
    else {
      if (r.inactive) setStatus('off')
      setError(r.error)
    }
  }

  // Al activarlos se manda una prueba: así se ve de inmediato que todo funciona
  const enable = () => run(async () => {
    const permission = await enableDevicePush(whatsapp)
    if (permission !== 'granted') { setStatus(permission === 'denied' ? 'blocked' : 'off'); return }
    setStatus('on')
    await test()
  })

  const disable = () => run(async () => {
    await disableDevicePush()
    setStatus('off')
  })

  const toggleWhatsapp = async () => {
    const next = !whatsapp
    setWhatsapp(next)
    const sub = await currentSubscription()
    if (!sub) return
    const r = await fetch('/api/push/subscribe', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, notifyWhatsapp: next }),
    }).catch(() => null)
    if (!r?.ok) setWhatsapp(!next)
  }

  const on = status === 'on'

  return (
    <Panel icon={Ico.bolt} tone="tAmber" title="Avisos en este dispositivo"
      subtitle="A la hora de cada recordatorio, un resumen de tu agenda a las 8:00 y cuando te escribe un cliente, aunque la app esté cerrada.">
      {status === 'ios-install' ? (
        <Note kind="info">
          En iPhone los avisos solo llegan con la app instalada: en Safari toca <strong>Compartir</strong> → <strong>Agregar a inicio</strong>,
          abre la app desde ese ícono y actívalos aquí.
        </Note>
      ) : status === 'unsupported' ? (
        <Note>Este navegador no permite avisos. Usa Chrome, Edge o Safari actualizados (en iPhone, iOS 16.4 o más reciente).</Note>
      ) : (
        <div className={s.formGrid}>
          <div className={cx(s.span2)} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className={cx(s.badge, on ? s.bActive : status === 'blocked' ? s.bWarn : s.bMuted)}><i />{STATUS_LABEL[status]}</span>
            <span style={{ flex: 1 }} />
            {on && <button className="btn btn-ghost" onClick={() => run(test)} disabled={busy}>Enviar prueba</button>}
            <button className={on ? 'btn btn-ghost' : 'btn btn-primary'} onClick={on ? disable : enable} disabled={busy || status === 'loading'}>
              {busy ? '…' : on ? 'Desactivar' : 'Activar avisos'}
            </button>
          </div>
          {status === 'blocked' && (
            <div className={s.span2}>
              <Note kind="warn">
                Este navegador tiene bloqueados los avisos de la app. Permítelos en el candado junto a la dirección
                (en la app instalada: Ajustes del celular → Notificaciones) y vuelve a tocar «Activar avisos».
              </Note>
            </div>
          )}
          {on && (
            <label className={s.span2} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={whatsapp} onChange={toggleWhatsapp} style={{ accentColor: '#25D366', width: 16, height: 16 }} />
              Avisarme también cuando llegue un mensaje de WhatsApp
            </label>
          )}
          {!on && status !== 'loading' && (
            <p className={cx(s.hint, s.span2)}>Cada celular o computadora se activa por separado.</p>
          )}
          {error && <div className={cx(s.error, s.span2)}>{error}</div>}
          {info && <div className={s.span2}><Note kind="ok">{info}</Note></div>}
        </div>
      )}
    </Panel>
  )
}
