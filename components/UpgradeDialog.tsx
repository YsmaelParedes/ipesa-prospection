'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Lock, MessageCircle, PaintBucket, TrendingUp, Users, X, type LucideIcon } from 'lucide-react'
import { EVENTS, track } from '@/lib/analytics'
import { fmtMoney, monthsSaved, type PlanInterval, type PlanPrice } from '@/lib/billing'
import { startCheckout } from '@/lib/checkout'
import { useSession } from '@/lib/profile'
import { LOCKS, cubetaAlso, type LockedFeature } from '@/lib/upgrade'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { PAID_PLAN } from '@/lib/stores'
import s from './Upgrade.module.css'

type Prices = { available: boolean; prices: Partial<Record<string, PlanPrice>>; annual?: Partial<Record<string, PlanPrice>> }

const ICONS: Record<LockedFeature, LucideIcon> = {
  equipo: Users, whatsapp: MessageCircle, actividad: TrendingUp, acumulado: TrendingUp, contactos: Lock, prueba: PaintBucket,
}

/**
 * Aviso «Cambiar a Cubeta» que sale al tocar algo con candado en Litro
 * (invitar a tu equipo, conectar WhatsApp, Actividad diaria…). Mensual
 * primero y anual como segunda opción; «Cambiar a Cubeta» abre Stripe
 * directo, sin pasar por Configuración → Plan.
 * Solo el administrador paga: a los demás se les dice a quién pedirlo.
 */
export function UpgradeDialog({ feature, onClose }: { feature: LockedFeature; onClose: () => void }) {
  const session = useSession()
  const { data } = useCachedQuery<Prices>('/api/billing/prices')
  const [period, setPeriod] = useState<PlanInterval>('month')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()
  const lock = LOCKS[feature]
  const Icon = ICONS[feature]
  const isAdmin = !!session?.isAdmin
  const monthly = data?.prices?.[PAID_PLAN]
  const annual = data?.annual?.[PAID_PLAN]
  const saved = monthsSaved(monthly, annual)
  const canPay = !!data?.available && !!monthly && isAdmin

  useEffect(() => { setMounted(true) }, [])

  // Lo último de onClose y busy, para que el efecto de abajo corra una sola vez
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => { onCloseRef.current = onClose; busyRef.current = busy })

  // Foco en cerrar al abrir, regreso al botón que lo abrió, Esc cierra y Tab no sale de la ventana
  useEffect(() => {
    if (!mounted) return
    const before = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (!busyRef.current) onCloseRef.current(); return }
      if (e.key !== 'Tab' || !cardRef.current) return
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]'))
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true); before?.focus?.() }
  }, [mounted])

  const pay = async () => {
    setBusy(true)
    setError('')
    try {
      await startCheckout(period === 'year' && annual ? 'year' : 'month', `aviso-${feature}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className={s.backdrop} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div ref={cardRef} className={s.card} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId}>
        <div className={s.head}>
          <span className={s.headIcon} aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
          <h2 id={titleId} className={s.title}>{lock.title}</h2>
          <button ref={closeRef} type="button" className={s.close} aria-label="Cerrar" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>

        <div className={s.body}>
          <p id={textId} className={s.text}>{lock.text}</p>
          <p className={s.also}>{cubetaAlso(feature)}</p>

          {isAdmin ? (
            <fieldset className={s.periods}>
              <legend>Forma de pago</legend>
              <label className={s.period}>
                <input type="radio" name="periodo" checked={period === 'month'} onChange={() => setPeriod('month')} />
                <span className={s.periodName}>Mensual</span>
                <span className={s.periodPrice}>{monthly ? <><strong>{fmtMoney(monthly.amount, monthly.currency)}</strong> al mes</> : <span className={s.soft}>{data ? 'Disponible pronto' : '…'}</span>}</span>
              </label>
              {annual && (
                <label className={s.period}>
                  <input type="radio" name="periodo" checked={period === 'year'} onChange={() => setPeriod('year')} />
                  <span className={s.periodName}>Anual{saved > 0 && <span className={s.save}>{saved} meses gratis</span>}</span>
                  <span className={s.periodPrice}><strong>{fmtMoney(annual.amount, annual.currency)}</strong> al año</span>
                </label>
              )}
            </fieldset>
          ) : (
            <p className={s.ask}>Pídele a un administrador de tu tienda que active Cubeta.</p>
          )}
          {isAdmin && <p className={s.note}>Impuestos incluidos, con factura. Cancelas cuando quieras: tu tienda vuelve a Litro sin borrar nada.</p>}
          {error && <p className={s.error} role="alert">{error}</p>}
        </div>

        <div className={s.foot}>
          {isAdmin && <span className={s.footNote}>Pagas en Stripe, con tarjeta.</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{isAdmin ? 'Ahora no' : 'Entendido'}</button>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={pay} disabled={busy || !canPay}>
              {busy ? 'Abriendo pago…' : period === 'year' && annual ? 'Cambiar a Cubeta anual' : 'Cambiar a Cubeta'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Estado para abrir el aviso desde cualquier candado: `open('equipo')` lo
 * muestra y cuenta «Candado clic»; `dialog` va en el JSX.
 */
export function useUpgradeDialog() {
  const [feature, setFeature] = useState<LockedFeature | null>(null)
  const open = (f: LockedFeature) => {
    track(EVENTS.lockClick, { funcion: f })
    setFeature(f)
  }
  const dialog = feature ? <UpgradeDialog feature={feature} onClose={() => setFeature(null)} /> : null
  return { open, dialog }
}

/** Cuenta «Candado visto» una vez por pantalla. */
export function useLockSeen(feature: LockedFeature | null) {
  useEffect(() => {
    if (feature) track(EVENTS.lockSeen, { funcion: feature })
  }, [feature])
}
