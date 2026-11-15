'use client'

import { RotateCw, WifiOff } from 'lucide-react'

/**
 * Cuando una pantalla no pudo cargar sus datos: lo dice y deja reintentar.
 * Va en lugar del estado vacío («Aún no tienes contactos», «Todo al día»),
 * que con un error de conexión daba a entender que no había nada.
 */
export function LoadFailed({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="load-failed" role="alert">
      <span className="load-failed-icon" aria-hidden="true"><WifiOff size={18} /></span>
      <div>
        <strong>No se pudo cargar</strong>
        <p>{message && message !== 'No se pudieron actualizar los datos' ? message : 'Revisa tu conexión e inténtalo de nuevo.'}</p>
      </div>
      <button type="button" className="btn btn-ghost" onClick={onRetry}><RotateCw size={14} /> Reintentar</button>
    </div>
  )
}
