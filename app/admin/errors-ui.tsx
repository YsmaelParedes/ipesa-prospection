'use client'

import { useEffect, useState } from 'react'
import { currentSubscription, enableDevicePush, pushSupport } from '@/lib/pushClient'
import { useRecentErrors, type PlatformError } from './data'
import s from './admin.module.css'

/**
 * Resumen › Errores recientes: lo que falló en producción (servidor, navegador,
 * tareas programadas, WhatsApp) agrupado, con su contador. Cada error nuevo
 * también llega como aviso al celular; aquí se ve el historial y se comprueba
 * que los avisos funcionan.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const SOURCE_LABEL: Record<PlatformError['source'], string> = {
  server: 'Servidor', client: 'Navegador', render: 'Pantalla', cron: 'Tarea programada',
  webhook: 'WhatsApp (entrada)', whatsapp: 'WhatsApp (Meta)', test: 'Prueba',
}

function agoShort(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function ErrorsPanel() {
  const { errors, error, reload } = useRecentErrors()
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let alive = true
    currentSubscription().then(sub => { if (alive) setDeviceOn(!!sub && Notification.permission === 'granted') }).catch(() => { if (alive) setDeviceOn(false) })
    return () => { alive = false }
  }, [])

  const activate = async () => {
    setBusy('enable'); setMsg(null)
    try {
      const support = pushSupport()
      if (support === 'ios-install') throw new Error('En iPhone, primero agrega la app a la pantalla de inicio y ábrela desde ahí.')
      if (support === 'unsupported') throw new Error('Este navegador no permite avisos.')
      const permission = await enableDevicePush()
      if (permission !== 'granted') throw new Error('No diste permiso para los avisos. Puedes cambiarlo en los ajustes del navegador.')
      setDeviceOn(true)
      setMsg({ ok: true, text: 'Avisos activados en este dispositivo.' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally { setBusy('') }
  }

  const sendTest = async () => {
    setBusy('test'); setMsg(null)
    try {
      const r = await fetch('/api/platform/errors', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo enviar la prueba')
      if (!d.ok) setMsg({ ok: false, text: 'No se pudo guardar el aviso de prueba.' })
      else if (d.devices > 0) setMsg({ ok: true, text: `Aviso de prueba enviado a ${d.devices} ${d.devices === 1 ? 'dispositivo' : 'dispositivos'}. Debe llegarte en unos segundos.` })
      else setMsg({ ok: false, text: 'La prueba se guardó, pero ningún dispositivo tiene los avisos activados (o ya se enviaron 5 avisos en los últimos 10 minutos). Activa los avisos en tu celular y vuelve a probar.' })
      await reload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally { setBusy('') }
  }

  const resolve = async (id: number, resolved: boolean) => {
    setBusy(`r${id}`)
    try {
      const r = await fetch(`/api/platform/errors/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo actualizar')
      await reload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally { setBusy('') }
  }

  const open = (errors ?? []).filter(e => !e.resolved_at)
  const done = (errors ?? []).filter(e => e.resolved_at)

  return (
    <section className={s.panel} style={{ marginBottom: 12 }}>
      <div className={s.panelHead}>
        <strong>Errores recientes</strong>
        <span>{open.length || ''}</span>
      </div>

      <div className={s.errStatus}>
        <span>Avisos al celular: <strong>{deviceOn === null ? '…' : deviceOn ? 'activados en este dispositivo' : 'no activados en este dispositivo'}</strong></span>
        {deviceOn === false && <button className="btn btn-ghost" onClick={activate} disabled={!!busy}>{busy === 'enable' ? 'Activando…' : 'Activar aquí'}</button>}
        <button className="btn btn-ghost" onClick={sendTest} disabled={!!busy}>{busy === 'test' ? 'Enviando…' : 'Enviar aviso de prueba'}</button>
        {msg && <span className={cx(s.errMsg, msg.ok ? s.msgOk : s.msgErr)} role="status" style={{ padding: '8px 10px', borderRadius: 10 }}>{msg.text}</span>}
      </div>

      {error && <div className={s.error} style={{ margin: '0 16px 12px' }}>{error}</div>}
      {errors && open.length === 0 && <div className={s.panelEmpty}>{done.length ? 'Todo resuelto: no hay errores pendientes.' : 'Sin errores en los últimos 14 días.'}</div>}

      {open.map(e => (
        <div key={e.id} className={s.errRow}>
          <span className={s.itemMain}>
            <strong>{e.context}</strong>
            <small>{e.message}</small>
            <small>{SOURCE_LABEL[e.source]}{e.store_name ? ` · ${e.store_name}` : ''} · {agoShort(e.last_seen_at)}</small>
          </span>
          {e.count > 1 && <span className={s.errCount} title="Veces que ha pasado">{e.count}×</span>}
          <button className="btn btn-ghost" onClick={() => resolve(e.id, true)} disabled={!!busy}>Resuelto</button>
        </div>
      ))}

      {done.length > 0 && (
        <details style={{ borderTop: '1px solid var(--line)' }}>
          <summary style={{ padding: '10px 16px', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' }}>Resueltos ({done.length})</summary>
          {done.map(e => (
            <div key={e.id} className={cx(s.errRow, s.errRowDone)}>
              <span className={s.itemMain}>
                <strong>{e.context}</strong>
                <small>{e.message}</small>
                <small>{SOURCE_LABEL[e.source]}{e.store_name ? ` · ${e.store_name}` : ''} · {agoShort(e.last_seen_at)}</small>
              </span>
              <button className="btn btn-ghost" onClick={() => resolve(e.id, false)} disabled={!!busy}>Reabrir</button>
            </div>
          ))}
        </details>
      )}
    </section>
  )
}
