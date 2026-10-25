'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Guía de inicio de una sección: una ventana con pocos pasos (dibujo, título y
 * una frase). Sale sola la primera vez en cada dispositivo y se vuelve a abrir
 * con «¿Cómo funciona?». Que ya se vio se guarda en localStorage
 * (crm:guide:<clave>:v1); si el navegador no lo permite, solo sale de nuevo.
 */
export type GuideStep = { art: ReactNode; title: string; text: string }

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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
      </svg>
      <span className="guide-how-text">¿Cómo funciona?</span>
    </button>
  )
}

export function GuideModal({ title, steps, onClose }: { title: string; steps: GuideStep[]; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [fading, setFading] = useState(false)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const last = i === steps.length - 1
  const step = steps[i]

  const go = useCallback((d: number) => {
    const n = i + d
    if (n < 0 || n >= steps.length) return
    setFading(true)
    setTimeout(() => { setI(n); setFading(false) }, 150)
  }, [i, steps.length])

  useEffect(() => { primaryRef.current?.focus() }, [i])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [go, onClose])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={e => e.stopPropagation()}>
        <div className="guide-head">
          <span className="guide-kicker">{title}</span>
          <span className="guide-count">Paso {i + 1} de {steps.length}</span>
        </div>
        <div className={`guide-step ${fading ? 'fading' : ''}`}>
          <div className="guide-art" aria-hidden="true">{step.art}</div>
          <div className="guide-body">
            <h3 id="guide-title">{step.title}</h3>
            <p>{step.text}</p>
          </div>
        </div>
        <div className="guide-dots" aria-hidden="true">
          {steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}
        </div>
        <div className="guide-foot">
          {!last && <button type="button" className="guide-btn ghost" onClick={onClose}>Saltar</button>}
          {i > 0 && <button type="button" className="guide-btn soft" onClick={() => go(-1)}>Anterior</button>}
          <button ref={primaryRef} type="button" className="guide-btn primary" onClick={() => (last ? onClose() : go(1))}>
            {last ? '¡Listo!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
