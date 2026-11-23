'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Filter, X } from 'lucide-react'
import { Select } from '@/components/Select'
import {
  COMPARE_LABELS, DEFAULT_FILTERS, PRESETS, PRESET_LABELS, activeFilterCount, rangeSpan,
  type Preset, type ReportFilters, type ReportRange,
} from '@/lib/reports'
import s from './reportes.module.css'

export type FilterOptions = { sellers: { id: string; name: string }[]; zones: string[]; segments: string[] }

type Props = {
  filters: ReportFilters
  onChange: (next: ReportFilters) => void
  options?: FilterOptions
  /** Sin periodo ni comparar (Equipo hoy siempre es hoy). */
  noPeriod?: boolean
  /** El vendedor no elige vendedor: siempre ve lo suyo. */
  noSellers?: boolean
  /** El periodo que resolvió el servidor, para decir sus fechas. */
  range?: Pick<ReportRange, 'from' | 'end'> & { today: string }
  /** En el celular: los filtros van en un panel. */
  compact?: boolean
}

const ALL_ZONES = 'Todas las zonas'
const ALL_SEGMENTS = 'Todos los segmentos'

/**
 * Barra de filtros de Reportes. En la computadora, todo en un renglón; en el
 * celular, el periodo a la vista y lo demás en el panel «Filtros», que dice
 * cuántos hay puestos.
 */
