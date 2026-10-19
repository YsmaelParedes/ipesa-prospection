'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatPlanPrice, type PlanPrice } from '@/lib/billing'
import { PLAN_COMPARE, PLAN_COPY } from '@/lib/planFeatures'
import { PLANS, PUBLIC_PLANS } from '@/lib/stores'
import { Ic } from './_ui'
import s from './inicio.module.css'

type Prices = Partial<Record<'galon' | 'cubeta', PlanPrice>>

/** Precio mensual de Galón y Cubeta, leído de Stripe (null = aún no carga o no hay). */
function usePrices(): Prices | null {
  const [prices, setPrices] = useState<Prices | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/billing/prices')
      .then(r => r.json())
      .then(d => { if (alive) setPrices(d.prices ?? {}) })
      .catch(() => { if (alive) setPrices({}) })
    return () => { alive = false }
  }, [])
  return prices
}

/** Las tres tarjetas de planes del sitio (mismo estilo que la tarjeta de plan de antes). */
export function PricingCards() {
  const prices = usePrices()
  return (
    <div className={s.pricingGrid}>
      {PUBLIC_PLANS.map(id => {
        const copy = PLAN_COPY[id]
        const price = id === 'litro' ? null : prices?.[id]
        return (
          <div key={id} className={`${s.planCard} ${s.priceCard} ${copy.highlight ? s.priceCardHi : ''}`}>
            {copy.highlight && <span className={s.priceFlag}>El más elegido</span>}
            <div className={s.planTop}>
              <span className={s.planName}>{PLANS[id].label}</span>
              <strong>
                {id === 'litro' ? 'Gratis' : price ? formatPlanPrice(price) : prices === null ? <span className={s.priceLoading}>…</span> : 'Muy pronto'}
              </strong>
              <small>{id === 'litro' ? 'para siempre, sin tarjeta' : price ? 'al mes, por tienda' : 'precio mensual por tienda'}</small>
              <p className={s.priceTagline}>{copy.tagline}</p>
            </div>
            <ul className={s.planList}>
              {copy.features.map(f => <li key={f}><span className={s.bulletIcon}><Ic.check /></span>{f}</li>)}
            </ul>
            <Link href="/registro" className={`${s.btn} ${copy.highlight ? s.btnPrimary : s.btnLight} ${s.priceBtn}`}>
              {id === 'litro' ? 'Crear cuenta gratis' : `Empezar con ${PLANS[id].label}`}
            </Link>
          </div>
        )
      })}
    </div>
  )
}

/** Tabla comparativa de los tres planes. */
export function PricingCompare() {
  return (
    <div className={s.compareWrap}>
      <table className={s.compare}>
        <caption className={s.srOnly}>Comparación de planes</caption>
        <thead>
          <tr>
            <th scope="col"><span className={s.srOnly}>Función</span></th>
            {PUBLIC_PLANS.map(id => <th key={id} scope="col">{PLANS[id].label}</th>)}
          </tr>
        </thead>
        <tbody>
          {PLAN_COMPARE.map(row => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {PUBLIC_PLANS.map(id => {
                const v = row.values[id]
                return (
                  <td key={id}>
                    {v === true ? <span className={s.compareYes}><Ic.check /><span className={s.srOnly}>Incluido</span></span>
                      : v === false ? <span className={s.compareNo} aria-label="No incluido">—</span>
                      : v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
