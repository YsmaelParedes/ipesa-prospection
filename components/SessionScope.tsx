'use client'

import { Fragment, useEffect, type ReactNode } from 'react'
import { useSession } from '@/lib/profile'
import { sessionScope } from '@/lib/apiClient'

/** Shell state (search results, notifications and modals) belongs to the same scope as page data. */
export default function SessionScope({ children }: { children: ReactNode }) {
  const session = useSession()
  useEffect(() => {
    if (session === null) window.location.replace('/login')
  }, [session])
  if (!session) return <div role="status" style={{ padding: 32 }}>Comprobando sesión…</div>
  return <Fragment key={sessionScope(session)}>{children}</Fragment>
}
