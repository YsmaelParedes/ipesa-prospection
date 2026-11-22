'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Download, Package, Plus, Search, Tag, Trash2, Upload } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { useSession } from '@/lib/profile'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { fmtMoney } from '@/lib/quotes'
import { PRODUCT_ORDERS, mainListOf, priceIn, type PriceList, type Product } from '@/lib/products'
import { downloadProductsWorkbook } from '@/lib/exportData'
import { Select } from '@/components/Select'
import { LoadFailed } from '@/components/LoadFailed'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PlanLimitHint } from '@/components/PlanLimitHint'
import { ProductRowsSkeleton } from './Skeletons'
import { ImportProductsModal } from './ImportProductsModal'
import { PriceListsModal } from './PriceListsModal'
import { StockTag, codesOf, fmtCount } from './ui'
import s from './productos.module.css'

type ListData = { products: Product[]; total: number; page: number; pageSize: number; lists: PriceList[] }
type Facets = { categories: string[]; brands: string[]; units: string[] }
type ListsData = { lists: (PriceList & { count: number })[]; total: number }

/**
 * Productos: el catálogo de la tienda con buscador, filtros y páginas de 50.
 * Todo el equipo lo consulta; los administradores importan, agregan, editan,
 * borran, descargan y administran las listas de precios.
 */
