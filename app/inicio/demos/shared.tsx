'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import s from './demos.module.css'

/* Piezas comunes de las demos: aviso breve, iniciales y formato de dinero. */

export const initials = (name: string) => name.replace(/^(Arq|Ing|Lic)\.\s*/, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
export const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
/** Sin acentos ni mayúsculas, como busca la app. */
export const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Aviso que aparece arriba de la demo un par de segundos (y se anuncia al lector de pantalla). */
export function useToast() {
  const [text, setText] = useState('')
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const show = useCallback((t: string) => {
    setText(t); setOn(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), 2200)
  }, [])
  const node = <div className={`${s.toast} ${on ? s.toastOn : ''}`} role="status" aria-live="polite">{text}</div>
  return { show, node }
}
