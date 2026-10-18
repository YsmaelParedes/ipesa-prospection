'use client'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Desplegable propio de la app (reemplaza al <select> nativo, cuya lista la
 * dibuja el sistema operativo y no se puede diseñar).
 *  · Tarjeta con palomita en la opción elegida, punto de color y texto de ayuda opcionales.
 *  · Teclado como un select: flechas, Inicio/Fin, Enter/Espacio, Escape, Tab y
 *    escribir para saltar a una opción. Buscador automático en listas largas.
 *  · Se dibuja en un portal (no lo recortan modales ni contenedores con scroll)
 *    y se abre hacia arriba si no cabe abajo.
 *  · `required` funciona con la validación del navegador.
 * Accesible con el patrón "combobox de solo selección" (WAI-ARIA).
 */

export type SelectOption = {
  value: string
  label: string
  /** Texto gris debajo de la opción. */
  hint?: string
  /** Punto de color a la izquierda (etapas, segmentos…). */
  color?: string
  disabled?: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Texto cuando el valor no coincide con ninguna opción (p. ej. "Selecciona"). */
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
  required?: boolean
  /** Por omisión aparece a partir de 9 opciones. */
  searchable?: boolean
  searchPlaceholder?: string
  title?: string
  style?: React.CSSProperties
  'aria-label'?: string
  'aria-labelledby'?: string
}

const SEARCH_FROM = 9
const MIN_WIDTH = 200
const MAX_HEIGHT = 320
const GAP = 6

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const Chevron = () => (
  <svg className="sel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
)
const Check = () => (
  <svg className="sel-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7" /></svg>
)
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)

