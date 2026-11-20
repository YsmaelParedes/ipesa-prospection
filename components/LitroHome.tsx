'use client'

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Lock, MessageCircle, Users } from 'lucide-react'
import { Avatar } from '@/components/CrmUI'
import { UpgradeDialog, useLockSeen, useUpgradeDialog } from '@/components/UpgradeDialog'
import { useSession } from '@/lib/profile'
import { PLANS } from '@/lib/stores'
import { useCachedQuery } from '@/lib/useCachedQuery'
import s from './Upgrade.module.css'

type Unread = { unread: number; locked?: boolean }
type Waiting = { waiting: { name: string }[] }
type Usage = { contacts: number; members: number }

const fmt = (n: number) => n.toLocaleString('es-MX')

/** Juan, Ana y Luis */
function namesList(names: string[]): string {
  const first = names.map(n => n.split(' ').slice(0, 2).join(' '))
  if (first.length <= 1) return first.join('')
  if (first.length <= 3) return `${first.slice(0, -1).join(', ')} y ${first[first.length - 1]}`
  return `${first.slice(0, 2).join(', ')} y ${first.length - 2} más`
}

/** Lo de Litro que conviene al administrador saber: chats que esperan y equipo en espera. */
function useLitroState() {
  const session = useSession()
  const store = session?.store
  const on = !!store && !!session?.isAdmin && store.plan === 'litro' && store.access !== 'readonly'
  const wa = useCachedQuery<Unread>(on ? '/api/whatsapp/unread' : null)
  const team = useCachedQuery<Waiting>(on ? '/api/store/waiting' : null)
  return { on, store, wa: wa.data, waiting: team.data?.waiting ?? null }
}

/**
 * Avisos de Inicio para una tienda en Litro (normalmente al terminar la
 * prueba de Cubeta): los chats de WhatsApp que siguen llegando, sin decir de
 * quién ni qué dicen, y quién del equipo quedó en espera. Cada uno abre el
 * aviso «Cambiar a Cubeta».
 */
export function LitroHints() {
  const { on, wa, waiting } = useLitroState()
  const upgrade = useUpgradeDialog()
  const chats = on && wa?.locked && wa.unread > 0 ? wa.unread : 0
  const people = on && waiting?.length ? waiting : null
  useLockSeen(chats ? 'whatsapp' : null)
  useLockSeen(people ? 'equipo' : null)
  if (!chats && !people) return null

  return (
    <div className={s.hints}>
      {chats > 0 && (
        <section className={s.hint}>
          <div className={s.hintHead}>
            <span className={`${s.hintIcon} ${s.hintWa}`} aria-hidden="true"><MessageCircle size={20} /></span>
            <h2 className={s.hintTitle}>{chats === 1 ? 'Tienes 1 chat de WhatsApp sin leer' : `Tienes ${fmt(chats)} chats de WhatsApp sin leer`}</h2>
          </div>
          <p className={s.hintText}>Los mensajes siguen llegando al número de tu tienda. Los ves en tu celular; para contestarlos aquí, con el historial y las cotizaciones de cada cliente, activa Cubeta.</p>
          <div className={s.hintFoot}>
            <button type="button" className="btn btn-primary" onClick={() => upgrade.open('whatsapp')}><Lock size={14} strokeWidth={2.4} aria-hidden="true" />Cambiar a Cubeta</button>
            <small>No mostramos quién escribió ni qué dice.</small>
          </div>
        </section>
      )}
      {people && (
        <section className={s.hint}>
          <div className={s.hintHead}>
            <span className={`${s.hintIcon} ${s.hintTeam}`} aria-hidden="true"><Users size={20} /></span>
            <h2 className={s.hintTitle}>{people.length === 1 ? '1 persona de tu equipo no puede entrar' : `${people.length} personas de tu equipo no pueden entrar`}</h2>
          </div>
          <div className={s.people}>
            <span style={{ display: 'flex' }} aria-hidden="true">
              {people.slice(0, 3).map((p, i) => <span key={p.name + i} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={p.name} size={30} /></span>)}
            </span>
            <span>{namesList(people.map(p => p.name))}</span>
          </div>
          <p className={s.hintText}>Litro incluye solo al administrador. Con Cubeta vuelven a entrar con sus contactos y pendientes, hasta {PLANS.cubeta.maxUsers} personas.</p>
          <div className={s.hintFoot}>
            <button type="button" className="btn btn-ghost" onClick={() => upgrade.open('equipo')}>Cambiar a Cubeta</button>
          </div>
        </section>
      )}
      {upgrade.dialog}
    </div>
  )
}

