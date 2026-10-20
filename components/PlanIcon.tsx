/**
 * Ícono de cada plan: el envase de pintura que le da nombre (litro, galón,
 * cubeta), del más chico al más grande. Trazo en el color del texto y una
 * franja del espectro de Matices como "pintura".
 */
import type { PlanId } from '@/lib/stores'

const PAINT: Record<'litro' | 'galon' | 'cubeta', string> = {
  litro: '#00BBD9',
  galon: '#E51585',
  cubeta: '#FD0B2B',
}

export function PlanIcon({ plan, className }: { plan: PlanId; className?: string }) {
  const id = plan === 'interno' ? 'cubeta' : plan
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {id === 'litro' && (
        <>
          <rect x="15" y="16" width="18" height="24" rx="3" fill={PAINT.litro} opacity=".18" />
          <rect x="15" y="16" width="18" height="24" rx="3" {...common} />
          <path d="M15 22h18" {...common} />
          <rect x="18" y="28" width="12" height="6" rx="1.5" fill={PAINT.litro} />
          <path d="M19 16v-3h10v3" {...common} />
        </>
      )}
      {id === 'galon' && (
        <>
          <path d="M11 18h26v20a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V18Z" fill={PAINT.galon} opacity=".18" />
          <path d="M11 18h26v20a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V18Z" {...common} />
          <path d="M11 18l3-5h20l3 5" {...common} />
          <path d="M18 13c0-4 12-4 12 0" {...common} />
          <rect x="15" y="26" width="18" height="8" rx="1.5" fill={PAINT.galon} />
        </>
      )}
      {id === 'cubeta' && (
        <>
          <path d="M8 16h32l-3 23a3 3 0 0 1-3 2.6H14a3 3 0 0 1-3-2.6L8 16Z" fill={PAINT.cubeta} opacity=".18" />
          <path d="M8 16h32l-3 23a3 3 0 0 1-3 2.6H14a3 3 0 0 1-3-2.6L8 16Z" {...common} />
          <path d="M7 16h34" {...common} />
          <path d="M9 16C9 6 39 6 39 16" {...common} />
          <path d="M11.5 25h25l-1 8h-23l-1-8Z" fill={PAINT.cubeta} />
        </>
      )}
    </svg>
  )
}