export function Select({
  value, onChange, options, placeholder = 'Selecciona', id, className, disabled, required,
  searchable, searchPlaceholder = 'Buscar…', title, style, ...aria
}: Props) {
  const autoId = useId()
  const triggerId = id ?? `sel-${autoId}`
  const listId = `${triggerId}-list`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number; up: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const typeahead = useRef({ text: '', at: 0 })

  const withSearch = searchable ?? options.length >= SEARCH_FROM
  const selected = options.find(o => o.value === value)
  const visible = useMemo(() => {
    const q = norm(query.trim())
    return q ? options.filter(o => norm(o.label).includes(q) || (o.hint && norm(o.hint).includes(q))) : options
  }, [options, query])

  const firstEnabled = (list: SelectOption[], from = 0, step = 1) => {
    for (let i = from; i >= 0 && i < list.length; i += step) if (!list[i].disabled) return i
    return -1
  }

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const vw = window.innerWidth, vh = window.innerHeight
    const width = Math.min(Math.max(r.width, MIN_WIDTH), vw - 16)
    const left = Math.min(Math.max(8, r.left), vw - width - 8)
    const below = vh - r.bottom - GAP - 8
    const above = r.top - GAP - 8
    const up = below < Math.min(MAX_HEIGHT, 220) && above > below
    const maxHeight = Math.max(140, Math.min(MAX_HEIGHT, up ? above : below))
    setPos({ top: up ? r.top - GAP : r.bottom + GAP, left, width, maxHeight, up })
  }

  const openList = () => {
    if (disabled) return
    setQuery('')
    const idx = options.findIndex(o => o.value === value && !o.disabled)
    setActive(idx >= 0 ? idx : firstEnabled(options))
    place()
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    setQuery('')
    if (refocus) triggerRef.current?.focus()
  }
  const choose = (opt: SelectOption | undefined) => {
    if (!opt || opt.disabled) return
    if (opt.value !== value) onChange(opt.value)
    close()
  }

  // Reubicar al hacer scroll o cambiar el tamaño; cerrar al tocar fuera
  useLayoutEffect(() => { if (open) place() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const reflow = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) place() }
    const outside = (e: PointerEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) close(false)
    }
    window.addEventListener('scroll', reflow, true)
    window.addEventListener('resize', reflow)
    document.addEventListener('pointerdown', outside)
    if (withSearch) requestAnimationFrame(() => searchRef.current?.focus())
    return () => {
      window.removeEventListener('scroll', reflow, true)
      window.removeEventListener('resize', reflow)
      document.removeEventListener('pointerdown', outside)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // La opción activa siempre a la vista
  useEffect(() => {
    if (!open || active < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  // Al buscar, la primera coincidencia queda activa
  useEffect(() => { if (open && query) setActive(firstEnabled(visible)) }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const jumpByText = (key: string, list: SelectOption[]) => {
    const now = Date.now()
    const t = typeahead.current
    t.text = now - t.at < 700 ? t.text + key : key
    t.at = now
    const q = norm(t.text)
    const start = active + (t.text.length === 1 ? 1 : 0)
    const order = [...list.slice(start), ...list.slice(0, start)]
    const hit = order.find(o => !o.disabled && norm(o.label).startsWith(q))
    return hit ? list.indexOf(hit) : -1
  }

  const onKey = (e: React.KeyboardEvent) => {
    const list = visible
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Como el select nativo: escribir con la lista cerrada cambia la opción
        const i = jumpByText(e.key, options)
        if (i >= 0 && options[i].value !== value) onChange(options[i].value)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(i => { const n = firstEnabled(list, i + 1); return n >= 0 ? n : i }); break
      case 'ArrowUp': e.preventDefault(); setActive(i => { const n = firstEnabled(list, i - 1, -1); return n >= 0 ? n : i }); break
      case 'Home': e.preventDefault(); setActive(firstEnabled(list)); break
      case 'End': e.preventDefault(); setActive(firstEnabled(list, list.length - 1, -1)); break
      case 'PageDown': e.preventDefault(); setActive(i => { const n = firstEnabled(list, Math.min(list.length - 1, i + 6)); return n >= 0 ? n : i }); break
      case 'PageUp': e.preventDefault(); setActive(i => { const n = firstEnabled(list, Math.max(0, i - 6), -1); return n >= 0 ? n : i }); break
      case 'Enter': e.preventDefault(); choose(list[active]); break
      case ' ':
        if (!withSearch) { e.preventDefault(); choose(list[active]) }
        break
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break
      case 'Tab': close(false); break
      default:
        if (!withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const i = jumpByText(e.key, list)
          if (i >= 0) setActive(i)
        }
    }
  }

  const activeId = open && active >= 0 && visible[active] ? `${listId}-${active}` : undefined
  const isPlaceholder = !selected

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={withSearch ? undefined : activeId}
        aria-required={required || undefined}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        title={title}
        style={style}
        disabled={disabled}
        className={`sel-trigger${open ? ' is-open' : ''}${isPlaceholder ? ' is-placeholder' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
      >
        {selected?.color && <span className="sel-dot" style={{ background: selected.color }} aria-hidden="true" />}
        <span className="sel-value">{selected ? selected.label : placeholder}</span>
        <Chevron />
      </button>
      {/* Para la validación del navegador ("Completa este campo") en formularios con required */}
      {required && (
        <input
          className="sel-native" tabIndex={-1} aria-hidden="true" required value={selected ? value : ''}
          onChange={() => {}} onFocus={() => triggerRef.current?.focus()}
        />
      )}

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className={`sel-panel${pos.up ? ' is-up' : ''}`}
          style={{
            left: pos.left, width: pos.width, maxHeight: pos.maxHeight,
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
          }}
        >
          {withSearch && (
            <label className="sel-search">
              <SearchIcon />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-label={searchPlaceholder}
              />
            </label>
          )}
          <div ref={listRef} id={listId} role="listbox" className="sel-list" aria-labelledby={triggerId}>
            {visible.length === 0 && <div className="sel-empty">Sin coincidencias</div>}
            {visible.map((o, i) => {
              const isSel = o.value === value
              return (
                <div
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  className={`sel-option${isSel ? ' is-selected' : ''}${i === active ? ' is-active' : ''}${o.disabled ? ' is-disabled' : ''}`}
                  onPointerMove={() => { if (!o.disabled && active !== i) setActive(i) }}
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  {o.color && <span className="sel-dot" style={{ background: o.color }} aria-hidden="true" />}
                  <span className="sel-text">
                    <span className="sel-label">{o.label}</span>
                    {o.hint && <span className="sel-hint">{o.hint}</span>}
                  </span>
                  {isSel && <Check />}
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Atajo para listas de textos: cada texto es valor y etiqueta. */
export const toOptions = (values: string[], color?: (v: string) => string): SelectOption[] =>
  values.map(v => ({ value: v, label: v, ...(color ? { color: color(v) } : {}) }))
