'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { shortDate } from '@/lib/reports'
import { moneyText } from '@/lib/commercialChanges'
import s from './reportes.module.css'

/**
 * Gráficas de Reportes, hechas a mano para que se vean como el resto de la app
 * y no carguen una librería: barras horizontales, la línea de lo vendido día
 * por día y columnas. Una sola serie en azul; donde hay dos, la clara es el
 * total y la oscura lo logrado (cotizado contra ganado). Todas dicen su número
 * a la vista o al pasar el dedo o el ratón.
 */

export type Tone = 'ok' | 'mid' | 'low'
/** Verde desde 80 %, ámbar desde 40 %, rojo abajo (igual que en Comercial). */
export const toneOf = (ratio: number): Tone => ratio >= 0.8 ? 'ok' : ratio >= 0.4 ? 'mid' : 'low'

export const money = (n: number) => moneyText(n)
export const pct = (ratio: number) => `${Math.round(ratio * 100)} %`

/** "$250 mil", "$1.2 M" para los ejes. */
export function compactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M`
  if (n >= 1_000) return `$${(n / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} mil`
  return `$${Math.round(n).toLocaleString('es-MX')}`
}

/** Un tope redondo para el eje: 4 rayas parejas que alcanzan el valor más alto. */
export function niceMax(v: number): number {
  if (v <= 0) return 4
  const rough = v / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(x => x >= rough) ?? 10 * mag
  return step * 4
}

/** ▲ 14 % · ▼ 3 % contra el periodo anterior. `points`: diferencia en puntos (cumplimiento). */
export function Delta({ now, before, money: isMoney, points, unit }: {
  now: number; before: number; money?: boolean; points?: boolean
  /** Para diferencias chicas en número: «2 más». */
  unit?: boolean
}) {
  if (!now && !before) return <span className={s.delta}>Sin actividad</span>
  const diff = now - before
  if (Math.abs(diff) < (points ? 0.005 : 0.000001)) return <span className={s.delta}>Igual que antes</span>
  const was = isMoney ? money(before) : points ? pct(before) : before.toLocaleString('es-MX')
  const pts = Math.round(Math.abs(diff) * 100)
  const size = points ? `${pts} ${pts === 1 ? 'punto' : 'puntos'}`
    : unit ? `${Math.abs(diff).toLocaleString('es-MX')} ${diff > 0 ? 'más' : 'menos'}`
    : before > 0 ? `${Math.round(Math.abs(diff) / before * 100)} %`
    : isMoney ? money(Math.abs(diff)) : `${Math.abs(diff).toLocaleString('es-MX')} más`
  const Icon = diff > 0 ? TrendingUp : TrendingDown
  return (
    <span className={`${s.delta} ${diff > 0 ? s.up : s.down}`} title={`Antes: ${was}`}>
      <Icon strokeWidth={2.6} aria-hidden="true" />
      <span className="sr-only">{diff > 0 ? 'Subió' : 'Bajó'} </span>{size}
    </span>
  )
}

export function Meter({ ratio, tone }: { ratio: number; tone?: Tone }) {
  return (
    <div className={s.meter} aria-hidden="true">
      <span className={s[tone ?? toneOf(ratio)]} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
    </div>
  )
}

export type BarRow = {
  key: string
  label: ReactNode
  /** El largo de la barra. */
  value: number
  /** Lo que se lee al final de la barra. */
  text: ReactNode
  /** Barra clara detrás (el total del que `value` es una parte). */
  back?: number
  tone?: Tone
}

/**
 * Barras horizontales. Con `track` se ve el fondo hasta el 100 % (avance
 * contra la meta); con `onPick` cada renglón se puede tocar.
 */
export function BarList({ rows, max, track, onPick, label, valueWidth, empty }: {
  rows: BarRow[]
  /** Lo que mide la barra completa (por omisión, el valor más alto). */
  max?: number
  track?: boolean
  onPick?: (key: string) => void
  /** Ancho de la columna de nombres. */
  label?: number
  valueWidth?: number
  empty?: string
}) {
  if (!rows.length) return <p className={s.empty}>{empty ?? 'Sin datos en este periodo.'}</p>
  const top = max ?? Math.max(1, ...rows.map(r => Math.max(r.value, r.back ?? 0)))
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`
  const style = { ...(label ? { '--label': `${label}px` } : {}), ...(valueWidth ? { '--value': `${valueWidth}px` } : {}) } as React.CSSProperties
  return (
    <div className={s.bars} style={style}>
      {rows.map(r => {
        const body = (
          <>
            <span className={s.barLabel}>{r.label}</span>
            <span className={`${s.track} ${track ? s.trackOn : ''}`} aria-hidden="true">
              {r.back !== undefined && <span className={`${s.fill} ${s.fillBack}`} style={{ width: w(r.back) }} />}
              {r.value > 0 && <span className={`${s.fill} ${r.tone ? s[r.tone] : ''}`} style={{ width: w(r.value) }} />}
            </span>
            <span className={`${s.barValue} ${s.num}`}>{r.text}</span>
          </>
        )
        return onPick
          ? <button key={r.key} type="button" className={`${s.bar} ${s.press}`} onClick={() => onPick(r.key)}>{body}</button>
          : <div key={r.key} className={s.bar}>{body}</div>
      })}
    </div>
  )
}

/**
 * Lo vendido sumado día por día: la línea azul llega hasta hoy y la gris
 * punteada es el periodo anterior. Al pasar el dedo o el ratón se ve el día
 * con los dos montos.
 */
