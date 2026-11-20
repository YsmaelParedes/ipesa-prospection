'use client'

import { useLockSeen, useUpgradeDialog } from '@/components/UpgradeDialog'
import { useSession } from '@/lib/profile'
import type { LimitKind } from '@/lib/planLimits'

const NOUN: Record<LimitKind, string> = { contacts: 'contactos' }

/**
 * Aviso del límite del plan Litro en Contactos: aparece al llegar al
 * 80 % y cambia de tono al llenarse. Sin límite (Cubeta) no muestra nada.
 * «Cambiar a Cubeta» abre el aviso con el pago (solo el administrador paga).
 */
export function PlanLimitHint({ kind, used }: { kind: LimitKind; used: number }) {
  const session = useSession()
  const store = session?.store
  const limit = store?.limits[kind] ?? null
  const shown = !!store && limit !== null && used >= limit * 0.8
  const full = shown && used >= (limit ?? 0)
  const upgrade = useUpgradeDialog()
  useLockSeen(full ? 'contactos' : null)
  if (!store || !shown || limit === null) return null
  return (
    <div className={`plan-banner ${full ? 'readonly' : 'trial'}`} role="status" style={{ margin: '0 0 12px' }}>
      <span>
        {full
          ? <><strong>Llegaste a los {limit} {NOUN[kind]} del plan {store.planLabel}.</strong> Puedes consultar todo; para registrar más, cambia a Cubeta.</>
          : <>Llevas <strong>{used} de {limit} {NOUN[kind]}</strong> del plan {store.planLabel}.</>}
      </span>
      {session?.isAdmin && <button type="button" className="plan-banner-cta" onClick={() => upgrade.open('contactos')}>Cambiar a Cubeta</button>}
      {upgrade.dialog}
    </div>
  )
}
