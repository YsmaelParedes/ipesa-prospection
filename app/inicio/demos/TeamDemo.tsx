'use client'

import { useState } from 'react'
import { useToast } from './shared'
import s from './demos.module.css'

/**
 * Demo de Equipo: cada vendedor contra su meta del día. Registras ventas o
 * llamadas, cambias la meta y las barras se recalculan (llamadas y ventas
 * pesan como en la app: cada indicador cuenta hasta su 100 %).
 */

type Seller = { name: string; calls: number; sales: number }
const START: Seller[] = [
  { name: 'Valeria', calls: 24, sales: 1 },
  { name: 'Karen', calls: 16, sales: 0 },
  { name: 'Tú', calls: 10, sales: 0 },
]
const SALES_GOAL = 2

const compliance = (m: Seller, goal: number) =>
  Math.round(((Math.min(m.calls / goal, 1) + Math.min(m.sales / SALES_GOAL, 1)) / 2) * 100)

export function TeamDemo() {
  const [team, setTeam] = useState(START)
  const [goal, setGoal] = useState(30)
  const toast = useToast()

  const add = (i: number, kind: 'calls' | 'sales') => {
    // Una venta también cuenta como llamada (se registró hablando con el cliente)
    setTeam(t => t.map((m, j) => (j !== i ? m
      : kind === 'sales' ? { ...m, sales: m.sales + 1, calls: m.calls + 1 }
      : { ...m, calls: m.calls + 5 })))
    toast.show(kind === 'sales' ? `Venta registrada: ${team[i].name}` : `+5 llamadas: ${team[i].name}`)
  }

  return (
    <div data-demo="team">
      {toast.node}
      <div className={s.bars}>
        {team.map(m => {
          const pct = compliance(m, goal)
          return (
            <div key={m.name}>
              <div className={s.who}>
                <span>{m.name} <small>· {m.calls} llamadas · {m.sales} {m.sales === 1 ? 'venta' : 'ventas'}</small></span>
                <span>{pct} %{pct >= 100 ? ' 🎉' : ''}</span>
              </div>
              <span className={s.track} aria-hidden="true" style={{ display: 'block' }}><b style={{ width: `${pct}%` }} /></span>
            </div>
          )
        })}
      </div>

      <p className={s.label}>Registra una venta de…</p>
      <div className={s.chips}>
        {team.map((m, i) => (
          <button key={m.name} type="button" className={`${s.chip} ${s.press}`} aria-pressed="false" onClick={() => add(i, 'sales')} data-demo-sale={m.name}>{m.name}</button>
        ))}
      </div>
      <p className={s.label}>Suma 5 llamadas a…</p>
      <div className={s.chips}>
        {team.map((m, i) => (
          <button key={m.name} type="button" className={`${s.chip} ${s.press}`} aria-pressed="false" onClick={() => add(i, 'calls')}>{m.name}</button>
        ))}
      </div>

      <p className={s.label}>Meta diaria de llamadas por vendedor</p>
      <div className={s.stepper}>
        <button type="button" className={s.press} onClick={() => setGoal(g => Math.max(10, g - 5))} aria-label="Bajar la meta" data-demo-goal-down>−</button>
        <span aria-live="polite">{goal}</span>
        <button type="button" className={s.press} onClick={() => setGoal(g => Math.min(60, g + 5))} aria-label="Subir la meta">+</button>
      </div>
    </div>
  )
}