export default function ProductosPage() {
  const session = useSession()
  const readonly = session?.store?.access === 'readonly'
  const canEdit = !!session?.isAdmin && !readonly
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [order, setOrder] = useState<string>('name')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<null | 'import' | 'lists' | 'delete'>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState('')

  // Busca cuando dejas de escribir (no una petición por letra)
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 280)
    return () => clearTimeout(t)
  }, [q])
  // Otra búsqueda o filtro empieza en la primera página y sin selección
  useEffect(() => { setPage(0); setSelected(new Set()) }, [query, category, brand, order])

  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (category) params.set('category', category)
  if (brand) params.set('brand', brand)
  if (order !== 'name') params.set('order', order)
  if (page) params.set('page', String(page))
  const { data, error, loading, reload } = useCachedQuery<ListData>(`/api/data/products${params.size ? `?${params}` : ''}`)
  const { data: facets, reload: reloadFacets } = useCachedQuery<Facets>('/api/data/products/facets')
  const { data: listsData, reload: reloadLists } = useCachedQuery<ListsData>('/api/data/products/lists')
  useDataChanged(['product'], () => { reload(); reloadFacets(); reloadLists() })

  const main = useMemo(() => mainListOf(data?.lists ?? []), [data?.lists])
  const filtered = !!(query || category || brand)
  const total = listsData?.total
  const rows = data?.products ?? []
  const allOnPage = rows.length > 0 && rows.every(p => selected.has(p.id))

  const showToast = (text: string) => { setToast(text); setTimeout(() => setToast(''), 2600) }
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  async function remove() {
    setBusy(true); setActionError('')
    try {
      const r = await apiFetch('/api/data/products', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected] }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setActionError(d.error || 'No se pudieron borrar'); return }
      setDialog(null); setSelected(new Set())
      notifyDataChanged('product')
      showToast(d.deleted === 1 ? 'Producto borrado' : `${fmtCount(d.deleted ?? 0)} productos borrados`)
    } catch {
      setActionError('Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    if (!session?.store) return
    setDownloading(true)
    try {
      const n = await downloadProductsWorkbook(session.store.slug, { withCost: true })
      showToast(`Descargaste ${fmtCount(n)} producto${n === 1 ? '' : 's'}`)
    } catch (e) {
      showToast((e as Error).message || 'No se pudo descargar')
    } finally {
      setDownloading(false)
    }
  }

  const from = data ? data.page * data.pageSize + 1 : 0
  const to = data ? data.page * data.pageSize + rows.length : 0

  return (
    <>
      <div className={s.head}>
        <h2>Productos</h2>
        {total !== undefined && total > 0 && <span className={s.count}>{fmtCount(total)} producto{total === 1 ? '' : 's'}{main ? ` · precios de ${main.name}` : ''}</span>}
        {session?.isAdmin && (
          <div className={s.headActions}>
            {canEdit && <button className={`btn btn-ghost ${s.press}`} onClick={() => setDialog('lists')}><Tag aria-hidden="true" /> Listas de precios</button>}
            <button className={`btn btn-ghost ${s.press}`} onClick={download} disabled={downloading || !total}><Download aria-hidden="true" /> {downloading ? 'Descargando…' : 'Descargar'}</button>
            {canEdit && <button className={`btn btn-ghost ${s.press}`} onClick={() => setDialog('import')}><Upload aria-hidden="true" /> Importar</button>}
            {canEdit && <button className={`btn btn-primary ${s.press}`} onClick={() => openQuickCreate({ kind: 'product' })}><Plus aria-hidden="true" /> Agregar producto</button>}
          </div>
        )}
      </div>

      {canEdit && total !== undefined && <PlanLimitHint kind="products" used={total} />}

      {(total ?? 0) > 0 && (
        <div className={s.controls}>
          <label className={s.search}>
            <Search aria-hidden="true" />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, SKU o código de barras" aria-label="Buscar productos" />
          </label>
          {!!facets?.categories.length && (
            <div className={s.filter}>
              <Select value={category} onChange={setCategory} aria-label="Categoría" searchable searchPlaceholder="Buscar categoría…"
                options={[{ value: '', label: 'Todas las categorías' }, ...facets.categories.map(c => ({ value: c, label: c }))]} />
            </div>
          )}
          {!!facets?.brands.length && (
            <div className={s.filter}>
              <Select value={brand} onChange={setBrand} aria-label="Marca" searchable searchPlaceholder="Buscar marca…"
                options={[{ value: '', label: 'Todas las marcas' }, ...facets.brands.map(b => ({ value: b, label: b }))]} />
            </div>
          )}
          <div className={s.order}>
            <Select value={order} onChange={setOrder} aria-label="Ordenar" options={PRODUCT_ORDERS.map(o => ({ value: o.value, label: o.label }))} />
          </div>
        </div>
      )}

      {canEdit && selected.size > 0 && (
        <div className={s.selBar} role="status">
          <span>{selected.size === 1 ? '1 producto seleccionado' : `${fmtCount(selected.size)} productos seleccionados`}</span>
          <button className="btn btn-danger" onClick={() => { setActionError(''); setDialog('delete') }}><Trash2 aria-hidden="true" /> Borrar</button>
          <button className={s.selClear} onClick={() => setSelected(new Set())}>Quitar selección</button>
        </div>
      )}

      {loading ? (
        <ProductRowsSkeleton check={canEdit} />
      ) : error && !data ? (
        <LoadFailed message={error.message || 'No se pudieron cargar los productos'} onRetry={reload} />
      ) : !rows.length ? (
        <div className={s.empty}>
          <div className={s.mark}><Package aria-hidden="true" /></div>
          {filtered ? <>
            <h3>Sin productos con esa búsqueda</h3>
            <p>Prueba con otra palabra, el SKU o el código de barras, o quita los filtros.</p>
          </> : <>
            <h3>Todavía no hay productos</h3>
            <p>{canEdit
              ? 'Importa el Excel de tu punto de venta (con tus listas de precios) o agrega tus productos uno por uno. Después los eliges al hacer una cotización.'
              : 'Cuando tu administrador cargue los productos de la tienda, aquí los verás con sus precios y los podrás elegir al cotizar.'}</p>
            {canEdit && (
              <div className={s.emptyActions}>
                <button className="btn btn-primary" onClick={() => setDialog('import')}><Upload aria-hidden="true" /> Importar tu Excel</button>
                <button className="btn btn-ghost" onClick={() => openQuickCreate({ kind: 'product' })}><Plus aria-hidden="true" /> Agregar producto</button>
              </div>
            )}
          </>}
        </div>
      ) : (
        <div className={`${s.list} ${canEdit ? '' : s.noCheck}`}>
          <div className={s.listHead}>
            {canEdit && (
              <span className={s.check}>
                <input type="checkbox" checked={allOnPage} aria-label="Seleccionar los de esta página"
                  onChange={() => setSelected(prev => {
                    const next = new Set(prev)
                    rows.forEach(p => (allOnPage ? next.delete(p.id) : next.add(p.id)))
                    return next
                  })} />
              </span>
            )}
            <span>Producto</span><span>Existencias</span><span>Categoría</span><span className={s.right}>{main ? `Precio ${main.name}` : 'Precio'}</span>
          </div>
          {rows.map(p => {
            const price = main ? priceIn(p, main.id, main.id).price : null
            return (
              <div key={p.id} className={s.row} data-selected={selected.has(p.id)}>
                {canEdit && (
                  <span className={s.check}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Seleccionar ${p.name}`} />
                  </span>
                )}
                <span className={s.product}>
                  <Link href={`/productos/${p.id}`} className={s.rowLink}><b>{p.name}</b></Link>
                  <small>{codesOf(p)}</small>
                </span>
                <span className={s.stockCell}><StockTag p={p} /></span>
                <span className={s.category}>{p.category ?? 'Sin categoría'}</span>
                <span className={`${s.price} ${price === null ? s.priceNone : ''}`}>{price === null ? 'Sin precio' : fmtMoney(price)}</span>
              </div>
            )
          })}
          {data && (data.total > data.pageSize || data.page > 0) && (
            <div className={s.pager}>
              <span>{fmtCount(from)}–{fmtCount(to)} de {fmtCount(data.total)}</span>
              <div>
                <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</button>
                <button className="btn btn-ghost" disabled={to >= data.total} onClick={() => setPage(p => p + 1)}>Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {dialog === 'import' && <ImportProductsModal onClose={() => setDialog(null)} />}
      {dialog === 'lists' && <PriceListsModal onClose={() => setDialog(null)} onSaved={() => { setDialog(null); notifyDataChanged('product'); showToast('Listas de precios guardadas') }} />}
      <ConfirmDialog open={dialog === 'delete'} busy={busy} error={actionError}
        title={selected.size === 1 ? '¿Borrar 1 producto?' : `¿Borrar ${fmtCount(selected.size)} productos?`}
        confirmLabel="Borrar" busyLabel="Borrando…"
        onConfirm={remove} onCancel={() => { setDialog(null); setActionError('') }}>
        Las cotizaciones que ya los usaron no cambian. No se puede deshacer.
      </ConfirmDialog>

      {toast && <div className="toast-fixed" role="status"><Check size={14} strokeWidth={2.4} style={{ color: 'var(--warning-fill)' }} />{toast}</div>}
    </>
  )
}
