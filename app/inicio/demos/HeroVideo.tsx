'use client'

import { useEffect, useRef, useState } from 'react'
import s from './demos.module.css'
import { Pause, Play } from 'lucide-react'

/**
 * Video del hero: un recorrido corto de Matices con datos de ejemplo, sin
 * sonido y en bucle. Se puede pausar; si la persona pidió menos movimiento
 * (prefers-reduced-motion) no arranca solo y se ve la portada fija.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    v.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [])

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {})
    else { v.pause(); setPlaying(false) }
  }

  return (
    <div className={s.video}>
      <video
        ref={ref} muted loop playsInline preload="metadata" poster="/video/matices-demo.jpg"
        aria-label="Video: un día con Matices. El resumen de pendientes en el celular, la meta del día, la búsqueda de un cliente en Contactos, una venta ganada y el avance del equipo."
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      >
        <source src="/video/matices-demo.mp4" type="video/mp4" />
        <source src="/video/matices-demo.webm" type="video/webm" />
      </video>
      <button type="button" className={`${s.videoBtn} ${s.press}`} onClick={toggle} aria-label={playing ? 'Pausar el video' : 'Reproducir el video'}>
        {playing
          ? <Pause fill="currentColor" aria-hidden="true" />
          : <Play fill="currentColor" aria-hidden="true" />}
        {playing ? 'Pausar' : 'Ver video'}
      </button>
    </div>
  )
}
