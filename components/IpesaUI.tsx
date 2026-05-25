'use client'

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

/** Formatea teléfono 10 dígitos → XXX XXX XXXX */
export function fmtPhone(phone: string): string {
  const d = normalizePhone(phone)
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return phone || ''
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
