import { stockLabel, type Product } from '@/lib/products'
import s from './productos.module.css'

/** Existencias como etiqueta: en rojo sin existencias, en verde con, en gris un servicio. */
export function StockTag({ p }: { p: Pick<Product, 'kind' | 'stock' | 'unit'> }) {
  if (p.kind === 'service') return <span className={`${s.stock} ${s.stockService}`}>Servicio</span>
  const label = stockLabel(p)
  if (!label) return <span className={s.muted}>—</span>
  return <span className={`${s.stock} ${(p.stock ?? 0) > 0 ? s.stockSome : s.stockNone}`}>{label}</span>
}

/** «SKU 1209054 · 7501411115640» */
export const codesOf = (p: Pick<Product, 'sku' | 'barcode' | 'kind'>) =>
  [p.sku ? `SKU ${p.sku}` : null, p.barcode].filter(Boolean).join(' · ') || (p.kind === 'service' ? 'Servicio' : 'Sin SKU')

export const fmtCount = (n: number) => n.toLocaleString('es-MX')
