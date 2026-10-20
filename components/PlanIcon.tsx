import { useId } from 'react'
import { BRAND_MARK } from '@/lib/brand'
import type { PlanId } from '@/lib/stores'

const PAINT = {
  litro: { main: '#00BBD9', dark: '#007E99', light: '#70E6EE' },
  galon: { main: '#E51585', dark: '#A30960', light: '#FF80BF' },
  cubeta: { main: '#FD0B2B', dark: '#B80020', light: '#FF7586' },
}

/** Envases de Matices: metal satinado, etiqueta de color y tamaños reales relativos. */
export function PlanIcon({ plan, className }: { plan: PlanId; className?: string }) {
  const uid = useId()
  const id = plan === 'interno' ? 'cubeta' : plan
  const paint = PAINT[id]
  const metal = `${uid}-metal`
  const label = `${uid}-label`
  const lid = `${uid}-lid`
  const brand = `${uid}-brand`
  const small = id === 'litro'
  const bucket = id === 'cubeta'
  const left = small ? 17 : bucket ? 8 : 11
  const right = 64 - left
  const top = small ? 24 : bucket ? 17 : 21
  const bottom = 55
  const inset = bucket ? 4 : 0
  const labelTop = top + 9
  const labelBottom = bottom - 7
  const edge = { stroke: '#46515B', strokeWidth: 1, strokeLinejoin: 'round' as const }

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false" fill="none">
      <defs>
        <mask id={brand} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64" style={{ maskType: 'alpha' }}>
          <image href={BRAND_MARK} width="64" height="64" />
        </mask>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#B8C2CA" />
          <stop offset=".2" stopColor="#F9FBFC" />
          <stop offset=".5" stopColor="#EDF1F4" />
          <stop offset=".82" stopColor="#C4CDD5" />
          <stop offset="1" stopColor="#929FA9" />
        </linearGradient>
        <linearGradient id={label} x1="0" y1="0" x2="1" y2=".2">
          <stop stopColor={paint.dark} />
          <stop offset=".24" stopColor={paint.main} />
          <stop offset=".58" stopColor={paint.main} />
          <stop offset="1" stopColor={paint.dark} />
        </linearGradient>
        <linearGradient id={lid} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#FAFCFD" />
          <stop offset="1" stopColor="#A8B5C0" />
        </linearGradient>
      </defs>

      <ellipse cx="32" cy="58" rx={small ? 16 : 24} ry="2.5" fill="#152536" opacity=".09" />

      {/* El asa queda detrás del envase; el litro lleva una tapa a presión. */}
      {!small && (
        <>
          <path d={`M${left + 2} ${top + 12}V${top - 1}C${left + 2} ${top - 18} ${right - 2} ${top - 18} ${right - 2} ${top - 1}V${top + 12}`} stroke="#657581" strokeWidth="2" />
          <path d={`M25 ${top - 11}Q32 ${top - 14} 39 ${top - 11}`} stroke="#293843" strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}

      <path d={`M${left} ${top}H${right}L${right - inset} ${bottom - 3}Q32 ${bottom + 4} ${left + inset} ${bottom - 3}Z`} fill={`url(#${metal})`} {...edge} />
      <path d={`M${left + 1.2} ${labelTop}Q32 ${labelTop + 5} ${right - 1.2} ${labelTop}L${right - inset - .7} ${labelBottom}Q32 ${labelBottom + 6} ${left + inset + .7} ${labelBottom}Z`} fill={`url(#${label})`} />

      {/* La silueta original de la marca se imprime en blanco sobre la etiqueta. */}
      <path d={`M${left + 2} ${labelBottom - 2}L${right - 2} ${labelTop + 2}L${right - 2.6} ${labelTop + 6}L${left + inset + 1} ${labelBottom + .5}Z`} fill={paint.light} opacity=".45" />
      <g transform={`translate(${small ? 23 : 21} ${labelTop + (small ? 1 : 2)}) scale(${small ? 18 / 64 : 22 / 64})`}>
        <rect width="64" height="64" fill="#FFF" mask={`url(#${brand})`} />
      </g>
      <path d={`M${left + 4} ${top + 6}L${left + inset + 3} ${bottom - 5}`} stroke="#FFF" strokeWidth="1.5" opacity=".55" strokeLinecap="round" />
      <path d={`M${left + inset + 1} ${bottom - 3}Q32 ${bottom + 2} ${right - inset - 1} ${bottom - 3}`} stroke="#7C8C99" strokeWidth="1.3" />
      <path d={`M${left + inset + 3} ${bottom - 4}Q32 ${bottom} ${right - inset - 3} ${bottom - 4}`} stroke="#FFF" strokeWidth=".8" />

      {/* Borde metálico y doble elipse para dar profundidad a la tapa. */}
      <path d={`M${left - 1} ${top - 1}V${top + 2}C${left - 1} ${top + 8} ${right + 1} ${top + 8} ${right + 1} ${top + 2}V${top - 1}`} fill={`url(#${metal})`} {...edge} />
      <ellipse cx="32" cy={top - 1} rx={(right - left) / 2 + 1} ry={small ? 4 : 5.5} fill={`url(#${lid})`} {...edge} />
      <ellipse cx="32" cy={top - 1} rx={(right - left) / 2 - 3} ry={small ? 2.4 : 3.5} stroke="#7D8D99" strokeWidth=".8" />
      <path d={`M${left + 5} ${top - 1}Q32 ${top - (small ? 5 : 7)} ${right - 5} ${top - 1}`} stroke="#FFF" strokeWidth="1" strokeLinecap="round" />

      {!small && [left + 2, right - 2].map(x => (
        <g key={x}>
          <rect x={x - 1.6} y={top + 8} width="3.2" height="5" rx="1.6" fill="#71818D" />
          <circle cx={x} cy={top + 10} r=".8" fill="#EFF5F8" />
        </g>
      ))}
    </svg>
  )
}
