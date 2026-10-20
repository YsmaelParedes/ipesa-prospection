'use client'

import Link from '@/components/CachedLink'
import { useSession } from '@/lib/profile'
import type { LimitKind } from '@/lib/planLimits'

const NOUN: Record<LimitKind, string> = { contacts: 'contactos' }

/**
 * Aviso del límite del plan Litro en Contactos: aparece al llegar al
 * 80 % y cambia de tono al llenarse. Sin límite (Galón, Cubeta) no muestra nada.
 */
export function PlanLimitHint({ kind, used }: { kind: LimitKind; used: number }) {
  const store = useSession()?.store
  const limit = store?.limits[kind] ?? null
  if (!store || limit === null || used < limit * 0.8) return null
  const full = used >= limit
  return (
    <div className={`plan-banner ${full ? 'readonly' : 'trial'}`} role="status" style={{ margin: '0 0 12px' }}>
      <span>
        {full
          ? <><strong>Llegaste a los {limit} {NOUN[kind]} del plan {store.planLabel}.</strong> Puedes consultar todo; para registrar más, cambia de plan.</>
          : <>Llevas <strong>{used} de {limit} {NOUN[kind]}</strong> del plan {store.planLabel}.</>}
      </span>
      <Link href="/configuracion?tab=plan" className="plan-banner-cta">Ver planes</Link>
    </div>
  )
}
