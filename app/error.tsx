'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { sendClientError } from '@/lib/clientErrorReport'

/**
 * Pantalla cuando algo falla dentro de la app (en lugar de una página en
 * blanco). El error ya se avisa al equipo: los del servidor los reporta el
 * propio servidor (traen `digest`); los del navegador se mandan desde aquí.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const pathname = usePathname()
  useEffect(() => {
    if (!error.digest) sendClientError(error.message || 'Error al mostrar la pantalla', 'render')
  }, [error, pathname])

  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '32px 24px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 8px', color: 'var(--ink)' }}>Algo salió mal</h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
          Ya avisamos al equipo. Puedes intentarlo de nuevo; si sigue igual, vuelve al inicio.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => retry()}>Reintentar</button>
          <Link href="/" className="btn btn-ghost">Ir al inicio</Link>
        </div>
      </div>
    </div>
  )
}
