'use client'

import { useMemo, useState } from 'react'
import { initials, norm } from './shared'
import s from './demos.module.css'

/**
 * Demo de Contactos: busca sin acentos (o por teléfono), filtra por tipo de
 * línea y abre la ficha. Los contactos sin teléfono quedan "para visita".
 */

type Line = 'whatsapp' | 'fijo' | 'sin_verificar' | 'sin_telefono'
type Contact = { id: string; name: string; zone: string; segment: string; phone: string; line: Line; note: string }
const CONTACTS: Contact[] = [
  { id: 'jp', name: 'José Pérez', zone: 'Puebla', segment: 'Pintor', phone: '222 410 5762', line: 'whatsapp', note: 'Compra vinílica cada mes para sus obras.' },
  { id: 'fa', name: 'Ferretería Arce', zone: 'Atlixco', segment: 'Ferretería', phone: '244 101 2233', line: 'fijo', note: 'Cotización abierta de $17,005.' },
  { id: 'mj', name: 'María José López', zone: 'Puebla', segment: 'Hogar', phone: '222 555 0199', line: 'whatsapp', note: 'Pintó su sala en color arena.' },
  { id: 'fm', name: 'Ferre Materiales del Valle', zone: 'San Andrés', segment: 'Ferretería', phone: '', line: 'sin_telefono', note: 'Sin teléfono: se visita en ruta.' },
  { id: 'hs', name: 'Hotel Sol', zone: 'Puebla', segment: 'Hotel', phone: '222 300 1122', line: 'sin_verificar', note: 'Prospecto para mantenimiento anual.' },
  { id: 'ca', name: 'Constructora Ávila', zone: 'Atlixco', segment: 'Constructora', phone: '244 220 8890', line: 'whatsapp', note: 'Obra de 40 departamentos en 2027.' },
]
const FILTERS: [Line | 'all', string][] = [['all', 'Todos'], ['whatsapp', 'Con WhatsApp'], ['fijo', 'Fijo'], ['sin_telefono', 'Sin teléfono']]

export function ContactsDemo() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Line | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)

  const list = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean)
    const digits = q.replace(/\D/g, '')
    return CONTACTS.filter(c => {
      if (filter !== 'all' && c.line !== filter) return false
      if (digits.length >= 3 && !/[a-z]/i.test(q)) return c.phone.replace(/\D/g, '').includes(digits)
      const hay = norm(`${c.name} ${c.zone} ${c.segment}`)
      return words.every(w => hay.includes(w))
    })
  }, [q, filter])
  const detail = CONTACTS.find(c => c.id === open) ?? null

  return (
    <div data-demo="contacts">
      <label className={s.search}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(null) }} placeholder="Busca «jose», «ferre» o un teléfono" aria-label="Buscar contacto de ejemplo" data-demo-search />
      </label>
      <div className={s.chips} style={{ marginBottom: 12 }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className={`${s.chip} ${s.press}`} aria-pressed={filter === k} onClick={() => { setFilter(k); setOpen(null) }} data-demo-filter={k}>{label}</button>
        ))}
      </div>
      <div className={s.card}>
        {list.length ? list.map(c => (
          <button key={c.id} type="button" className={`${s.row} ${s.press}`} aria-pressed={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)} data-demo-contact={c.id}>
            <span className={s.av}>{initials(c.name)}</span>
            <span className={s.rowMain}>{c.name}<small>{c.zone} · {c.segment}</small></span>
            {c.phone && <span className={s.mono}>{c.phone}</span>}
            {c.line === 'whatsapp' && <span className={`${s.tag} ${s.tOk}`}>WhatsApp</span>}
            {c.line === 'fijo' && <span className={`${s.tag} ${s.tGray}`}>Fijo</span>}
            {c.line === 'sin_telefono' && <span className={`${s.tag} ${s.tInfo}`}>Para visita</span>}
          </button>
        )) : <div className={s.row} style={{ color: 'var(--muted)' }}>Nada coincide. Prueba con «jose».</div>}
      </div>
      {detail && (
        <div className={s.detail} aria-live="polite">
          <strong>{detail.name}</strong>
          {detail.zone} · {detail.segment}{detail.phone ? ` · ${detail.phone}` : ' · sin teléfono'}<br />
          {detail.note}
          <div className={s.detailActions}>
            {detail.line === 'whatsapp' && <span className={`${s.tag} ${s.tOk}`}>Le puedes escribir por WhatsApp</span>}
            {detail.line === 'fijo' && <span className={`${s.tag} ${s.tGray}`}>Es fijo: llámale</span>}
            {detail.line === 'sin_verificar' && <span className={`${s.tag} ${s.tGray}`}>¿Tiene WhatsApp? Lo marcas al llamar</span>}
            {detail.line === 'sin_telefono' && <span className={`${s.tag} ${s.tInfo}`}>Aparece en «Para visita»</span>}
          </div>
        </div>
      )}
    </div>
  )
}
