'use client'

import { useEffect } from 'react'

/**
 * Avisa que el cliente abrió su cotización. Corre en el navegador (las
 * vistas previas de enlaces de WhatsApp o del correo no ejecutan JavaScript)
 * y espera un momento, para no contar una apertura accidental.
 */
export function ViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/public/quotes/${encodeURIComponent(token)}/view`, { method: 'POST', keepalive: true }).catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [token])
  return null
}
