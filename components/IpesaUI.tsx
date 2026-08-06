'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/* ── Helpers visuales compartidos entre todas las páginas V2 ── */

const PALETTE = ['#EE5A24', '#1F3A5F', '#3D8B5C', '#F2B544', '#B6589C', '#C44D4D']

/* Paleta para chips dinámicos: fondo suave + texto oscuro legible */
const CHIP_PALETTES = [
  { bg: '#FBE6DA', color: '#8A2F0A' },
  { bg: '#DBEADF', color: '#1F5536' },
  { bg: '#DCE3EE', color: '#1F3A5F' },
  { bg: '#FBEED2', color: '#8A6308' },
  { bg: '#F2DAEB', color: '#7B2A5D' },
  { bg: '#DAEEDF', color: '#1B6634' },
  { bg: '#E0D8F0', color: '#4A2D8A' },
]

/** Color determinístico a partir del string del valor */
function hashChip(value: string) {
  let h = 5381
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h) ^ value.charCodeAt(i)
  return CHIP_PALETTES[Math.abs(h) % CHIP_PALETTES.length]
}

/** Normaliza un string para comparación flexible: minúsculas, sin acentos, sin espacios extra */
function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export function initials(name: string) {
  return (name || '?')
    .replace(/^(Arq\.|Ing\.|Mtro\.|Mtra\.|Dr[a]?\.|Lic\.|Sr[a]?\.)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?'
}

export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  const hue = color || PALETTE[(name || '').charCodeAt(0) % PALETTE.length]
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: hue, color: '#fff', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 }}
    >
      {initials(name)}
    </div>
  )
}

/* Chip de canal ── mapea a clase CSS, fallback a color determinístico */
export function CanalChip({ value, small }: { value: string; small?: boolean }) {
  const CANAL_MAP: Array<[string[], string]> = [
    [['redes sociales', 'redes', 'instagram', 'facebook', 'tiktok'], 'chip-redes'],
    [['referido', 'referral', 'recomendado'], 'chip-referido'],
    [['visita a tienda', 'visita directa', 'visita', 'tienda', 'mostrador'], 'chip-tienda'],
    [['whatsapp', 'whats app', 'wsp'], 'chip-whatsapp'],
    [['campaña pagada', 'campana pagada', 'publicidad', 'ads', 'anuncio'], 'chip-campana'],
    [['otro', 'otros', 'other'], 'chip-otro'],
  ]
  const n = norm(value)
  const found = CANAL_MAP.find(([keys]) => keys.some(k => n.includes(k)))
  const smallStyle = small ? { fontSize: 11, padding: '3px 8px' } : undefined
  if (found) {
    return (
      <span className={`chip ${found[1]}`} style={smallStyle}>
        <span className="chip-dot"></span>{value}
      </span>
    )
  }
  const { bg, color } = hashChip(value)
  return (
    <span className="chip" style={{ ...smallStyle, background: bg, color }}>
      <span className="chip-dot"></span>{value}
    </span>
  )
}

/* Chip de estado de lead */
export function EstadoChip({ value, small }: { value: string; small?: boolean }) {
  const ESTADO_MAP: Array<[string[], string]> = [
    [['nuevo'], 'chip-nuevo'],
    [['seguimiento', 'contactado', 'en proceso'], 'chip-seguimiento'],
    [['cotizado', 'propuesta', 'cotizacion'], 'chip-cotizado'],
    [['cerrado', 'ganado', 'vendido'], 'chip-cerrado'],
    [['perdido', 'cancelado', 'rechazado'], 'chip-perdido'],
  ]
  const n = norm(value)
  const found = ESTADO_MAP.find(([keys]) => keys.some(k => n.includes(k)))
  const smallStyle = small ? { fontSize: 11, padding: '3px 8px' } : undefined
  if (found) {
    return (
      <span className={`chip ${found[1]}`} style={smallStyle}>
        <span className="chip-dot"></span>{value}
      </span>
    )
  }
  const { bg, color } = hashChip(value)
  return (
    <span className="chip" style={{ ...smallStyle, background: bg, color }}>
      <span className="chip-dot"></span>{value}
    </span>
  )
}

