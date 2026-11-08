'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import type { Period } from '@/lib/commercial'
import { Ico, initials, useWide } from './ui'
import s from './comercial.module.css'

export type AmountKind = 'quoted' | 'sold'
type Status = 'abierta' | 'ganada' | 'perdida'
type Item = {
  id: string; contact_id: string; client: string; exists: boolean
  user_id: string | null; seller: string; amount: number; at: string; status?: Status
}
type Detail = { kind: AmountKind; total: number; items: Item[] }

const STATUS: Record<Status, { label: string; cls: string }> = {
  abierta: { label: 'Abierta', cls: s.stOpen },
  ganada: { label: 'Ganada', cls: s.stWon },
  perdida: { label: 'Perdida', cls: s.stLost },
}
const exact = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
/** "lun 3 nov" */
const shortDay = (iso: string) => new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))

/**
 * Detalle de «Cotizado» o «Vendido» en el Acumulado: a qué clientes, quién y
 * cuánto. En el celular es una hoja que sube desde abajo; en computadora, un
 * panel debajo de las tarjetas.
 */
export function AmountDetail({ kind, period, offset, title, onClose, onOpen }: {
  kind: AmountKind; period: Period; offset: number
  /** "Cotizado en noviembre" */
  title: string
  onClose: () => void
  onOpen: (contactId: string) => void
}) {
  const sheet = !useWide(761)
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [who, setWho] = useState('')
  const [by, setBy] = useState<'amount' | 'date'>('amount')
  const [shown, setShown] = useState(false)
  const [minH, setMinH] = useState<number>()
  const boxRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/data/commercial/summary/detail?period=${period}&offset=${offset}&kind=${kind}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d); setError('')
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar el detalle')
    }
  }, [period, offset, kind])
  useQueryEffect(() => { setData(null); setWho(''); setMinH(undefined); load() }, [load])
  useDataChanged(['commercial'], load)

  // Al filtrar, la hoja no se encoge: si bajara, los botones se moverían bajo
  // el dedo y el siguiente toque caería en el fondo (que la cierra)
  useLayoutEffect(() => {
    if (sheet && data && minH === undefined && boxRef.current) setMinH(boxRef.current.offsetHeight)
  }, [sheet, data, minH])

  // La hoja entra después del primer cuadro, para que la transición se vea
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 0)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!sheet) return
    closeRef.current?.focus({ preventScroll: true })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [sheet])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (!sheet || e.key !== 'Tab') return
    const f = [...(boxRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
    if (!f.length) return
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
  }

  const sellers = useMemo(() => {
    const seen = new Map<string, string>()
    for (const i of data?.items ?? []) seen.set(i.user_id ?? '', i.seller)
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [data])
  const list = useMemo(() => {
    const items = (data?.items ?? []).filter(i => !who || (i.user_id ?? '') === who)
    return items.slice().sort((a, b) => by === 'amount' ? b.amount - a.amount : b.at.localeCompare(a.at))
  }, [data, who, by])
  const total = list.reduce((t, i) => t + i.amount, 0)
  const quoted = kind === 'quoted'
  const noun = quoted ? (list.length === 1 ? 'cotización' : 'cotizaciones') : (list.length === 1 ? 'venta' : 'ventas')

  const open = (i: Item) => {
    if (!i.exists) return
    if (sheet) onClose()
    onOpen(i.contact_id)
  }

  const head = (
    <div className={s.detailHead}>
      <div className={s.detailTitle}>
        <h3 id="amount-detail-title">{title}</h3>
        <button ref={closeRef} className={`${s.detailClose} ${s.press}`} onClick={onClose} aria-label="Cerrar detalle"><Ico.close /></button>
      </div>
      {data && (
        <p className={s.detailSum}>
          <b className={s.num}>{exact(total)}</b> · {list.length.toLocaleString('es-MX')} {noun}
        </p>
      )}
      {sellers.length > 1 && (
        <div className={s.detailChips} role="group" aria-label="Vendedor">
          <button className={`${s.pill} ${s.press}`} aria-pressed={!who} onClick={() => setWho('')}>Todos</button>
          {sellers.map(([id, name]) => (
            <button key={id || 'none'} className={`${s.pill} ${s.press}`} aria-pressed={who === id} onClick={() => setWho(id)}>{name}</button>
          ))}
        </div>
      )}
      {data && list.length > 1 && (
        <div className={s.detailSort}>
          <span>Ordenar por</span>
          <button className={`${s.pill} ${s.press}`} aria-pressed={by === 'amount'} onClick={() => setBy('amount')}>Monto</button>
          <button className={`${s.pill} ${s.press}`} aria-pressed={by === 'date'} onClick={() => setBy('date')}>Fecha</button>
        </div>
      )}
    </div>
  )

  const body = error ? (
    <div className={s.emptyList} role="alert">{error}</div>
  ) : !data ? (
    <div className={s.emptyList}>Cargando…</div>
  ) : list.length === 0 ? (
    <div className={s.emptyList}>{quoted ? 'No hubo cotizaciones en este periodo.' : 'No hubo ventas en este periodo.'}</div>
  ) : (
    <ul className={s.detailList}>
      {list.map(i => (
        <li key={i.id}>
          <button className={`${s.detailRow} ${s.press}`} onClick={() => open(i)} disabled={!i.exists}
            aria-label={`${i.client}, ${i.seller}, ${shortDay(i.at)}, ${exact(i.amount)}${i.status ? `, ${STATUS[i.status].label}` : ''}`}>
            <span className={s.avatar} style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)', width: 34, height: 34 }} aria-hidden="true">{initials(i.client)}</span>
            <span className={s.detailWho}>
              <b>{i.client}</b>
              <span>{i.seller} · {shortDay(i.at)}</span>
            </span>
            <span className={s.detailAmt}>
              <b className={s.num}>{exact(i.amount)}</b>
              {i.status && <span className={`${s.st} ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )

  if (!sheet) {
    return (
      <section ref={boxRef} className={`${s.elev} ${s.detailPanel}`} aria-labelledby="amount-detail-title" onKeyDown={onKey}>
        {head}
        {body}
      </section>
    )
  }
  return (
    <div className={`${s.detailLayer} ${shown ? s.detailShown : ''}`}>
      <div className={s.detailScrim} onClick={onClose} aria-hidden="true" />
      <div ref={boxRef} className={s.detailSheet} style={{ minHeight: minH }} role="dialog" aria-modal="true" aria-labelledby="amount-detail-title" onKeyDown={onKey}>
        <div className={s.detailGrab} aria-hidden="true" />
        {head}
        <div className={s.detailScroll}>{body}</div>
      </div>
    </div>
  )
}
