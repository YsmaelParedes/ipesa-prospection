'use client'

import { useMemo, useRef, useState } from 'react'
import { EstadoChip, TipoChip } from '@/components/CrmUI'
import s from './inicio.module.css'

/**
 * Demo de Leads para el sitio: tablero con las etapas reales de la app y datos
 * de ejemplo. Se mueve una cotización tocándola y eligiendo la etapa (o
 * arrastrándola en computadora); las cifras se recalculan al momento.
 * Todo vive en el navegador: no toca la base de datos.
 */

type Stage = 'Nuevo' | 'En seguimiento' | 'Cotizado' | 'Ganado / Venta realizada' | 'Perdido'
type Lead = { id: string; name: string; segment: string; amount: number; next: string; stage: Stage }

const BOARD: { stage: Stage; label: string; tone: string }[] = [
  { stage: 'Nuevo', label: 'Nuevo', tone: s.colNuevo },
  { stage: 'En seguimiento', label: 'En seguimiento', tone: s.colSeg },
  { stage: 'Cotizado', label: 'Cotizado', tone: s.colCot },
  { stage: 'Ganado / Venta realizada', label: 'Ganado', tone: s.colWon },
]

const START: Lead[] = [
  { id: 'kl', name: 'Karen López', segment: 'Hogar', amount: 4850, next: 'Confirmar el color de la sala', stage: 'Nuevo' },
  { id: 'mt', name: 'Mariana Torres', segment: 'Hogar', amount: 2300, next: 'Mandar muestras de vinílica', stage: 'Nuevo' },
  { id: 'cr', name: 'Constructora Ríos', segment: 'Constructor', amount: 38200, next: 'Enviar precio por volumen', stage: 'En seguimiento' },
  { id: 'as', name: 'Arq. Andrea Solís', segment: 'Arquitecto', amount: 12600, next: 'Esperar el visto bueno del cliente', stage: 'Cotizado' },
  { id: 'hp', name: 'Hotel Las Palmas', segment: 'Empresa', amount: 54000, next: 'Visita a obra el jueves', stage: 'Cotizado' },
  { id: 'jh', name: 'José Hernández', segment: 'Pintor', amount: 6900, next: 'Entregar el pedido', stage: 'Ganado / Venta realizada' },
]