/* Chip de segmento de lead */
export function SegmentoChip({ value, small }: { value: string; small?: boolean }) {
  const SEG_MAP: Array<[string[], string]> = [
    [['residencial', 'hogar', 'casa', 'particular'], 'chip-residencial'],
    [['comercial', 'empresa', 'negocio'], 'chip-comercial'],
    [['constructora', 'constructor', 'contratista', 'obra'], 'chip-constructora'],
    [['arquitecto', 'disenador', 'diseñador', 'arq'], 'chip-arq-dis'],
  ]
  const n = norm(value)
  const found = SEG_MAP.find(([keys]) => keys.some(k => n.includes(k)))
  const smallStyle = small ? { fontSize: 11, padding: '3px 8px' } : undefined
  if (found) {
    return (
      <span className={`chip ${found[1]}`} style={smallStyle}>
        <span className="chip-dot"></span>{value}
      </span>
    )
  }
  const { bg, color } = hashChip(value)
  return (
    <span className="chip" style={{ ...smallStyle, background: bg, color }}>
      <span className="chip-dot"></span>{value}
    </span>
  )
}

/* Chip de vendedor/dueño del lead — visible solo en vista de administrador */
export function OwnerChip({ value, small }: { value: string; small?: boolean }) {
  const smallStyle = small ? { fontSize: 11, padding: '3px 8px' } : undefined
  const { bg, color } = hashChip(value)
  return (
    <span className="chip" style={{ ...smallStyle, background: bg, color, fontWeight: 700 }}>
      👤 {value}
    </span>
  )
}

/* Chip de tipo de contacto */
export function TipoChip({ value, small }: { value: string; small?: boolean }) {
  const TIPO_MAP: Array<[string[], string]> = [
    [['constructor', 'contratista', 'construccion', 'obra'], 'chip-constructor'],
    [['arquitecto', 'arquitecta', 'disenador', 'diseñador', 'dis.', 'arq.', 'arq'], 'chip-arquitecto'],
    [['hogar', 'residencial', 'casa', 'particular', 'persona'], 'chip-hogar'],
    [['empresa', 'comercial', 'negocio', 'corporativo', 'corporacion'], 'chip-empresa'],
  ]
  const n = norm(value)
  const found = TIPO_MAP.find(([keys]) => keys.some(k => n.includes(k)))
  const smallStyle = small ? { fontSize: 11, padding: '3px 8px' } : undefined
  if (found) {
    return (
      <span className={`chip ${found[1]}`} style={smallStyle}>
        <span className="chip-dot"></span>{value}
      </span>
    )
  }
  const { bg, color } = hashChip(value)
  return (
    <span className="chip" style={{ ...smallStyle, background: bg, color }}>
      <span className="chip-dot"></span>{value}
    </span>
  )
}

/* Color determinístico para segmentos dinámicos en gráficas */
const SEG_COLORS = ['#EE5A24', '#1F3A5F', '#3D8B5C', '#F2B544', '#B6589C', '#C44D4D', '#80766B']
export function segColor(name: string, index: number) {
  return SEG_COLORS[index % SEG_COLORS.length]
}

/* ── Formato de fechas ── */
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
export function fmtDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}
export function fmtDateLong(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

/** Normaliza teléfono: elimina prefijo 52, deja exactamente 10 dígitos */
export function normalizePhone(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('52') && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('1')  && digits.length === 11) return digits.slice(1)
  if (digits.length > 10) return digits.slice(-10)
  return digits
}

/**
 * Detecta si un teléfono mexicano (10 dígitos normalizados) es celular — apto para SMS.
 * Usa rangos conservadores: solo marca como fijo los rangos claramente TELMEX/fijo.
 * Es preferible dejar pasar un fijo que bloquear un celular.
 */
export function isMobilePhone(phone: string): boolean {
  const d = normalizePhone(phone)
  if (d.length !== 10) return false
  // Toll-free / premium
  if (d.startsWith('800') || d.startsWith('900')) return false
  // Ladas de 2 dígitos — solo el rango clásico de fijo de cada ciudad:
  const lada2 = d.slice(0, 2)
  if (lada2 === '55') return d[2] !== '5'  // CDMX: 55 5xxx = fijo (TELMEX)
  if (lada2 === '33') return d[2] !== '3'  // Guadalajara: 33 3xxx = fijo
  if (lada2 === '81') return d[2] !== '8'  // Monterrey: 81 8xxx = fijo
  // Ladas de 3 dígitos (Puebla 222, Querétaro 442, Mérida 999, etc.)
  // Solo local que empieza con 2 es fijo (serie TELMEX típica).
  // 1, 3, 4, 5, 6, 7, 8, 9 = celular.
  return d[3] !== '2'
}

