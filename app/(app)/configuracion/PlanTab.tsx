'use client'

import type { ClientStore } from '@/lib/profile'
import { LEGAL } from '@/lib/legal'
import { PAYMENT_GRACE_DAYS, STATUS_LABELS, TRIAL_DAYS } from '@/lib/stores'
import { Ico, Note, Panel, copyText, cx, fmtDate, useToast } from './ui'
import s from './configuracion.module.css'

export const STATUS_BADGE: Record<string, string> = {
  trial: s.bTrial, active: s.bActive, suspended: s.bDanger, cancelled: s.bMuted,
}

const INCLUDED = [
  'Contactos, leads y recordatorios',
  'Bandeja de WhatsApp ligada al CRM',
  'Campañas con reglas anti-bloqueo',
  'Fórmulas de color en mL',
  'Notificaciones en el celular',
  'Soporte para configurar tu tienda',
]

export function PlanTab({ store }: { store: ClientStore }) {
  const [toast, showToast] = useToast()
  const readonly = store.access === 'readonly'
  const trial = store.status === 'trial'
  const daysLeft = store.trialDaysLeft ?? 0
  const trialPct = Math.max(4, Math.min(100, ((TRIAL_DAYS - daysLeft) / TRIAL_DAYS) * 100))

  const headline = (() => {
    if (store.status === 'suspended') return 'Tu tienda está suspendida'
    if (store.status === 'cancelled') return 'Tu suscripción está cancelada'
    if (trial) return readonly ? 'Tu prueba gratis terminó' : `Te quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} de prueba`
    return readonly ? 'Tu pago está pendiente' : 'Tu plan está activo'
  })()

  const subject = encodeURIComponent(`Activar ${LEGAL.product} · ${store.name}`)
  const body = encodeURIComponent(`Hola, quiero activar el plan ${store.planLabel} para la tienda "${store.name}" (${store.slug}).`)

  return (
    <>
      <div className={s.planCard}>
        <div className={s.planTop}>
          <div>
            <small>Plan {store.planLabel}</small>
            <strong>{headline}</strong>
          </div>
          <span className={cx(s.badge, STATUS_BADGE[store.status])}><i />{STATUS_LABELS[store.status]}</span>
        </div>
        {trial && !readonly && <div className={s.trialBar} aria-hidden="true"><i style={{ width: `${trialPct}%` }} /></div>}
        <div className={s.planStats}>
          <div className={s.planStat}>
            <small>{trial ? 'La prueba termina' : 'Pagado hasta'}</small>
            <strong>{trial ? fmtDate(store.trialEndsAt) : store.paidUntil ? fmtDate(store.paidUntil) : 'Sin fecha de corte'}</strong>
          </div>
          <div className={s.planStat}>
            <small>Acceso</small>
            <strong>{readonly ? 'Solo consulta' : 'Completo'}</strong>
          </div>
          <div className={s.planStat}>
            <small>Usuarios incluidos</small>
            <strong>Hasta {store.maxUsers}</strong>
          </div>
        </div>
      </div>

      {readonly && (
        <Note kind="warn">
          En solo consulta tu equipo puede ver y exportar su información, pero no registrar clientes ni enviar mensajes.
          Nada se borra: al activar tu plan todo vuelve a funcionar al instante.
        </Note>
      )}

      <Panel icon={Ico.card} title={store.status === 'active' && !readonly ? '¿Necesitas ayuda con tu plan?' : 'Activa tu plan'}
        subtitle={`La activación se hace con nosotros: te compartimos el precio y las formas de pago, y en cuanto se registra el pago tu tienda queda activa. Si un pago vence tienes ${PAYMENT_GRACE_DAYS} días de gracia.`}>
        {LEGAL.email ? (
          <a className="btn btn-primary" href={`mailto:${LEGAL.email}?subject=${subject}&body=${body}`}><Ico.mail style={{ width: 15, height: 15 }} />Escribir para activar</a>
        ) : (
          <p className={s.hint} style={{ marginTop: 0 }}>Contacta a tu asesor de {LEGAL.product} y compártele el identificador de tu tienda.</p>
        )}
        <div className={s.slugRow}>
          <span>Identificador de tu tienda</span>
          <code>{store.slug}</code>
          <button className="btn btn-ghost" onClick={async () => { if (await copyText(store.slug)) showToast('Identificador copiado') }}>
            <Ico.copy style={{ width: 14, height: 14 }} />Copiar
          </button>
        </div>
      </Panel>

      <Panel icon={Ico.check} tone="tTeal" title={`Incluido en el plan ${store.planLabel}`}>
        <ul className={s.features}>
          {INCLUDED.map(f => <li key={f}><Ico.check />{f}</li>)}
          <li><Ico.check />Hasta {store.maxUsers} usuarios con roles</li>
        </ul>
      </Panel>
      {toast}
    </>
  )
}
