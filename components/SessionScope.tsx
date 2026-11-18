'use client'

import { Fragment, useEffect, type ReactNode } from 'react'
import { useSession } from '@/lib/profile'
import { sessionScope } from '@/lib/apiClient'

/**
 * Shell state (search results, notifications and modals) belongs to the same scope as page data.
 * Mientras se comprueba la sesión se ve `fallback` (la app en gris, con la forma de la sección).
 */
export default function SessionScope({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const session = useSession()
  useEffect(() => {
    if (session === null) window.location.replace('/login')
  }, [session])
  if (!session) return <>{fallback}</>
  return <Fragment key={sessionScope(session)}>{children}</Fragment>
}