/** Formatea teléfono 10 dígitos → XXX XXX XXXX */
export function fmtPhone(phone: string): string {
  const d = normalizePhone(phone)
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return phone || ''
}

/**
 * Dropdown de filtro reutilizable — reemplaza <select> nativo y filas de pills.
 * Usa un portal a document.body para que el panel flotante nunca quede recortado
 * por overflow:hidden/auto de un contenedor padre (p.ej. .filter-bar en mobile).
 */
export function FilterDropdown({
  value, options, onChange, countFor, triggerLabel, optionLabel, searchable = true, searchPlaceholder = 'Buscar…',
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  countFor?: (v: string) => number
  triggerLabel: (v: string) => string
  optionLabel?: (v: string) => string
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  const [pos, setPos]   = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const PANEL_W = 240

  const computePos = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    let left = r.left
    if (left + PANEL_W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - PANEL_W - 8)
    setPos({ top: r.bottom + 6, left, width: PANEL_W })
  }

  useEffect(() => {
    if (!open) return
    computePos()
    const onReflow = () => computePos()
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => { window.removeEventListener('scroll', onReflow, true); window.removeEventListener('resize', onReflow) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false); setQ('')
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setQ('') } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  const all = ['Todos', ...options]
  const filtered = q ? all.filter(t => t.toLowerCase().includes(q.toLowerCase())) : all
  const label = (v: string) => optionLabel ? optionLabel(v) : v

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className="filter-pill active"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {triggerLabel(value)}
        {countFor && <span className="count">{countFor(value)}</span>}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ width: 12, height: 12, marginLeft: 2, transition: 'transform 0.15s ease', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 1000,
            maxHeight: Math.min(360, window.innerHeight - pos.top - 16),
            display: 'flex', flexDirection: 'column',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
            boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          }}
        >
          {searchable && (
            <div style={{ padding: 10, borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 9,
                  background: 'var(--paper)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', padding: 6 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '14px 10px', fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>Sin coincidencias</div>
            )}
            {filtered.map(t => {
              const active = t === value
              return (
                <button
                  key={t}
                  onClick={() => { onChange(t); setOpen(false); setQ('') }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    width: '100%', padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: active ? 'var(--ipesa-orange-soft)' : 'transparent',
                    color: active ? 'var(--ipesa-orange-deep)' : 'var(--ink)',
                    fontSize: 13, fontWeight: active ? 700 : 500, textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--paper)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(t)}</span>
                  {countFor && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: active ? 'var(--ipesa-orange-deep)' : 'var(--muted)', flexShrink: 0 }}>
                      {countFor(t)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/* Icono de tendencia */
export function TrendIcon({ up }: { up: boolean }) {
  if (up) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, color: 'var(--ipesa-green)' }}>
      <path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>
    </svg>
  )
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, color: 'var(--ipesa-rose)' }}>
      <path d="m3 7 6 6 4-4 8 8"/><path d="M21 17h-7v-7"/>
    </svg>
  )
}

/* SVG Donut */
export function Donut({ data, size = 140 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = 56, c = 2 * Math.PI * r
  let acc = 0
  return (
    <svg viewBox="0 0 140 140" className="donut" style={{ width: size, height: size }}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#F4EFE4" strokeWidth="18" />
      {data.map((d, i) => {
        const frac = d.value / total
        const len = c * frac
        const offset = c * acc
        acc += frac
        return (
          <circle key={i} cx="70" cy="70" r={r} fill="none"
            stroke={d.color} strokeWidth="18"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
            strokeLinecap="butt"
          />
        )
      })}
      <text x="70" y="68" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="26" fill="#1A1410">{total}</text>
      <text x="70" y="86" textAnchor="middle" fontSize="10" fill="#80766B" letterSpacing="0.08em">TOTAL</text>
    </svg>
  )
}
