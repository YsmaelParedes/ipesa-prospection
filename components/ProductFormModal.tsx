'use client'

import { useEffect, useId, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { MAX_PRICE, PRODUCT_MAX, mainListOf, marginOf, normText, parseNumber, type PriceList, type Product, type ProductKind } from '@/lib/products'
import { Select } from '@/components/Select'
import { useUpgradeDialog } from '@/components/UpgradeDialog'
import s from './ProductForm.module.css'

type Facets = { categories: string[]; brands: string[]; units: string[] }
type Lists = { lists: (PriceList & { count: number })[]; total: number }

/** Unidades que se sugieren aunque la tienda aún no use ninguna. */
const BASE_UNITS = ['Pieza', 'Litro', 'Galón', 'Cubeta', 'Kilo', 'Metro', 'Metro cuadrado', 'Caja', 'Servicio']

const text = (v: string | null | undefined) => v ?? ''
const numText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

/**
 * Agregar o editar un producto (un solo formulario, también en «+ Nuevo»).
 * Los datos a la izquierda; el costo, el IVA, las existencias y el precio de
 * cada lista (con su margen) a la derecha. Solo administradores.
 */
export default function ProductFormModal({ product, onClose, onSaved }: {
  product?: Product
  onClose: () => void
  onSaved: (p: Product) => void
}) {
  const titleId = useId()
  const { data: listData } = useCachedQuery<Lists>('/api/data/products/lists')
  const { data: facets } = useCachedQuery<Facets>('/api/data/products/facets')
  const lists = listData?.lists ?? []
  const main = mainListOf(lists)

  const [kind, setKind] = useState<ProductKind>(product?.kind ?? 'product')
  const [name, setName] = useState(text(product?.name))
  const [sku, setSku] = useState(text(product?.sku))
  const [barcode, setBarcode] = useState(text(product?.barcode))
  const [category, setCategory] = useState(text(product?.category))
  const [brand, setBrand] = useState(text(product?.brand))
  const [unit, setUnit] = useState(text(product?.unit))
  const [description, setDescription] = useState(text(product?.description))
  const [cost, setCost] = useState(numText(product?.cost))
  const [tax, setTax] = useState(String(product?.tax_rate ?? 16))
  const [stock, setStock] = useState(numText(product?.stock))
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(product?.prices ?? {}).map(([k, v]) => [k, String(v)])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [limited, setLimited] = useState(false)
  const upgrade = useUpgradeDialog()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && !upgrade.dialog) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [saving, onClose, upgrade.dialog])

  const costNum = parseNumber(cost)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLimited(false)
    if (!name.trim()) { setError('Escribe el nombre del producto'); return }
    if (main && parseNumber(prices[main.id] ?? '') === null) { setError(`Escribe el precio de ${main.name}`); return }
    const bad = lists.find(l => (prices[l.id] ?? '').trim() && (parseNumber(prices[l.id]) === null || parseNumber(prices[l.id])! < 0 || parseNumber(prices[l.id])! > MAX_PRICE))
    if (bad) { setError(`Revisa el precio de ${bad.name}`); return }
    if (cost.trim() && (costNum === null || costNum < 0)) { setError('Revisa el costo'); return }
    if (stock.trim() && parseNumber(stock) === null) { setError('Revisa las existencias'); return }

    const body = {
      kind, name: name.trim(), sku: sku.trim(), barcode: barcode.trim(), category: category.trim(), brand: brand.trim(),
      unit: unit.trim(), description: description.trim(), cost: cost.trim() ? costNum : null, tax_rate: Number(tax),
      stock: kind === 'service' || !stock.trim() ? null : parseNumber(stock),
      prices: Object.fromEntries(lists.map(l => [l.id, (prices[l.id] ?? '').trim() ? parseNumber(prices[l.id]) : null])),
    }
    setSaving(true)
    try {
      const r = await apiFetch(product ? `/api/data/products/${product.id}` : '/api/data/products', {
        method: product ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(d.error || 'No se pudo guardar el producto')
        if (d.code === 'PLAN_LIMIT') setLimited(true)
        return
      }
      onSaved(d.product as Product)
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const units = [...new Set([...(facets?.units ?? []), ...BASE_UNITS])]

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className={`modal-card ${s.card}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <form onSubmit={save} noValidate>
          <div className="modal-head">
            <h3 id={titleId}>{product ? 'Editar producto' : 'Agregar producto'}</h3>
            <button type="button" className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar" disabled={saving}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <div className={s.cols}>
              <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <legend className={s.legend}>Datos del producto</legend>
                <div className={s.seg} role="group" aria-label="Tipo">
                  <button type="button" aria-pressed={kind === 'product'} onClick={() => setKind('product')}>Producto</button>
                  <button type="button" aria-pressed={kind === 'service'} onClick={() => setKind('service')}>Servicio</button>
                </div>
                <div className="field">
                  <label htmlFor="p-name">Nombre</label>
                  <input id="p-name" value={name} maxLength={PRODUCT_MAX.name} autoFocus onChange={e => setName(e.target.value)}
                    placeholder={kind === 'service' ? 'Ej.: Aplicación de impermeabilizante' : 'Ej.: Pintura vinílica blanca'} />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="p-sku">SKU <span className="label-muted">(opcional)</span></label>
                    <input id="p-sku" value={sku} maxLength={PRODUCT_MAX.sku} onChange={e => setSku(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="p-barcode">Código de barras <span className="label-muted">(opcional)</span></label>
                    <input id="p-barcode" value={barcode} maxLength={PRODUCT_MAX.barcode} inputMode="numeric" onChange={e => setBarcode(e.target.value)} />
                  </div>
                </div>
                <div className={s.grid3}>
                  <SuggestField id="p-category" label="Categoría" value={category} max={PRODUCT_MAX.category} options={facets?.categories ?? []} onChange={setCategory} />
                  <SuggestField id="p-brand" label="Marca" value={brand} max={PRODUCT_MAX.brand} options={facets?.brands ?? []} onChange={setBrand} />
                  <SuggestField id="p-unit" label="Unidad" value={unit} max={PRODUCT_MAX.unit} options={units} onChange={setUnit} />
                </div>
                <p className={s.hint}>Escribe para elegir una que ya usas o crear una nueva.</p>
                <div className="field">
                  <label htmlFor="p-desc">Descripción <span className="label-muted">(opcional)</span></label>
                  <textarea id="p-desc" rows={3} value={description} maxLength={PRODUCT_MAX.description} onChange={e => setDescription(e.target.value)} />
                </div>
              </fieldset>

              <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <legend className={s.legend}>Precios y existencias</legend>
                <div className={s.grid3}>
                  <div className="field">
                    <label htmlFor="p-cost">Costo con IVA</label>
                    <span className={s.money}><input id="p-cost" inputMode="decimal" value={cost} placeholder="0.00" onChange={e => setCost(e.target.value)} /></span>
                  </div>
                  <div className="field">
                    <label>IVA</label>
                    <Select value={tax} onChange={setTax} aria-label="IVA"
                      options={[{ value: '16', label: '16 %' }, { value: '8', label: '8 %' }, { value: '0', label: 'Exento' }]} />
                  </div>
                  {kind === 'product' && (
                    <div className="field">
                      <label htmlFor="p-stock">Existencias</label>
                      <input id="p-stock" inputMode="decimal" value={stock} placeholder="0" onChange={e => setStock(e.target.value)} />
                    </div>
                  )}
                </div>

                <div className={s.prices} role="group" aria-label="Precios con IVA por lista">
                  <div className={s.pricesHead}><span>Lista de precios</span><span>Precio con IVA</span><span>Margen</span></div>
                  {!listData && <div className={s.priceRow}><span className={s.listName}>Cargando listas…</span></div>}
                  {lists.map(l => {
                    const m = marginOf(parseNumber(prices[l.id] ?? ''), costNum)
                    return (
                      <div key={l.id} className={s.priceRow}>
                        <label htmlFor={`p-price-${l.id}`} className={s.listName}>{l.name}{l.is_main && <span className={s.mainTag}>Principal</span>}</label>
                        <span className={s.money}>
                          <input id={`p-price-${l.id}`} inputMode="decimal" value={prices[l.id] ?? ''} placeholder={l.is_main ? '0.00' : 'Sin precio'}
                            onChange={e => setPrices(p => ({ ...p, [l.id]: e.target.value }))} />
                        </span>
                        <span className={s.margin}>{m ? `${m.pct} %` : '—'}</span>
                      </div>
                    )
                  })}
                </div>
                <p className={s.pricesNote}>
                  {main ? `El precio de ${main.name} es obligatorio. ` : ''}Una lista sin precio usa el de {main?.name ?? 'la principal'} en las cotizaciones.
                </p>
              </fieldset>
            </div>
            {error && (
              <div className={s.error} role="alert">
                <span>{error}</span>
                {limited && <button type="button" className="link-btn" onClick={() => upgrade.open('productos')}>Cambiar a Cubeta</button>}
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !listData}>
              {saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Agregar producto'}
            </button>
          </div>
        </form>
      </div>
      {upgrade.dialog}
    </div>
  )
}

/** Texto libre con las opciones que ya usa la tienda (lista propia, no la del navegador). */
function SuggestField({ id, label, value, max, options, onChange }: {
  id: string; label: string; value: string; max: number; options: string[]; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = normText(value)
  const exact = options.some(o => normText(o) === q)
  // Con un valor ya elegido se ven todas (para cambiarlo); al escribir, las que coinciden
  const shown = options.filter(o => !q || exact || normText(o).includes(q)).slice(0, 50)
  const show = open && shown.length > 0
  const pick = (v: string) => { onChange(v); setOpen(false); setActive(-1) }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={s.suggestWrap}>
        <input id={id} value={value} maxLength={max} autoComplete="off" role="combobox" aria-expanded={show} aria-autocomplete="list"
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(shown.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(-1, a - 1)) }
            else if (e.key === 'Enter' && show && active >= 0) { e.preventDefault(); pick(shown[active]) }
            else if (e.key === 'Escape' && show) { e.stopPropagation(); setOpen(false) }
          }} />
        <ChevronDown aria-hidden="true" />
        {show && (
          <div className={s.suggest} role="listbox" aria-label={label}>
            {shown.map((o, i) => (
              <button key={o} type="button" role="option" aria-selected={i === active || normText(o) === q}
                onMouseDown={e => { e.preventDefault(); pick(o) }}>{o}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
