'use client'

import { useEffect } from 'react'
import { sendClientError } from '@/lib/clientErrorReport'

/**
 * Último recurso: falla el diseño raíz de la app. Reemplaza al layout, así que
 * lleva su propio html/body y estilos propios (los globales no se cargan aquí).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) sendClientError(error.message || 'Error en el diseño principal', 'render')
  }, [error])

  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F4F4F5', color: '#131313', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Algo salió mal</h1>
          <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.5, color: '#6B6B6A' }}>Ya avisamos al equipo. Intenta de nuevo en un momento.</p>
          <button onClick={() => retry()} style={{ background: '#E50A26', color: '#fff', border: 0, borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