const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const initials = (n: string) => n.replace(/^Arq\.\s*/, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const WON: Stage = 'Ganado / Venta realizada'

export function LeadsDemo() {
  const [leads, setLeads] = useState<Lead[]>(START)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)
  const [announce, setAnnounce] = useState('')
  const [moved, setMoved] = useState(false)
  const [celebrate, setCelebrate] = useState<{ key: number; text: string } | null>(null)
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stats = useMemo(() => {
    const sum = (f: (l: Lead) => boolean) => leads.filter(f).reduce((t, l) => t + l.amount, 0)
    const closed = leads.filter(l => l.stage === WON || l.stage === 'Perdido').length
    const won = leads.filter(l => l.stage === WON).length
    return {
      open: sum(l => l.stage !== WON && l.stage !== 'Perdido'),
      quoted: sum(l => l.stage === 'Cotizado'),
      won: sum(l => l.stage === WON),
      rate: closed ? Math.round((won / closed) * 100) : 0,
      lost: leads.filter(l => l.stage === 'Perdido'),
    }
  }, [leads])

  const move = (id: string, stage: Stage) => {
    const lead = leads.find(l => l.id === id)
    if (!lead || lead.stage === stage) return
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, stage } : l)))
    setMoved(true)
    setSelected(null)
    const label = stage === WON ? 'Ganado' : stage
    setAnnounce(`${lead.name} pasó a ${label}.`)
    if (stage === WON) {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current)
      setCelebrate({ key: Date.now(), text: `¡Venta registrada! ${money(lead.amount)} de ${lead.name}` })
      celebrateTimer.current = setTimeout(() => setCelebrate(null), 3200)
    }
  }

  const reset = () => { setLeads(START); setSelected(null); setMoved(false); setCelebrate(null); setAnnounce('Demo reiniciada.') }
  const current = leads.find(l => l.id === selected) ?? null

  return (
    <div className={s.demo}>
      <div className={s.winBar}><i /><i /><i /><span>Leads · Pinturas La Paleta</span></div>

      <div className={s.demoBody}>
        <div className={s.demoKpis}>
          <div className={s.demoKpi}><small>En juego</small><strong>{money(stats.open)}</strong><em>oportunidades abiertas</em></div>
          <div className={s.demoKpi}><small>Cotizado</small><strong>{money(stats.quoted)}</strong><em>esperando respuesta</em></div>
          <div className={`${s.demoKpi} ${s.demoKpiWon}`}><small>Vendido</small><strong key={stats.won} className={s.bump}>{money(stats.won)}</strong><em>{stats.rate}% de cierre</em></div>
        </div>

        {!moved && (
          <p className={s.demoHint} role="note">
            <span className={s.demoHintDot} aria-hidden="true" />
            <span>Pruébalo: toca a <strong>Karen López</strong> y muévela a <strong>Cotizado</strong>.</span>
          </p>
        )}

        <div className={s.board}>
          {BOARD.map(col => {
            const items = leads.filter(l => l.stage === col.stage)
            const total = items.reduce((t, l) => t + l.amount, 0)
            return (
              <section
                key={col.stage}
                className={`${s.col} ${col.tone} ${over === col.stage ? s.colOver : ''}`}
                aria-label={`${col.label}: ${items.length} ${items.length === 1 ? 'oportunidad' : 'oportunidades'}`}
                onDragOver={e => { if (dragging) { e.preventDefault(); setOver(col.stage) } }}
                onDragLeave={() => setOver(o => (o === col.stage ? null : o))}
                onDrop={e => { e.preventDefault(); if (dragging) move(dragging, col.stage); setDragging(null); setOver(null) }}
              >
                <header className={s.colHead}>
                  <span className={s.colDot} aria-hidden="true" />
                  <strong>{col.label}</strong>
                  <span className={s.colCount}>{items.length}</span>
                  <small>{money(total)}</small>
                </header>
                <div className={s.colList}>
                  {items.length === 0 && <div className={s.colEmpty}>Suelta aquí</div>}
                  {items.map(l => (
                    <button
                      key={`${l.id}-${l.stage}`}
                      type="button"
                      draggable
                      onDragStart={e => { setDragging(l.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id) }}
                      onDragEnd={() => { setDragging(null); setOver(null) }}
                      onClick={() => setSelected(sel => (sel === l.id ? null : l.id))}
                      aria-pressed={selected === l.id}
                      className={`${s.card} ${selected === l.id ? s.cardOn : ''} ${dragging === l.id ? s.cardDrag : ''} ${!moved && l.id === 'kl' ? s.cardPulse : ''}`}
                    >
                      <span className={s.cardTop}>
                        <span className={s.cardAv} aria-hidden="true">{initials(l.name)}</span>
                        <span className={s.cardName}>{l.name}</span>
                      </span>
                      <span className={s.cardMeta}><TipoChip value={l.segment} small /><strong>{money(l.amount)}</strong></span>
                      <span className={s.cardNext}>{l.next}</span>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <div className={`${s.demoActions} ${current ? s.demoActionsOn : ''}`} aria-hidden={!current}>
          {current ? (
            <>
              <span className={s.demoActionsTitle}>Mover a <strong>{current.name}</strong>:</span>
              <div className={s.demoActionBtns}>
                {BOARD.filter(c => c.stage !== current.stage).map(c => (
                  <button key={c.stage} type="button" className={`${s.stageBtn} ${c.tone}`} onClick={() => move(current.id, c.stage)}>
                    <span className={s.colDot} aria-hidden="true" />{c.label}
                  </button>
                ))}
                <button type="button" className={`${s.stageBtn} ${s.stageLost}`} onClick={() => move(current.id, 'Perdido')}>Perdido</button>
              </div>
            </>
          ) : (
            <span className={s.demoActionsIdle}>Toca una oportunidad para moverla de etapa<span className={s.hideSm}> o arrástrala a otra columna</span>.</span>
          )}
        </div>

        <div className={s.demoFoot}>
          <span>
            {stats.lost.length > 0
              ? <>Perdidas: {stats.lost.map(l => l.name).join(', ')} · <EstadoChip value="Perdido" small /></>
              : 'Datos de ejemplo: nada de esto se guarda.'}
          </span>
          <button type="button" className={s.linkBtn} onClick={reset}>Reiniciar demo</button>
        </div>
      </div>

      {celebrate && (
        <div key={celebrate.key} className={s.celebrate} role="status">
          <span className={s.celebrateRing} aria-hidden="true" />{celebrate.text}
        </div>
      )}
      <p className={s.srOnly} aria-live="polite">{announce}</p>
    </div>
  )
}
