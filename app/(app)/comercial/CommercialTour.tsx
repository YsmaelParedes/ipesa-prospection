'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import s from './tour.module.css'

export type TourStep = {
  id: string
  /** Selector CSS de lo que se señala. Sin él, o si no aparece, el paso sale al centro sin señalar. */
  target?: string
  title: string
  body: ReactNode
}

type Box = { x: number; y: number; w: number; h: number }
const PAD = 8
const MOBILE = 760
const GAP = 12
const MARGIN = 16
/** En el celular, lo más chica que puede quedar la tarjeta (con su propio desplazamiento). */
const MIN_SHEET = 260
type Sheet = { edge: 'top' | 'bottom'; max: number | null }

/** Con tamaño y no escondido a un lado (el menú lateral del celular vive fuera de la pantalla). */
const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && getComputedStyle(el).visibility !== 'hidden'
}
/** El primero visible (el menú de Agenda existe en la barra lateral y en la de abajo). */
const findTarget = (selector?: string) =>
  selector ? Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible) ?? null : null

/**
 * Recorrido sobre la pantalla real: oscurece todo menos lo que explica cada
 * paso y pone la explicación al lado (en el celular, como tarjeta abajo).
 * onStep deja la pantalla lista para el paso (pestaña, ficha abierta…) antes
 * de buscar el elemento. No se puede tocar la pantalla mientras está abierto.
 */
export function CommercialTour({ steps, onStep, onClose }: {
  steps: TourStep[]
  onStep: (step: TourStep) => void
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [mobile, setMobile] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [sheet, setSheet] = useState<Sheet>({ edge: 'bottom', max: null })
  const popRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const step = steps[i]
  const last = i === steps.length - 1

  // Dónde está lo señalado y dónde cabe la explicación: abajo, si no arriba, si no a un lado
  const measure = useCallback(() => {
    const small = window.innerWidth < MOBILE
    setMobile(small)
    const el = targetRef.current
    if (!el || !el.isConnected || !isVisible(el)) { setBox(null); setPos(null); setSheet({ edge: 'bottom', max: null }); return }
    const r = el.getBoundingClientRect()
    const b = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
    setBox(b)
    const vw = window.innerWidth, vh = window.innerHeight
    if (small) {
      // La tarjeta va abajo; si tapa lo señalado se encoge, y si ni así cabe, sube
      setPos(null)
      const natural = Math.min(popRef.current?.scrollHeight ?? 320, vh * 0.56)
      const below = vh - (b.y + b.h) - GAP
      const above = b.y - GAP
      if (natural <= below) setSheet({ edge: 'bottom', max: null })
      else if (below >= MIN_SHEET) setSheet({ edge: 'bottom', max: below })
      else if (above >= Math.min(natural, MIN_SHEET)) setSheet({ edge: 'top', max: Math.min(above, vh * 0.56) })
      // Algo muy alto (el formulario): la tarjeta en su mínimo, para tapar lo menos posible
      else setSheet({ edge: 'bottom', max: MIN_SHEET })
      return
    }
    const W = popRef.current?.offsetWidth ?? 380
    const H = popRef.current?.offsetHeight ?? 280
    let left = Math.min(Math.max(MARGIN, b.x), vw - W - MARGIN)
    let top = b.y + b.h + GAP
    if (top + H > vh - MARGIN) top = b.y - H - GAP
    if (top < MARGIN) {
      top = Math.max(MARGIN, Math.min(vh - H - MARGIN, b.y))
      left = b.x + b.w + GAP + W <= vw - MARGIN ? b.x + b.w + GAP : Math.max(MARGIN, b.x - W - GAP)
    }
    setPos({ left, top })
  }, [])

  // Cada paso: preparar la pantalla, esperar a que aparezca lo señalado y llevarlo a la vista
  useEffect(() => {
    let cancelled = false
    let tries = 0
    targetRef.current = null
    setBox(null)
    onStep(step)
    const look = () => {
      if (cancelled) return
      const el = findTarget(step.target)
      if (!el && step.target && tries++ < 15) { setTimeout(look, 100); return }
      targetRef.current = el
      if (el) {
        const small = window.innerWidth < MOBILE
        // En el celular, arriba: la explicación ocupa la parte de abajo
        el.style.scrollMarginTop = small ? '84px' : '96px'
        el.style.scrollMarginBottom = '24px'
        el.scrollIntoView({ block: small ? 'start' : 'nearest', inline: 'nearest' })
      }
      // Después del desplazamiento; con temporizador porque requestAnimationFrame se pausa a veces
      setTimeout(() => { if (!cancelled) measure() }, 60)
    }
    const first = setTimeout(look, 0)
    return () => { cancelled = true; clearTimeout(first) }
    // Solo al cambiar de paso: onStep es nuevo en cada render de la página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const again = () => { clearTimeout(timer); timer = setTimeout(measure, 30) }
    window.addEventListener('resize', again)
    window.addEventListener('scroll', again, true)
    return () => { clearTimeout(timer); window.removeEventListener('resize', again); window.removeEventListener('scroll', again, true) }
  }, [measure])

  const go = useCallback((d: number) => setI(n => Math.min(steps.length - 1, Math.max(0, n + d))), [steps.length])

  useEffect(() => { nextRef.current?.focus({ preventScroll: true }) }, [i])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (!last) go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === 'Tab') {
        // El foco no sale del recorrido
        const items = Array.from(popRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
        if (!items.length) return
        const at = items.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [go, last, onClose])

  const placed = !mobile && box && pos
  return (
    <div className={s.tour}>
      <div className={s.block} aria-hidden="true" />
      <div className={`${s.spot} ${box ? '' : s.spotNone}`} aria-hidden="true"
        style={box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h } : undefined} />
      <div ref={popRef} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        className={`${s.pop} ${mobile ? `${s.sheet} ${sheet.edge === 'top' ? s.sheetTop : ''}` : placed ? '' : s.center}`}
        style={placed ? { left: pos.left, top: pos.top } : mobile && sheet.max ? { maxHeight: sheet.max } : undefined}>
        <div className={s.head}>
          <span className={s.kicker}>Recorrido · Sistema Comercial</span>
          <span className={s.count}>Paso {i + 1} de {steps.length}</span>
        </div>
        <div className={s.body} id="tour-body" aria-live="polite">
          <h3 id="tour-title">{step.title}</h3>
          {step.body}
        </div>
        <div className={s.dots} aria-hidden="true">
          {steps.map((st, k) => <i key={st.id} className={k === i ? s.on : ''} />)}
        </div>
        <div className={s.foot}>
          {!last && <button type="button" className={`${s.btn} ${s.ghost}`} onClick={onClose}>Saltar</button>}
          {i > 0 && <button type="button" className={`${s.btn} ${s.soft}`} onClick={() => go(-1)}>Anterior</button>}
          <button ref={nextRef} type="button" className={`${s.btn} ${s.primary}`} onClick={() => (last ? onClose() : go(1))}>
            {last ? '¡Listo!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
