'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'

/**
 * «¿Cómo funciona?»: el botón y cuándo se muestra la guía de una sección. Sale
 * sola la primera vez en cada dispositivo y luego solo con el botón. Que ya se
 * vio se guarda en localStorage (crm:guide:<clave>:v1); si el navegador no lo
 * permite, solo vuelve a salir. La guía del Sistema Comercial es un recorrido
 * sobre la pantalla (app/(app)/comercial/CommercialTour.tsx).
 */
const storageKey = (key: string) => `crm:guide:${key}:v1`

export function useGuide(key: string, ready: boolean) {
  const [open, setOpen] = useState(false)
  const checked = useRef(false)
  useEffect(() => {
    if (!ready || checked.current) return
    checked.current = true
    let seen = false
    try { seen = window.localStorage.getItem(storageKey(key)) === '1' } catch {}
    if (!seen) setOpen(true)
  }, [key, ready])
  const show = useCallback(() => setOpen(true), [])
  const close = useCallback(() => {
    setOpen(false)
    try { window.localStorage.setItem(storageKey(key), '1') } catch {}
  }, [key])
  return { open, show, close }
}

export function GuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="guide-how" onClick={onClick} aria-label="¿Cómo funciona?">
      <CircleHelp aria-hidden="true" />
      <span className="guide-how-text">¿Cómo funciona?</span>
    </button>
  )
}
