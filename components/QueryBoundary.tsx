'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { queryCache, sessionScope, subscribeQueryStatus } from '@/lib/apiClient'
import { useSession } from '@/lib/profile'
import { usePathname } from 'next/navigation'
import { QueryError } from '@/lib/queryCache'

/** Remount private views when their authorization scope changes. */
export default function QueryBoundary({ children }: { children: ReactNode }) {
  const session = useSession()
  const pathname = usePathname()
  const [failed, setFailed] = useState(false)
  const [expired, setExpired] = useState(false)
  const [denied, setDenied] = useState(false)
  useEffect(() => subscribeQueryStatus(() => {
    const errors = queryCache.errors()
    setFailed(errors.length > 0)
    setExpired(queryCache.expired())
    setDenied(errors.some(error => error instanceof QueryError && error.status === 403))
  }), [])
  if (!session) return <div role="status">Comprobando sesión…</div>
  if (pathname.startsWith('/admin') && !session.platformAdmin) return <p role="alert">Ya no tienes acceso a la administración de la plataforma.</p>
  if (!pathname.startsWith('/admin') && !session.store) return <p role="alert">Tu cuenta no tiene una tienda activa.</p>
  return <div key={sessionScope(session)}>
    {failed && !denied && <p role="status" className="alert alert-warning">No se pudieron actualizar algunos datos. Comprueba tu conexión; la información mostrada puede estar desactualizada.</p>}
    {denied && <p role="alert">Ya no tienes permiso para consultar estos datos. Se está comprobando tu acceso.</p>}
    {expired && <p role="alert">Los datos guardados ya vencieron. Espera a que se actualicen o <button onClick={() => window.location.reload()}>vuelve a cargar</button>.</p>}
    <div hidden={expired || denied}>{children}</div>
  </div>
}
