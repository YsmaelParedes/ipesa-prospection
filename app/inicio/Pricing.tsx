'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtMoney, monthlyEquivalent, monthsSaved, formatPlanPrice, type PlanInterval, type PriceTable } from '@/lib/billing'
import { PLAN_COMPARE, PLAN_COPY } from '@/lib/planFeatures'
import { PAID_PLAN, PLANS, PUBLIC_PLANS, TRIAL_DAYS } from '@/lib/stores'
import { EVENTS, trackAttrs } from '@/lib/analytics'
import { Ic } from './_ui'
import { NAV } from './links'
import { PlanIcon } from '@/components/PlanIcon'
import s from './inicio.module.css'

/** Funciones del menú «Producto» por nombre: el ícono y el color de cada una. */
const MENU_ITEMS = new Map(NAV.flatMap(e => ('groups' in e ? e.groups.flatMap(g => g.items) : [])).map(i => [i.label, i]))

/**
 * Precios de Cubeta, mensual y anual (null = aún no carga). La página
 * los trae de Stripe al generarse (`initial`, así Google los ve en el HTML);
 * si no pudo, se piden aquí al abrirla.
 */
function usePrices(initial: PriceTable | null): PriceTable | null {
  const [table, setTable] = useState<PriceTable | null>(initial)
  useEffect(() => {
    if (initial) return
    let alive = true
    fetch('/api/billing/prices')
      .then(r => r.json())
      .then(d => { if (alive) setTable({ monthly: d.prices ?? {}, annual: d.annual ?? {} }) })
      .catch(() => { if (alive) setTable({ monthly: {}, annual: {} }) })
    return () => { alive = false }
  }, [initial])
  return table
}

/**
 * Las dos tarjetas de planes del sitio: Litro gratis y Cubeta. Con precios
 * anuales en Stripe aparece el selector Mensual / Anual. El botón de Cubeta
 * lleva el plan al registro: la tienda empieza su prueba y al final lo
 * encuentra listo para activar.
 */
export function PricingCards({ initial = null }: { initial?: PriceTable | null }) {
  const table = usePrices(initial)
  const [period, setPeriod] = useState<PlanInterval>('month')
  const hasAnnual = !!table && PUBLIC_PLANS.some(id => id !== 'litro' && table.annual[id])
  const saved = table ? monthsSaved(table.monthly[PAID_PLAN], table.annual[PAID_PLAN]) : 0
  const yearly = period === 'year' && hasAnnual

  return (
    <>
      {hasAnnual && (
        <div className={s.billingToggle} role="group" aria-label="Forma de pago">
          <button type="button" aria-pressed={!yearly} onClick={() => setPeriod('month')}>Mensual</button>
          <button type="button" aria-pressed={yearly} onClick={() => setPeriod('year')}>
            Anual{saved > 0 && <span className={s.billingSave}>{saved} meses gratis</span>}
          </button>
        </div>
      )}
      <div className={s.pricingGrid}>
        {PUBLIC_PLANS.map(id => {
          const copy = PLAN_COPY[id]
          const monthly = id === 'litro' ? undefined : table?.monthly[id]
          const annual = id === 'litro' ? undefined : table?.annual[id]
          const shown = yearly && annual ? monthlyEquivalent(annual) : monthly
          const paid = id !== 'litro'
          const href = paid ? `/registro?plan=${id}${yearly ? '&periodo=anual' : ''}` : '/registro'
          return (
            <div key={id} className={`${s.planCard} ${s.priceCard} ${copy.highlight ? s.priceCardHi : ''}`}>
              {copy.highlight && <span className={s.priceFlag}>Recomendado</span>}
              <div className={s.planTop}>
                <PlanIcon plan={id} className={s.priceIcon} />
                <h3 className={s.priceName}>{PLANS[id].label}</h3>
                <p className={s.priceTagline}>{copy.tagline}</p>
                <div className={s.priceAmount}>
                  <strong>
                    {!paid ? 'Gratis' : shown ? formatPlanPrice(shown) : table === null ? <span className={s.priceLoading}>…</span> : 'Muy pronto'}
                  </strong>
                  <small>{!paid ? 'para siempre' : shown ? '/ mes' : ''}</small>
                </div>
                <small className={s.priceSub}>
                  {!paid ? 'Sin tarjeta.'
                    : yearly && annual ? `Pagas ${fmtMoney(annual.amount, annual.currency)} al año. Impuestos incluidos, con factura.`
                    : 'Por tienda, impuestos incluidos. Con factura.'}
                </small>
                {copy.pitch && <p className={s.pricePitch}>{copy.pitch}</p>}
              </div>
              <div className={s.planBody}>
                {copy.lead && <p className={s.planLead}>{copy.lead}</p>}
                <ul className={s.planMain}>
                  {copy.features.map(f => {
                    const item = MENU_ITEMS.get(f.name)
                    return (
                      <li key={f.name}>
                        <span className={`${s.megaIcon} ${item?.tone ?? s.tBrand}`} aria-hidden="true">{item ? <item.icon /> : <Ic.check />}</span>
                        <span><strong>{f.name}</strong><small>{f.text}</small></span>
                      </li>
                    )
                  })}
                </ul>
                {copy.extras.length > 0 && (
                  <ul className={s.planExtras}>
                    {copy.extras.map(t => (
                      <li key={t}><span className={s.bulletIcon}><Ic.check /></span>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
              <Link href={href} className={`${s.btn} ${copy.highlight ? s.btnPrimary : s.btnLight} ${s.priceBtn}`} {...trackAttrs(EVENTS.signupClick, { donde: `plan-${id}` })}>
                {paid ? `Probar ${TRIAL_DAYS} días gratis` : 'Crear cuenta gratis'}
              </Link>
              <small className={s.priceTrial}>{paid ? `Sin tarjeta. Después eliges si activas ${PLANS[id].label}.` : `Incluye ${TRIAL_DAYS} días de Cubeta para probar.`}</small>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** Tabla comparativa de los dos planes. */
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