export function CumulativeLine({ axis, values, previous, today, label, prevLabel }: {
  /** Todos los días del periodo (el eje). */
  axis: string[]
  /** Acumulado de cada día; null en los días que aún no llegan. */
  values: (number | null)[]
  /** Acumulado del periodo anterior, día por día desde su inicio (vacío si no se compara). */
  previous: number[]
  today: string
  label: string
  prevLabel: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const n = axis.length
  const last = values.reduce<number>((at, v, i) => v === null ? at : i, -1)
  const top = niceMax(Math.max(0, ...values.map(v => v ?? 0), ...previous))
  const x = (i: number) => (n <= 1 ? 0.5 : i / (n - 1)) * 600
  const y = (v: number) => 180 - (v / top) * 180
  const line = (list: number[]) => list.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const now = values.slice(0, last + 1).map(v => v ?? 0)
  const ticks = useMemo(() => {
    const idx = n <= 5 ? axis.map((_, i) => i) : [0, 1, 2, 3, 4].map(k => Math.round((k * (n - 1)) / 4))
    return [...new Set(idx)].map(i => ({ i, text: shortDate(axis[i], today) }))
  }, [axis, n, today])

  const move = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box || n < 2) return
    const i = Math.round(((clientX - box.left) / box.width) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const pos = (i: number, v: number) => ({ left: `${(x(i) / 600) * 100}%`, top: `${(y(v) / 180) * 100}%` })
  const end = last >= 0 ? values[last]! : 0
  const h = hover
  const hv = h !== null && h <= last ? values[h] : null
  const hp = h !== null && h < previous.length ? previous[h] : null
  const summary = `${label}: ${money(end)}${previous.length ? `. ${prevLabel} en los mismos días: ${money(previous[Math.min(last, previous.length - 1)] ?? 0)}` : ''}`

  return (
    <div className={s.plot}>
      <div className={s.yAxis} aria-hidden="true">
        {[4, 3, 2, 1, 0].map(k => <span key={k}>{compactMoney((top * k) / 4)}</span>)}
      </div>
      <div ref={ref} className={s.area}
        onPointerMove={e => move(e.clientX)} onPointerDown={e => move(e.clientX)} onPointerLeave={() => setHover(null)}>
        <svg viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label={summary}>
          {[0, 45, 90, 135].map(v => <line key={v} x1="0" x2="600" y1={v} y2={v} stroke="var(--paper-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <line x1="0" x2="600" y1="180" y2="180" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {previous.length > 1 && (
            <path d={line(previous)} fill="none" stroke="var(--muted-2)" strokeWidth="2" strokeDasharray="5 4"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          {now.length > 1 && (
            <>
              <path d={`${line(now)} L${x(last).toFixed(1)},180 L0,180 Z`} fill="var(--chart-1)" fillOpacity="0.1" />
              <path d={line(now)} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {last >= 0 && h === null && (
          <>
            <span className={s.dot} style={pos(last, end)} />
            <span className={`${s.endLabel} ${x(last) > 480 ? s.endLabelLeft : ''}`} style={pos(last, end)}>{money(end)}</span>
          </>
        )}
        {h !== null && (
          <>
            <span className={s.cross} style={{ left: `${(x(h) / 600) * 100}%` }} />
            {hp !== null && <span className={`${s.dot} ${s.dotPrev}`} style={pos(h, hp)} />}
            {hv !== null && <span className={s.dot} style={pos(h, hv)} />}
            <div className={s.tip} style={{
              left: `${(x(h) / 600) * 100}%`, top: 0,
              transform: `translate(${x(h) > 420 ? 'calc(-100% - 10px)' : '10px'}, 0)`,
            }}>
              <b>{shortDate(axis[h], today)}</b>
              <span><i />{label}: {hv !== null ? money(hv) : 'aún no llega'}</span>
              {hp !== null && <span><i className={s.tipPrev} />{prevLabel}: {money(hp)}</span>}
            </div>
          </>
        )}
      </div>
      <div className={s.xAxis} aria-hidden="true">{ticks.map(t => <span key={t.i}>{t.text}</span>)}</div>
    </div>
  )
}

/** Columnas (una por día, semana o mes). La última, más clara, si sigue en curso. */
export function Columns({ items, unit }: { items: { label: string; count: number; current?: boolean }[]; unit: string }) {
  if (!items.length) return <p className={s.empty}>Sin datos en este periodo.</p>
  const top = Math.max(1, ...items.map(i => i.count))
  const every = Math.ceil(items.length / 8)
  const grid = { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
  const total = items.reduce((t, i) => t + i.count, 0)
  return (
    <>
      <div className={s.cols} style={grid} role="img" aria-label={`${total.toLocaleString('es-MX')} ${unit} en el periodo`}>
        {items.map((it, i) => (
          <div key={i} className={`${s.col} ${it.current ? s.colNow : ''}`}>
            <i style={{ height: `${(it.count / top) * 100}%` }} />
            <span style={{ bottom: `${(it.count / top) * 100}%` }}>{it.label}: {it.count.toLocaleString('es-MX')}</span>
          </div>
        ))}
      </div>
      <div className={s.colsX} style={grid} aria-hidden="true">
        {items.map((it, i) => <span key={i}>{i % every === 0 || i === items.length - 1 ? it.label : ''}</span>)}
      </div>
    </>
  )
}
