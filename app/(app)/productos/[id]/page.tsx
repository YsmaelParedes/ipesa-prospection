'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { useSession } from '@/lib/profile'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { fmtMoney } from '@/lib/quotes'
import { mainListOf, marginOf, type PriceList, type Product } from '@/lib/products'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadFailed } from '@/components/LoadFailed'
import { ProductSkeleton } from '../Skeletons'
import { codesOf } from '../ui'
import s from '../productos.module.css'

const taxText = (rate: number) => (rate ? `IVA ${rate} % incluido` : 'Exento de IVA')
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Ficha de un producto: sus datos, el precio principal, el costo (solo
 * administradores) y las existencias, y la tarjeta con cada lista de precios
 * (margen y ganancia para administradores). Editar abre el mismo formulario
 * que «Agregar producto».
 */
export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useSession()
  const isAdmin = !!session?.isAdmin
  const canEdit = isAdmin && session?.store?.access !== 'readonly'
  const { data, error, loading, reload } = useCachedQuery<{ product: Product; lists: PriceList[] }>(`/api/data/products/${id}`)
  useDataChanged(['product'], reload)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  if (loading) return <ProductSkeleton />
  if (error && !data) {
    return <>
      <Head />
      <LoadFailed message={error.message || 'No se pudo abrir el producto'} onRetry={reload} />
    </>
  }
  if (!data) return <ProductSkeleton />

  const { product: p, lists } = data
  const main = mainListOf(lists)
  const mainPrice = main ? p.prices[main.id] ?? null : null
  const withMargin = isAdmin && p.cost !== null

  async function remove() {
    setBusy(true); setActionError('')
    try {
      const r = await apiFetch(`/api/data/products/${p.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setActionError(d.error || 'No se pudo borrar el producto'); return }
      notifyDataChanged('product')
      router.push('/productos')
    } catch {
      setActionError('Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Head>
        {canEdit && <>
          <button className={`btn btn-ghost ${s.danger} ${s.press}`} onClick={() => { setActionError(''); setConfirm(true) }}><Trash2 aria-hidden="true" /> Eliminar</button>
          <button className={`btn btn-primary ${s.press}`} onClick={() => openQuickCreate({ kind: 'product', product: p })}><Pencil aria-hidden="true" /> Editar</button>
        </>}
      </Head>

      <div className={s.ficha}>
        <section className={`${s.card} ${s.top}`} aria-labelledby="p-name">
          <div>
            <span className={s.kicker}>{p.category ?? (p.kind === 'service' ? 'Servicio' : 'Sin categoría')}</span>
            <h3 id="p-name" className={s.name}>{p.name}</h3>
            <p className={s.meta}>{[codesOf(p), p.brand ? `Marca ${p.brand}` : null].filter(Boolean).join(' · ')}</p>
            <div className={s.figures}>
              <div className={s.figure}>
                <small>Precio{main ? ` · ${main.name}` : ''}</small>
                <strong>{mainPrice === null ? '—' : fmtMoney(mainPrice)}</strong>
                <span>{taxText(p.tax_rate)}</span>
              </div>
              {isAdmin && (
                <div className={s.figure}>
                  <small>Costo</small>
                  <strong>{p.cost === null ? '—' : fmtMoney(p.cost)}</strong>
                  <span>Solo lo ven los administradores</span>
                </div>
              )}
              {p.kind === 'product' && (
                <div className={s.figure}>
                  <small>Existencias</small>
                  <strong>{p.stock === null ? '—' : p.stock.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</strong>
                  <span>{p.unit ? p.unit.toLowerCase() : 'sin unidad'}{p.stock !== null ? ` · al ${shortDate(p.updated_at)}` : ''}</span>
                </div>
              )}
            </div>
            {p.description && <p className={s.desc}>{p.description}</p>}
          </div>
          <dl className={s.details}>
            <dt>Tipo</dt><dd>{p.kind === 'service' ? 'Servicio' : 'Producto'}</dd>
            <dt>Unidad</dt><dd>{p.unit ?? '—'}</dd>
            <dt>IVA</dt><dd>{p.tax_rate ? `${p.tax_rate} %` : 'Exento'}</dd>
            <dt>Marca</dt><dd>{p.brand ?? '—'}</dd>
            {isAdmin && p.ext_key && <><dt>Clave</dt><dd>{p.ext_key}</dd></>}
            <dt>Actualizado</dt><dd>{shortDate(p.updated_at)}</dd>
          </dl>
        </section>

        <section className={s.card} aria-labelledby="p-lists">
          <h3 id="p-lists" className={s.cardTitle}>Listas de precios</h3>
          <div className={`${s.prices} ${withMargin ? '' : s.noMargin}`}>
            <div className={s.pricesHead}>
              <span>Lista</span><span>Precio con IVA</span>{withMargin && <><span>Margen</span><span>Ganancia</span></>}
            </div>
            {lists.map(l => {
              const price = p.prices[l.id] ?? null
              const m = withMargin ? marginOf(price, p.cost) : null
              return (
                <div key={l.id} className={s.priceRow}>
                  <span>{l.name}{l.is_main && <span className={s.mainTag}>Principal</span>}</span>
                  <span>{price === null ? <span className={s.muted}>Sin precio</span> : <strong>{fmtMoney(price)}</strong>}</span>
                  {withMargin && <>
                    <span className={s.muted}>{m ? `${m.pct} %` : '—'}</span>
                    <span className={s.muted}>{m ? fmtMoney(m.gain) : '—'}</span>
                  </>}
                </div>
              )
            })}
          </div>
          {lists.some(l => p.prices[l.id] === undefined) && main && (
            <p className={s.note}>Las listas sin precio usan el de {main.name} en las cotizaciones.</p>
          )}
        </section>
      </div>

      <ConfirmDialog open={confirm} busy={busy} error={actionError}
        title={`¿Eliminar «${p.name}»?`} confirmLabel="Eliminar" busyLabel="Eliminando…"
        onConfirm={remove} onCancel={() => { setConfirm(false); setActionError('') }}>
        Las cotizaciones que ya lo usaron no cambian. No se puede deshacer.
      </ConfirmDialog>
    </>
  )
}

function Head({ children }: { children?: React.ReactNode }) {
  return (
    <div className={s.fichaHead}>
      <Link href="/productos" className={`${s.back} ${s.press}`} aria-label="Volver a Productos"><ArrowLeft aria-hidden="true" /></Link>
      <h2>Producto</h2>
      {children && <div className={s.headActions}>{children}</div>}
    </div>
  )
}
