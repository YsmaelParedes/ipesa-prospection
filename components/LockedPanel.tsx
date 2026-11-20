'use client'

import { BarChart3, Download, Lock, Target, Users } from 'lucide-react'
import { useLockSeen, useUpgradeDialog } from '@/components/UpgradeDialog'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { fmtMoney, type PlanPrice } from '@/lib/billing'
import { PAID_PLAN } from '@/lib/stores'
import s from './Upgrade.module.css'

type Prices = { prices: Partial<Record<string, PlanPrice>>; annual?: Partial<Record<string, PlanPrice>> }

const PANELS = {
  actividad: {
    title: 'Cada vendedor contra su meta del día',
    benefits: [
      { icon: Target, tone: ['var(--c-cyan-soft)', 'var(--c-cyan-ink)'], title: 'Metas del equipo y por vendedor', text: 'Llamadas, cotizaciones y ventas de hoy contra lo que cada quien se propuso.' },
      { icon: Users, tone: ['var(--c-magenta-soft)', 'var(--c-magenta-ink)'], title: 'Reparte tus clientes', text: 'Cada vendedor trabaja solo los contactos que le asignas.' },
      { icon: BarChart3, tone: ['var(--c-lime-soft)', 'var(--c-lime-ink)'], title: 'Resultados del mes', text: 'Cómo va cada quien en días hábiles, de lunes a sábado.' },
    ],
    head: ['Vendedor', 'Llamadas', 'Meta', 'Vendido'],
    rows: [
      ['Luis Herrera', '18', '20', '$6,450'],
      ['Mariana Cruz', '21', '20', '$4,980'],
      ['Pedro Sánchez', '9', '20', '$1,240'],
    ],
    deltas: [null, null, null] as (string | null)[],
    caption: 'Hoy',
  },
  acumulado: {
    title: 'Mide a cada vendedor: día, semana y mes',
    benefits: [
      { icon: BarChart3, tone: ['var(--c-cyan-soft)', 'var(--c-cyan-ink)'], title: 'Resultados contra el periodo anterior', text: 'Llamadas, cotizaciones y ventas de cada quien, comparadas con la semana o el mes pasado.' },
      { icon: Users, tone: ['var(--c-magenta-soft)', 'var(--c-magenta-ink)'], title: 'A qué clientes cotizó y vendió', text: 'Abres a un vendedor y ves sus clientes uno por uno.' },
      { icon: Download, tone: ['var(--c-lime-soft)', 'var(--c-lime-ink)'], title: 'Reportes en Excel', text: 'Descargas el mes de tu equipo para revisarlo o compartirlo.' },
    ],
    head: ['Vendedor', 'Llamadas', 'Cotizado', 'Vendido'],
    rows: [
      ['Luis Herrera', '64', '$48,200', '$21,950'],
      ['Mariana Cruz', '52', '$36,750', '$17,300'],
      ['Pedro Sánchez', '41', '$22,400', '$9,860'],
    ],
    deltas: ['+18 %', '+6 %', '−4 %'] as (string | null)[],
    caption: 'Esta semana',
  },
} as const

/**
 * Pestaña con candado del Sistema Comercial en Litro (Actividad diaria,
 * Acumulado): qué hace, una vista de ejemplo con datos inventados y el botón
 * que abre el aviso «Cambiar a Cubeta».
 */
export function LockedPanel({ feature }: { feature: 'actividad' | 'acumulado' }) {
  const p = PANELS[feature]
  const upgrade = useUpgradeDialog()
  const { data } = useCachedQuery<Prices>('/api/billing/prices')
  const monthly = data?.prices?.[PAID_PLAN]
  const annual = data?.annual?.[PAID_PLAN]
  useLockSeen(feature)

  return (
    <>
      <section className={s.locked}>
        <div>
          <span className={s.tag}><Lock size={13} strokeWidth={2.4} aria-hidden="true" />Incluido en el plan Cubeta</span>
          <h2 className={s.lockedTitle}>{p.title}</h2>
          <ul className={s.benefits}>
            {p.benefits.map(b => (
              <li key={b.title}>
                <span className={s.benefitIcon} style={{ background: b.tone[0], color: b.tone[1] }} aria-hidden="true"><b.icon size={16} /></span>
                <span><strong>{b.title}</strong><span>{b.text}</span></span>
              </li>
            ))}
          </ul>
          <div className={s.cta}>
            <button type="button" className="btn btn-primary" onClick={() => upgrade.open(feature)}>Cambiar a Cubeta</button>
            {monthly && (
              <span className={s.ctaNote}>
                {fmtMoney(monthly.amount, monthly.currency)} al mes{annual ? `, o ${fmtMoney(annual.amount, annual.currency)} al año con 2 meses gratis` : ''}
              </span>
            )}
          </div>
        </div>

        <div className={s.preview} aria-hidden="true">
          <div className={s.previewHead}>{p.caption}<small>Vista de ejemplo</small></div>
          <table className={s.previewTable}>
            <thead><tr>{p.head.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {p.rows.map((r, i) => (
                <tr key={r[0]}>
                  {r.map((c, j) => (
                    <td key={j}>
                      {c}
                      {j === r.length - 1 && p.deltas[i] && <> <small className={p.deltas[i]!.startsWith('−') ? s.down : s.up}>{p.deltas[i]}</small></>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.previewNote}>Datos inventados para mostrar cómo se ve. En tu tienda salen de las llamadas y cotizaciones de tu equipo.</p>
        </div>
      </section>
      <p className={s.lockedFoot}>Oportunidades viene en Litro. {feature === 'actividad' ? 'Actividad diaria' : 'Acumulado'} compara a los vendedores de un equipo; por eso es de Cubeta.</p>
      {upgrade.dialog}
    </>
  )
}