export function ReportFilters(props: Props) {
  const { filters: f, onChange, compact, noPeriod } = props
  const [sheet, setSheet] = useState(false)
  const n = activeFilterCount({ ...f, sellers: props.noSellers ? [] : f.sellers })

  if (!compact) {
    return (
      <>
        {!noPeriod && <PeriodPicker {...props} />}
        {!noPeriod && <CompareCheck {...props} />}
        {!props.noSellers && <SellerPicker {...props} />}
        <PlaceSelects {...props} />
        {n > 0 && (
          <button type="button" className={`${s.linkBtn} ${s.press}`}
            onClick={() => onChange({ ...f, sellers: [], zone: '', segment: '' })}>Quitar filtros</button>
        )}
      </>
    )
  }
  return (
    <>
      <button type="button" className={`${s.fb} ${n ? s.fbSet : ''} ${s.press}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
        <Filter aria-hidden="true" />Filtros{n > 0 && <span className={s.count}>{n}</span>}
      </button>
      {!noPeriod && <PeriodPicker {...props} />}
      {sheet && <FilterSheet {...props} onClose={() => setSheet(false)} />}
    </>
  )
}

function PeriodPicker({ filters: f, onChange, range }: Props) {
  const today = range?.today ?? ''
  const [from, setFrom] = useState(f.from)
  const [to, setTo] = useState(f.to)
  useEffect(() => { setFrom(f.from); setTo(f.to) }, [f.from, f.to])
  const pick = (p: string) => {
    const period = p as Preset
    if (period === 'custom') {
      // Arranca con lo que se está viendo, para solo mover un extremo
      onChange({ ...f, period, from: f.from || range?.from || today, to: f.to || range?.end || today })
    } else onChange({ ...f, period, from: '', to: '' })
  }
  const apply = (a: string, b: string) => { if (a && b && a <= b) onChange({ ...f, period: 'custom', from: a, to: b }) }
  return (
    <>
      <Select value={f.period} onChange={pick} aria-label="Periodo" className={`${s.sel} ${s.press}`}
        options={PRESETS.map(p => ({ value: p, label: PRESET_LABELS[p] }))} />
      {f.period === 'custom' ? (
        <span className={s.dates}>
          <input type="date" aria-label="Desde" value={from} max={to || today} onChange={e => { setFrom(e.target.value); apply(e.target.value, to) }} />
          <span>al</span>
          <input type="date" aria-label="Hasta" value={to} min={from} max={today} onChange={e => { setTo(e.target.value); apply(from, e.target.value) }} />
        </span>
      ) : range && (
        <span className={s.span}>{rangeSpan(range, range.today)}</span>
      )}
    </>
  )
}

function CompareCheck({ filters: f, onChange }: Props) {
  return (
    <label className={s.check}>
      <input type="checkbox" checked={f.compare} onChange={e => onChange({ ...f, compare: e.target.checked })} />
      {COMPARE_LABELS[f.period]}
    </label>
  )
}

function SellerPicker({ filters: f, onChange, options }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const sellers = options?.sellers ?? []
  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key) }
  }, [open])
  if (sellers.length < 2) return null
  const chosen = sellers.filter(x => f.sellers.includes(x.id))
  const text = !chosen.length ? 'Todos' : chosen.length === 1 ? chosen[0].name : `${chosen.length} vendedores`
  const toggle = (id: string) => onChange({ ...f, sellers: f.sellers.includes(id) ? f.sellers.filter(x => x !== id) : [...f.sellers, id] })
  return (
    <div ref={box} className={s.picker}>
      <button type="button" className={`${s.fb} ${chosen.length ? s.fbSet : ''} ${s.press}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        Vendedor: <b>{text}</b><ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className={s.pop} role="group" aria-label="Vendedores">
          <label className={`${s.check} ${s.popAll}`}>
            <input type="checkbox" checked={!chosen.length} onChange={() => onChange({ ...f, sellers: [] })} />Todos
          </label>
          {sellers.map(x => (
            <label key={x.id} className={s.check}>
              <input type="checkbox" checked={f.sellers.includes(x.id)} onChange={() => toggle(x.id)} />{x.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function PlaceSelects({ filters: f, onChange, options, wide }: Props & { wide?: boolean }) {
  const zones = options?.zones ?? []
  const segments = options?.segments ?? []
  // Lo elegido se queda en la lista aunque ya no esté en el catálogo
  const zoneList = f.zone && !zones.includes(f.zone) ? [f.zone, ...zones] : zones
  const segList = f.segment && !segments.includes(f.segment) ? [f.segment, ...segments] : segments
  return (
    <>
      {zoneList.length > 0 && (
        <Select value={f.zone} onChange={zone => onChange({ ...f, zone })} aria-label="Zona"
          className={`${s.sel} ${f.zone ? s.selSet : ''} ${s.press}`} style={wide ? { width: '100%' } : undefined}
          options={[{ value: '', label: ALL_ZONES }, ...zoneList.map(z => ({ value: z, label: z }))]} />
      )}
      {segList.length > 0 && (
        <Select value={f.segment} onChange={segment => onChange({ ...f, segment })} aria-label="Segmento"
          className={`${s.sel} ${f.segment ? s.selSet : ''} ${s.press}`} style={wide ? { width: '100%' } : undefined}
          options={[{ value: '', label: ALL_SEGMENTS }, ...segList.map(z => ({ value: z, label: z }))]} />
      )}
    </>
  )
}

/** Panel de filtros del celular: se aplican al tocar «Ver resultados». */
function FilterSheet(props: Props & { onClose: () => void }) {
  const { filters, onChange, onClose, options, noSellers, noPeriod } = props
  const [draft, setDraft] = useState(filters)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', key) }
  }, [onClose])
  const sellers = options?.sellers ?? []
  const toggle = (id: string) => setDraft(d => ({ ...d, sellers: d.sellers.includes(id) ? d.sellers.filter(x => x !== id) : [...d.sellers, id] }))
  return (
    <div className={s.layer}>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="report-filters-title">
        <div className={s.grab} aria-hidden="true" />
        <div className={s.sheetHead}>
          <h2 id="report-filters-title">Filtros</h2>
          <button ref={closeRef} type="button" className={s.close} onClick={onClose} aria-label="Cerrar"><X aria-hidden="true" /></button>
        </div>
        <div className={s.sheetBody}>
          {!noPeriod && (
            <label className={s.check}>
              <input type="checkbox" checked={draft.compare} onChange={e => setDraft(d => ({ ...d, compare: e.target.checked }))} />
              {COMPARE_LABELS[draft.period]}
            </label>
          )}
          {!noSellers && sellers.length > 1 && (
            <div className={s.group}>
              <h3>Vendedor{draft.sellers.length ? ` · ${draft.sellers.length} ${draft.sellers.length === 1 ? 'elegido' : 'elegidos'}` : ''}</h3>
              <div className={s.checks}>
                {sellers.map(x => (
                  <label key={x.id} className={s.check}>
                    <input type="checkbox" checked={draft.sellers.includes(x.id)} onChange={() => toggle(x.id)} />{x.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {((options?.zones.length ?? 0) > 0 || (options?.segments.length ?? 0) > 0) && (
            <div className={s.group} style={{ display: 'grid', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Zona y segmento</h3>
              <PlaceSelects {...props} filters={draft} onChange={setDraft} wide />
            </div>
          )}
        </div>
        <div className={s.sheetFoot}>
          <button type="button" className="btn btn-ghost" style={{ flex: '0 0 120px' }}
            onClick={() => setDraft(d => ({ ...d, sellers: [], zone: '', segment: '', compare: DEFAULT_FILTERS.compare }))}>Limpiar</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onChange(draft); onClose() }}>Ver resultados</button>
        </div>
      </div>
    </div>
  )
}
