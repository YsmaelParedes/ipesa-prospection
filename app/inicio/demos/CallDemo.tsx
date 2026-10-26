'use client'

import { useState } from 'react'
import { initials, useToast } from './shared'
import s from './demos.module.css'

/**
 * Demo de la pantalla Hoy del Sistema Comercial: eliges a un cliente, cómo te
 * fue y cuándo volver a contactarlo; al guardar sale de la lista y avanza tu
 * meta del día, como en la app.
 */

type Item = { id: string; name: string; sub: string; when: 'Vencido' | 'Hoy' | 'Nuevo' }
const START: Item[] = [
  { id: 'fa', name: 'Ferretería Arce', sub: 'Atlixco · cotización de $17,005', when: 'Vencido' },
  { id: 'pl', name: 'Pinturas La Luz', sub: 'Puebla · volver a llamar', when: 'Hoy' },
  { id: 'hs', name: 'Hotel Sol', sub: 'Puebla · prospecto', when: 'Nuevo' },
  { id: 'jr', name: 'José Ramírez', sub: 'San Andrés · pintor', when: 'Nuevo' },
]
const WHEN_TONE = { Vencido: s.tRed, Hoy: s.tWarn, Nuevo: s.tInfo }
const RESULTS = ['Sin contacto', 'Contactado', 'Cotización', 'Venta', 'No interesado'] as const
type Result = typeof RESULTS[number]
// La fecha que sugiere la app según el resultado
const SUGGESTED: Record<Result, string> = { 'Sin contacto': 'Mañana', Contactado: 'En 3 días', 'Cotización': 'En 2 días', Venta: 'En 30 días', 'No interesado': 'En 90 días' }
const GOAL = 30

export function CallDemo() {
  const [items, setItems] = useState(START)
  const [calls, setCalls] = useState(12)
  const [selected, setSelected] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [when, setWhen] = useState<string | null>(null)
  const toast = useToast()
  const current = items.find(i => i.id === selected) ?? null

  const pick = (id: string) => { setSelected(id); setResult(null); setWhen(null) }
  const chooseResult = (r: Result) => { setResult(r); setWhen(SUGGESTED[r]) }
  const save = () => {
    if (!current || !result) return
    setCalls(c => c + 1)
    toast.show(`${current.name}: ${result.toLowerCase()} · vuelve ${(when ?? '').toLowerCase()}`)
    const rest = items.filter(i => i.id !== current.id)
    setItems(rest)
    // Como en la app: "Guardar y siguiente" abre al próximo de la lista
    setSelected(rest[0]?.id ?? null); setResult(null); setWhen(null)
  }
  const reset = () => { setItems(START); setCalls(12); setSelected(null); setResult(null); setWhen(null) }

  return (
    <div data-demo="call">
      {toast.node}
      <div className={s.progress}>
        <span>Tu meta de hoy · {calls}/{GOAL} llamadas</span>
        <span className={s.track} aria-hidden="true"><b style={{ width: `${Math.min(100, (calls / GOAL) * 100)}%` }} /></span>
      </div>

      <div className={s.card}>
        {items.length ? items.map(i => (
          <button key={i.id} type="button" className={`${s.row} ${s.press}`} aria-pressed={selected === i.id} onClick={() => pick(i.id)} data-demo-item={i.id}>
            <span className={s.av}>{initials(i.name)}</span>
            <span className={s.rowMain}>{i.name}<small>{i.sub}</small></span>
            <span className={`${s.tag} ${WHEN_TONE[i.when]}`}>{i.when}</span>
          </button>
        )) : (
          <div className={s.done}>
            ¡Terminaste tu lista de hoy!{' '}
            <button type="button" className={`${s.chip} ${s.press}`} aria-pressed="false" onClick={reset}>Volver a empezar</button>
          </div>
        )}
      </div>

      {current ? (
        <div>
          <p className={s.label}>¿Cómo te fue con {current.name}?</p>
          <div className={s.chips}>
            {RESULTS.map(r => (
              <button key={r} type="button" className={`${s.chip} ${s.press}`} aria-pressed={result === r} onClick={() => chooseResult(r)} data-demo-result={r}>{r}</button>
            ))}
          </div>
          {result && (
            <>
              <p className={s.label}>Volver a contactar (te la sugerimos)</p>
              <div className={s.chips}>
                {[SUGGESTED[result], ...['Mañana', 'En 1 semana'].filter(d => d !== SUGGESTED[result])].map(d => (
                  <button key={d} type="button" className={`${s.chip} ${s.press}`} aria-pressed={when === d} onClick={() => setWhen(d)}>{d}</button>
                ))}
              </div>
              <button type="button" className={`${s.primary} ${s.press}`} onClick={save} data-demo-save>Guardar y siguiente</button>
            </>
          )}
        </div>
      ) : items.length > 0 && <p className={s.hint}>Toca a un cliente de tu lista para registrar la llamada.</p>}
    </div>
  )
}
