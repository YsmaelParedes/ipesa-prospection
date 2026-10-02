'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Avatar, EstadoChip } from '@/components/CrmUI'
import { openQuickCreate } from '@/lib/crmEvents'
import { loadSearchIndex, searchContacts, searchLeads, type SearchIndex } from '@/lib/searchIndex'
import { fmtPhone } from '@/lib/phone'

const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
const BackIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>

type Item =
  | { type: 'contact'; id: string; href: string; title: string; sub: string }
  | { type: 'lead'; id: string; href: string; title: string; sub: string; estado: string }
  | { type: 'create'; id: 'create'; title: string }
  | { type: 'all'; id: 'all'; href: string; title: string }

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)

/**
 * Buscador de toda la app: encuentra clientes y leads por nombre, teléfono o
 * empresa desde cualquier pantalla. Atajos: "/" o Ctrl+K.
 */
export default function GlobalSearch() {
  const router   = useRouter()
  const pathname = usePathname()
  const [q, setQ]           = useState('')
  const [open, setOpen]     = useState(false)        // panel de resultados (computadora)
  const [sheet, setSheet]   = useState(false)        // pantalla completa (celular)
  const [index, setIndex]   = useState<SearchIndex | null>(null)
  const [active, setActive] = useState(0)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sheetInputRef = useRef<HTMLInputElement>(null)

  const ensureIndex = useCallback(() => { loadSearchIndex().then(setIndex) }, [])

  // Cerrar al navegar
  useEffect(() => { setOpen(false); setSheet(false); setQ('') }, [pathname])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((k === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !isTyping(document.activeElement))) {
        e.preventDefault()
        if (window.matchMedia('(max-width: 960px)').matches) { setSheet(true); ensureIndex() }
        else { inputRef.current?.focus(); setOpen(true); ensureIndex() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ensureIndex])

  // Cerrar el panel con clic fuera
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => { if (sheet) setTimeout(() => sheetInputRef.current?.focus(), 60) }, [sheet])

  // Si cambian los datos mientras está abierto, refrescar el índice
  useEffect(() => {
    const h = () => { if (open || sheet) ensureIndex() }
    window.addEventListener('crm:data-changed', h)
    return () => window.removeEventListener('crm:data-changed', h)
  }, [open, sheet, ensureIndex])

  const items: Item[] = useMemo(() => {
    const text = q.trim()
    if (!text || !index) return []
    const contacts = searchContacts(index.contacts, text, 6).map<Item>(c => ({
      type: 'contact', id: c.id, href: `/contactos?id=${c.id}`, title: c.name,
      sub: [fmtPhone(c.phone), c.company !== c.name ? c.company : null, c.segment].filter(Boolean).join(' · '),
    }))
    const leads = searchLeads(index.leads, text, 5).map<Item>(l => ({
      type: 'lead', id: l.id, href: `/leads?id=${l.id}`, title: l.name, estado: l.estado,
      sub: l.monto ? `$${Number(l.monto).toLocaleString('es-MX')}` : (l.canal || ''),
    }))
    const out: Item[] = [...contacts, ...leads]
    if (!contacts.length) out.push({ type: 'create', id: 'create', title: `Crear contacto “${text}”` })
    else out.push({ type: 'all', id: 'all', href: `/contactos?q=${encodeURIComponent(text)}`, title: `Ver todos los contactos con “${text}”` })
    return out
  }, [q, index])

  useEffect(() => { setActive(0) }, [q])

  const choose = (it: Item) => {
    if (it.type === 'create') {
      const text = q.trim()
      const digits = text.replace(/\D/g, '')
      openQuickCreate(digits.length >= 7 ? { kind: 'contact', phone: digits } : { kind: 'contact', name: text })
    } else {
      router.push(it.href)
    }
    setOpen(false); setSheet(false); setQ('')
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]) }
    else if (e.key === 'Escape') { setQ(''); setOpen(false); setSheet(false); e.currentTarget.blur() }
  }

  const results = (
    <div className="gsearch-results" role="listbox" aria-label="Resultados">
      {!q.trim() ? (
        <div className="gsearch-hint">Busca clientes y leads por nombre, teléfono o empresa.<span className="gsearch-kbd">Atajo: <kbd>/</kbd></span></div>
      ) : !index ? (
        <div className="gsearch-hint"><span className="wa-spinner sm" /> Buscando…</div>
      ) : (
        <>
          {items.length > 0 && items[0].type === 'create' && <div className="gsearch-hint">No hay contactos ni leads con “{q.trim()}”.</div>}
          {items.map((it, i) => {
            const section = (it.type === 'contact' && (i === 0 || items[i - 1].type !== 'contact')) ? 'Contactos'
              : (it.type === 'lead' && (i === 0 || items[i - 1].type !== 'lead')) ? 'Leads' : null
            return (
              <div key={`${it.type}-${it.id}`}>
                {section && <div className="gsearch-section">{section}</div>}
                <button
                  role="option" aria-selected={i === active}
                  className={`gsearch-item ${i === active ? 'active' : ''} ${it.type === 'create' || it.type === 'all' ? 'action' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(it)}
                >
                  {it.type === 'contact' || it.type === 'lead' ? <Avatar name={it.title} size={30} /> : <span className="gsearch-plus">{it.type === 'create' ? '+' : '→'}</span>}
                  <span className="gsearch-main">
                    <strong>{it.title}</strong>
                    {(it.type === 'contact' || it.type === 'lead') && it.sub && <small>{it.sub}</small>}
                  </span>
                  {it.type === 'lead' && <EstadoChip value={it.estado} small />}
                </button>
              </div>
            )
          })}
        </>
      )}
    </div>
  )

  return (
    <>
      {/* Computadora: campo en la barra superior */}
      <div className="gsearch" ref={wrapRef}>
        <div className="gsearch-input">
          <SearchIcon />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); ensureIndex() }}
            onFocus={() => { setOpen(true); ensureIndex() }}
            onKeyDown={onKeyDown}
            placeholder="Buscar cliente o lead…"
            aria-label="Buscar cliente o lead"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
          />
          {q ? (
            <button className="gsearch-clear" onClick={() => { setQ(''); inputRef.current?.focus() }} aria-label="Limpiar búsqueda">×</button>
          ) : <kbd className="gsearch-shortcut">/</kbd>}
        </div>
        {open && <div className="gsearch-panel">{results}</div>}
      </div>

      {/* Celular: lupa que abre el buscador a pantalla completa */}
      <button className="btn-icon gsearch-mobile-btn" onClick={() => { setSheet(true); ensureIndex() }} aria-label="Buscar cliente o lead">
        <SearchIcon />
      </button>
      {/* En un portal: la barra superior usa backdrop-filter y encerraría al "fixed" */}
      {sheet && createPortal(
        <div className="gsearch-sheet" role="dialog" aria-modal="true" aria-label="Buscar">
          <div className="gsearch-sheet-head">
            <button className="btn-icon" onClick={() => { setSheet(false); setQ('') }} aria-label="Cerrar búsqueda"><BackIcon /></button>
            <div className="gsearch-input">
              <SearchIcon />
              <input ref={sheetInputRef} value={q} onChange={e => { setQ(e.target.value); ensureIndex() }} onKeyDown={onKeyDown}
                placeholder="Nombre, teléfono o empresa…" aria-label="Buscar cliente o lead" />
              {q && <button className="gsearch-clear" onClick={() => setQ('')} aria-label="Limpiar búsqueda">×</button>}
            </div>
          </div>
          {results}
        </div>,
        document.body,
      )}
    </>
  )
}
