'use client'

import { useQueryEffect } from '@/lib/useCachedQuery'


import { apiFetch } from '@/lib/apiClient'


import { useState } from 'react'
import { currentSubscription, disableDevicePush, enableDevicePush, pushSupport, testDevicePush } from '@/lib/pushClient'
import { Card, Note, Row, cx } from './ui'
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

  useQueryEffect(() => {
    const support = pushSupport()
    if (support !== 'ok') { setStatus(support); return }
    currentSubscription().then(sub => {
      if (!sub) { setStatus(Notification.permission === 'denied' ? 'blocked' : 'off'); return }
      setStatus('on')
      apiFetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
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
    const r = await apiFetch('/api/push/subscribe', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, notifyWhatsapp: next }),
    }).catch(() => null)
    if (!r?.ok) setWhatsapp(!next)
  }

  const on = status === 'on'

  if (status === 'ios-install') return (
    <Note kind="info">
      En iPhone los avisos solo llegan con la app instalada: en Safari toca <strong>Compartir</strong> → <strong>Agregar a inicio</strong>,
      abre la app desde ese ícono y actívalos aquí.
    </Note>
  )
  if (status === 'unsupported') return (
    <Note>Este navegador no permite avisos. Usa Chrome, Edge o Safari actualizados (en iPhone, iOS 16.4 o más reciente).</Note>
  )

  return (
    <>
      <Card>
        <Row label="En este dispositivo" hint="Cada celular o computadora se activa por separado." align="center">
          <div className={s.controlLine}>
            <span className={cx(s.badge, on ? s.bActive : status === 'blocked' ? s.bWarn : s.bMuted)}><i />{STATUS_LABEL[status]}</span>
            <span className={s.grow} />
            {on && <button className="btn btn-ghost" onClick={() => run(test)} disabled={busy}>Enviar prueba</button>}
            <button className={on ? 'btn btn-ghost' : 'btn btn-primary'} onClick={on ? disable : enable} disabled={busy || status === 'loading'}>
              {busy ? '…' : on ? 'Desactivar' : 'Activar avisos'}
            </button>
          </div>
        </Row>
        {on && (
          <Row label="Mensajes de WhatsApp" hint="Además de tus recordatorios y el resumen de la mañana." align="center">
            <label className={s.checkLine}>
              <input type="checkbox" checked={whatsapp} onChange={toggleWhatsapp} style={{ '--check': '#25D366' } as React.CSSProperties} />
              Avisarme cuando me escriba un cliente
            </label>
          </Row>
        )}
      </Card>
      {status === 'blocked' && (
        <Note kind="warn">
          Este navegador tiene bloqueados los avisos de la app. Permítelos en el candado junto a la dirección
          (en la app instalada: Ajustes del celular → Notificaciones) y vuelve a tocar «Activar avisos».
        </Note>
      )}
      {error && <Note kind="danger">{error}</Note>}
      {info && <Note kind="ok">{info}</Note>}
    </>
  )
}