const seenKey = (storeId: string) => `matices:fin-prueba:${storeId}`

/**
 * «Terminó tu prueba de Cubeta», una sola vez por tienda en este dispositivo:
 * qué sigue gratis y qué queda con candado (con sus datos guardados).
 * «Activar Cubeta» abre el aviso con el pago; «Seguir en Litro» solo cierra.
 */
export function TrialEndedDialog() {
  const { on, store, wa, waiting } = useLitroState()
  const { data: usage } = useCachedQuery<Usage>(on && store?.trialEndedAt ? '/api/billing/usage' : null)
  const [show, setShow] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const titleId = useId()

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!on || !store?.trialEndedAt) return
    try { if (!localStorage.getItem(seenKey(store.id))) setShow(true) } catch {}
  }, [on, store?.id, store?.trialEndedAt])

  const close = () => {
    try { if (store) localStorage.setItem(seenKey(store.id), new Date().toISOString()) } catch {}
    setShow(false)
  }
  useEffect(() => {
    if (!show || upgrading) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!mounted || !show || !store) return null
  if (upgrading) return <UpgradeDialog feature="prueba" onClose={() => { setUpgrading(false); close() }} />

  const limit = PLANS.litro.maxContacts ?? 0
  const locked = [
    ...(wa?.locked ? ['WhatsApp en el CRM: los mensajes siguen llegando'] : []),
    ...(waiting?.length ? [`Tu equipo: ${waiting.length === 1 ? '1 persona queda' : `${waiting.length} personas quedan`} en espera`] : []),
    'Actividad diaria, metas y Acumulado',
    usage && usage.contacts > limit
      ? `Registrar contactos nuevos: tienes ${fmt(usage.contacts)} y Litro incluye ${fmt(limit)}`
      : `Más de ${fmt(limit)} clientes`,
  ]
  const free = ['Tus contactos y su historial', 'Tu lista de Hoy y Oportunidades', 'Agenda y avisos en tu celular', 'Cotizaciones en PDF por WhatsApp y correo']

  return createPortal(
    <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className={`${s.card} ${s.endCard}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={s.body}>
          <h2 id={titleId} className={s.title}>Terminó tu prueba de Cubeta</h2>
          <p className={s.endLead}>Tu tienda pasó a Litro, gratis. No se borró nada.</p>
          <div className={s.endGrid}>
            <section className={`${s.endCol} ${s.endFree}`}>
              <h3>Sigue gratis</h3>
              <ul>{free.map(t => <li key={t}><Check size={16} strokeWidth={3} aria-hidden="true" />{t}</li>)}</ul>
            </section>
            <section className={`${s.endCol} ${s.endLocked}`}>
              <h3>Queda con candado (lo guardamos)</h3>
              <ul>{locked.map(t => <li key={t}><Lock size={16} strokeWidth={2.2} aria-hidden="true" />{t}</li>)}</ul>
            </section>
          </div>
        </div>
        <div className={s.foot}>
          <button type="button" className="btn btn-ghost" onClick={close} autoFocus>Seguir en Litro</button>
          <button type="button" className="btn btn-primary" onClick={() => setUpgrading(true)}>Activar Cubeta</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
