'use client'

import { useEffect, useRef, useState } from 'react'
import s from './demos.module.css'

/**
 * Demo de WhatsApp con el agente de IA: escribes como cliente, la IA contesta
 * con la información de la tienda y, si pides una cotización, pasa el chat al
 * equipo y contesta una vendedora. Las respuestas son de ejemplo.
 */

type Msg = { id: number; kind: 'in' | 'ai' | 'team' | 'sys'; text: string }
const START: Msg[] = [
  { id: 1, kind: 'in', text: 'Hola, ¿qué horario tienen?' },
  { id: 2, kind: 'ai', text: 'Abrimos de lunes a sábado de 9:00 a 19:00. ¿Te ayudo con algo más?' },
]
const SUGGESTIONS = ['¿Igualan colores?', '¿Cuánto rinde una cubeta?', 'Quiero cotizar 15 cubetas']

function aiAnswer(q: string): string | 'handoff' {
  const t = q.toLowerCase()
  if (/cotiz|precio|cubetas|cuanto cuesta|cuánto cuesta/.test(t)) return 'handoff'
  if (t.includes('color')) return 'Sí, igualamos con una muestra física o el código del color. Tarda unos 15 minutos.'
  if (t.includes('rinde')) return 'Una cubeta de 19 L rinde de 80 a 100 m² a una mano, según la superficie.'
  if (/envi|domicilio|entrega/.test(t)) return 'Entregamos a domicilio en la zona; es gratis desde $1,500.'
  if (/factura/.test(t)) return 'Sí, te facturamos el mismo mes de la compra con tu ticket.'
  return 'Con gusto. ¿Buscas pintura para interior, exterior o impermeabilizante?'
}

export function WhatsAppDemo() {
  const [msgs, setMsgs] = useState<Msg[]>(START)
  const [text, setText] = useState('')
  const [typing, setTyping] = useState<'ai' | 'team' | null>(null)
  const [handed, setHanded] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(3)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }) }, [msgs, typing])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)) }
  const push = (kind: Msg['kind'], t: string) => setMsgs(m => [...m, { id: nextId.current++, kind, text: t }])

  const send = (value = text) => {
    const q = value.trim()
    if (!q || typing) return
    setText('')
    push('in', q)
    if (handed) {
      setTyping('team')
      later(900, () => { setTyping(null); push('team', 'Perfecto, te mando la cotización por aquí en unos minutos.') })
      return
    }
    const answer = aiAnswer(q)
    setTyping('ai')
    later(800, () => {
      setTyping(null)
      if (answer !== 'handoff') { push('ai', answer); return }
      push('ai', '¡Claro! Le paso tu solicitud a alguien del equipo para darte el mejor precio.')
      push('sys', 'La IA pasó el chat al equipo · aviso en el celular')
      setHanded(true)
      later(500, () => setTyping('team'))
      later(1500, () => { setTyping(null); push('team', '¡Hola! Soy Valeria. ¿Para qué superficie son las 15 cubetas?') })
    })
  }
  const reset = () => { timers.current.forEach(clearTimeout); setMsgs(START); setHanded(false); setTyping(null); setText('') }

  return (
    <div data-demo="whatsapp">
      <div className={s.chat} ref={chatRef} aria-live="polite" aria-label="Conversación de ejemplo">
        {msgs.map(m => m.kind === 'sys' ? (
          <span key={m.id} className={s.sys}>{m.text}</span>
        ) : (
          <div key={m.id} className={`${s.msg} ${m.kind === 'in' ? s.msgIn : m.kind === 'ai' ? s.msgAi : s.msgTeam}`}>
            {m.kind === 'ai' && <small>Agente IA</small>}
            {m.kind === 'team' && <small>Valeria · del equipo</small>}
            {m.text}
          </div>
        ))}
        {typing && <span className={s.typing}>{typing === 'ai' ? 'El agente IA está escribiendo…' : 'Valeria está escribiendo…'}</span>}
      </div>
      <p className={s.label}>Escribe como si fueras el cliente</p>
      <div className={s.chips}>
        {SUGGESTIONS.map(q => (
          <button key={q} type="button" className={`${s.chip} ${s.press}`} aria-pressed="false" onClick={() => send(q)} disabled={!!typing} data-demo-suggest={q}>{q}</button>
        ))}
        {handed && <button type="button" className={`${s.chip} ${s.press}`} aria-pressed="false" onClick={reset}>Empezar de nuevo</button>}
      </div>
      <form className={s.composer} onSubmit={e => { e.preventDefault(); send() }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje de ejemplo" maxLength={200} />
        <button type="submit" className={`${s.primary} ${s.send} ${s.press}`} disabled={!text.trim() || !!typing}>Enviar</button>
      </form>
    </div>
  )
}
