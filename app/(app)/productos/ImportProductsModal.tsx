'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, FileSpreadsheet, Upload, X } from 'lucide-react'
import { apiFetch, batchQueryChanges } from '@/lib/apiClient'
import { useSession } from '@/lib/profile'
import { notifyDataChanged } from '@/lib/crmEvents'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { fmtMoney } from '@/lib/quotes'
import {
  IMPORT_CHUNK, IMPORT_FIELDS, PRODUCT_MAX, buildImport, guessMapping, headerRowIndex, normText, priceColumnsOf,
  type ImportField, type ImportPlan, type PriceList,
} from '@/lib/products'
import { Select, toOptions } from '@/components/Select'
import { useUpgradeDialog } from '@/components/UpgradeDialog'
import { fmtCount } from './ui'
import s from './productos.module.css'

type Step = 'drop' | 'map' | 'preview' | 'importing' | 'done'
type Row = Record<string, unknown>
type Result = { created: number; updated: number; overLimit: number; invalid: number; failed: number; error: string; limit: number | null }

const STEPS: { key: Step[]; label: string }[] = [
  { key: ['drop'], label: 'Archivo' },
  { key: ['map'], label: 'Columnas' },
  { key: ['preview', 'importing', 'done'], label: 'Vista previa' },
]

/**
 * Importar productos desde Excel o CSV en tres pasos: el archivo, qué es cada
 * columna (sugerido por su nombre, sirve el Excel de Pulpos o uno propio) y
 * una vista previa. Cada columna «Precio …» es una lista de precios. Al
 * volver a importar se actualiza por la clave y lo vacío no borra nada.
 */
export function ImportProductsModal({ onClose }: { onClose: () => void }) {
  const session = useSession()
  const { data: listsData } = useCachedQuery<{ lists: PriceList[]; total: number }>('/api/data/products/lists')
  const [step, setStep] = useState<Step>('drop')
  const [file, setFile] = useState<{ name: string; sheet: string } | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({})
  const [priceCols, setPriceCols] = useState<{ header: string; name: string }[]>([])
  const [withTax, setWithTax] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const upgrade = useUpgradeDialog()

  const busy = step === 'importing'
  const finish = () => { if (result) notifyDataChanged('product'); onClose() }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy && !upgrade.dialog) finish() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  async function parseFile(f: File) {
    setError('')
    if (f.size > 10 * 1024 * 1024) { setError('El archivo pasa de 10 MB.'); return }
    try {
      let hdrs: string[] = []
      let data: Row[] = []
      let sheet = ''
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await f.arrayBuffer())
        sheet = wb.SheetNames[0]
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' }) as unknown[][]
        // Los encabezados no siempre están en la fila 1 (Pulpos deja dos vacías arriba)
        const at = Math.max(0, headerRowIndex(grid))
        hdrs = (grid[at] ?? []).map(h => String(h ?? '').trim())
        data = grid.slice(at + 1).map(r => Object.fromEntries(hdrs.map((h, i) => [h, r[i] ?? ''])))
      } else {
        const Papa = (await import('papaparse')).default
        const parsed = await new Promise<{ data: Row[]; fields: string[] }>((resolve, reject) => Papa.parse<Row>(f, {
          header: true, skipEmptyLines: true,
          complete: res => resolve({ data: res.data, fields: res.meta.fields ?? [] }), error: reject,
        }))
        hdrs = parsed.fields.map(h => h.trim())
        data = parsed.data
      }
      data = data.filter(r => Object.values(r).some(v => String(v ?? '').trim() !== ''))
      if (!hdrs.filter(Boolean).length || !data.length) { setError('El archivo no tiene filas de productos.'); return }
      setFile({ name: f.name, sheet })
      setHeaders(hdrs.filter(Boolean)); setRows(data)
      setMapping(guessMapping(hdrs)); setPriceCols(priceColumnsOf(hdrs))
      setStep('map')
    } catch {
      setError('No se pudo leer el archivo. Revisa que sea un Excel (.xlsx) o un CSV.')
    }
  }

  const plan: ImportPlan | null = useMemo(
    () => (step === 'preview' || step === 'importing' || step === 'done' ? buildImport(rows, mapping, priceCols, { pricesIncludeTax: withTax }) : null),
    [step, rows, mapping, priceCols, withTax])

  const existing = listsData?.lists ?? []
  const listTag = (name: string) => {
    const n = normText(name)
    if (!n) return { label: 'No se importa', cls: s.tagOff }
    const hit = existing.find(l => normText(l.name) === n)
    return hit ? { label: hit.is_main ? 'Principal · ya existe' : 'Ya existe', cls: s.tagSame } : { label: 'Nueva', cls: s.tagNew }
  }
  const newLists = plan ? plan.lists.filter(n => !existing.some(l => normText(l.name) === normText(n))).length : 0
  const limit = session?.store?.limits.products ?? null
  const used = listsData?.total ?? 0
  const canMap = !!(mapping.name || mapping.key || mapping.sku)

  async function run() {
    if (!plan?.items.length) return
    setStep('importing'); setProgress(0)
    const acc: Result = { created: 0, updated: 0, overLimit: 0, invalid: 0, failed: 0, error: '', limit: null }
    await batchQueryChanges(async () => {
      for (let i = 0; i < plan.items.length; i += IMPORT_CHUNK) {
        const chunk = plan.items.slice(i, i + IMPORT_CHUNK)
        if (acc.error) { acc.failed += chunk.length; continue }
        try {
          const r = await apiFetch('/api/data/products/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lists: plan.lists, items: chunk }),
          })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) { acc.error = d.error || 'No se pudieron importar'; acc.failed += chunk.length }
          else {
            acc.created += d.created ?? 0; acc.updated += d.updated ?? 0; acc.overLimit += d.overLimit ?? 0
            acc.invalid += d.invalid ?? 0; acc.limit = d.limit ?? null
          }
        } catch {
          acc.error = 'Se perdió la conexión'; acc.failed += chunk.length
        }
        setProgress(Math.min(plan.items.length, i + chunk.length))
      }
    })
    setResult(acc)
    setStep('done')
  }

  const stepIndex = STEPS.findIndex(st => st.key.includes(step))

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !busy) finish() }}>
      <div className={`modal-card ${s.importCard}`} role="dialog" aria-modal="true" aria-labelledby="imp-title">
        <div className="modal-head">
          <h3 id="imp-title">Importar productos</h3>
          {!busy && <button className="modal-close btn-icon" onClick={finish} aria-label="Cerrar"><X size={18} /></button>}
        </div>
        <ol className={s.steps} aria-label="Pasos">
          {STEPS.map((st, i) => (
            <li key={st.label} data-state={i === stepIndex ? 'on' : i < stepIndex ? 'done' : 'off'} aria-current={i === stepIndex ? 'step' : undefined}>
              <i>{i + 1}</i><span>{st.label}</span>
            </li>
          ))}
        </ol>

        <div className="modal-body">
          {step === 'drop' && <>
            <label className={`import-drop ${dragging ? 'over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void parseFile(f) }}>
              <Upload size={36} strokeWidth={1.6} style={{ color: 'var(--muted)', margin: '0 auto 10px', display: 'block' }} />
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Arrastra aquí tu Excel o CSV</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>o haz clic para elegir el archivo</div>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) void parseFile(f) }} />
            </label>
            <div className="soft-note" style={{ marginTop: 12, marginBottom: 0 }}>
              Sirve el Excel que descargas de tu punto de venta o uno propio. Arriba de los productos debe ir una fila con los nombres de las columnas; en el siguiente paso eliges qué es cada una.
            </div>
            {error && <div className="field-error" style={{ marginTop: 10 }}>{error}</div>}
          </>}

          {step === 'map' && <>
            {file && (
              <div className={s.fileCard} style={{ marginTop: 0, marginBottom: 14 }}>
                <FileSpreadsheet aria-hidden="true" />
                <div><strong>{file.name}</strong><small>{file.sheet ? `Hoja «${file.sheet}» · ` : ''}{fmtCount(rows.length)} filas · {headers.length} columnas</small></div>
                <button className="btn btn-ghost" onClick={() => setStep('drop')}>Cambiar</button>
              </div>
            )}
            <div className={s.mapCols}>
              <section aria-labelledby="map-data">
                <h4 id="map-data" className={s.mapTitle}>Datos del producto</h4>
                {IMPORT_FIELDS.map(f => (
                  <div key={f.field} className={`map-row ${f.field === 'key' ? s.mapKey : ''}`}>
                    <span className="map-label">{f.label}</span>
                    <Select className="map-select" value={mapping[f.field] ?? ''} aria-label={`Columna para ${f.label}`} searchPlaceholder="Buscar columna…"
                      onChange={v => setMapping(m => ({ ...m, [f.field]: v || undefined }))}
                      options={[{ value: '', label: 'No importar' }, ...toOptions(headers)]} />
                  </div>
                ))}
                <p className="field-hint">La clave sirve para reconocer cada producto al volver a importar: se actualiza en lugar de duplicarse. Si no hay, se usa el SKU.</p>
              </section>
              <section aria-labelledby="map-lists">
                <h4 id="map-lists" className={s.mapTitle}>Listas de precios</h4>
                {!priceCols.length && <p className="field-hint" style={{ marginTop: 0 }}>No encontramos columnas de precio (las que empiezan con «Precio»). Podrás escribir los precios en cada producto.</p>}
                <div className={s.listMap}>
                  {priceCols.map((c, i) => {
                    const tag = listTag(c.name)
                    return (
                      <div key={c.header} className={s.listItem}>
                        <small>Columna «{c.header}»</small>
                        <div>
                          <input value={c.name} maxLength={PRODUCT_MAX.listName} aria-label={`Lista para la columna ${c.header}`} placeholder="No importar"
                            onChange={e => setPriceCols(cols => cols.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                          <span className={`${s.tag} ${tag.cls}`}>{tag.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {priceCols.length > 0 && <p className="field-hint">Cambia el nombre de una lista si quieres, o déjalo vacío para no importar esa columna.</p>}
                <label className={s.taxCheck}>
                  <input type="checkbox" checked={withTax} onChange={e => setWithTax(e.target.checked)} />
                  Los precios y el costo de mi archivo incluyen IVA
                </label>
              </section>
            </div>
          </>}

          {(step === 'preview' || step === 'importing') && plan && <>
            <div className={s.summary}>
              <div><strong>{fmtCount(plan.items.length)}</strong><span>productos en el archivo</span></div>
              <div><strong>{fmtCount(plan.lists.length)}</strong><span>{newLists ? `listas de precios (${newLists} nueva${newLists === 1 ? '' : 's'})` : 'listas de precios'}</span></div>
              <div><strong>{fmtCount(plan.skipped)}</strong><span>filas sin nombre ni clave (se omiten)</span></div>
            </div>
            {limit !== null && (
              <div className="soft-note">
                Tu plan {session?.store?.planLabel} incluye hasta <strong>{fmtCount(limit)} productos</strong> y tienes {fmtCount(used)}. Los nuevos entran hasta llegar al límite; los que ya tienes se actualizan siempre.
              </div>
            )}
            {!mapping.name && <div className="soft-note">Sin columna de nombre solo se actualizan productos que ya existen.</div>}
            <div className={s.preview}>
              <div className={s.previewHead}><span>Producto</span><span>Unidad</span><span>SKU</span><span>{plan.lists[0] ?? 'Precio'}</span><span>Existencias</span></div>
              {plan.items.slice(0, 5).map((it, i) => (
                <div key={i} className={s.previewRow}>
                  <span>{it.name ?? it.key ?? it.sku}</span><span>{it.unit ?? '—'}</span><span>{it.sku ?? '—'}</span>
                  <span>{it.prices[0] != null ? fmtMoney(it.prices[0]) : '—'}</span>
                  <span>{it.kind === 'service' ? 'Servicio' : it.stock ?? '—'}</span>
                </div>
              ))}
              {plan.items.length > 5 && <div className={s.previewMore}>y {fmtCount(plan.items.length - 5)} productos más</div>}
            </div>
            <p className="field-hint">Los productos con la misma clave se actualizan; una celda vacía no borra lo que ya tenían. Lo que no viene en el archivo no se toca. Los precios quedan con IVA.</p>
            {step === 'importing' && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Importando {fmtCount(progress)} de {fmtCount(plan.items.length)}…</div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${(progress / Math.max(1, plan.items.length)) * 100}%` }} /></div>
              </div>
            )}
          </>}

          {step === 'done' && result && (
            <div className="import-result">
              <p className="import-result-main"><Check aria-hidden="true" /> <strong>{fmtCount(result.created + result.updated)}</strong> producto{result.created + result.updated === 1 ? '' : 's'} importado{result.created + result.updated === 1 ? '' : 's'}</p>
              <ul>
                <li><strong>{fmtCount(result.created)}</strong> nuevo{result.created === 1 ? '' : 's'} y <strong>{fmtCount(result.updated)}</strong> actualizado{result.updated === 1 ? '' : 's'}.</li>
                {result.overLimit > 0 && (
                  <li>
                    <strong>{fmtCount(result.overLimit)}</strong> no cupieron: tu plan {session?.store?.planLabel} incluye {fmtCount(result.limit ?? limit ?? 0)} productos.{' '}
                    {session?.isAdmin && <button type="button" className="link-btn" onClick={() => upgrade.open('productos')}>Cambiar a Cubeta</button>}
                  </li>
                )}
                {result.invalid > 0 && <li><strong>{fmtCount(result.invalid)}</strong> sin nombre no se pudieron crear.</li>}
                {plan && plan.skipped > 0 && <li><strong>{fmtCount(plan.skipped)}</strong> filas sin nombre ni clave se omitieron.</li>}
                {result.failed > 0 && <li><strong>{fmtCount(result.failed)}</strong> no se importaron: {result.error}. Vuelve a subir el archivo; los que ya entraron no se duplican.</li>}
              </ul>
            </div>
          )}
        </div>

        {step !== 'importing' && (
          <div className="modal-foot">
            {step === 'done' ? (
              <button className="btn btn-primary" onClick={finish}>Ver productos</button>
            ) : <>
              <button className="btn btn-ghost" onClick={step === 'drop' ? finish : () => setStep(step === 'preview' ? 'map' : 'drop')}>
                {step === 'drop' ? 'Cancelar' : 'Atrás'}
              </button>
              {step === 'map' && <button className="btn btn-primary" disabled={!canMap} onClick={() => setStep('preview')}>Revisar</button>}
              {step === 'preview' && plan && (
                <button className="btn btn-primary" disabled={!plan.items.length} onClick={run}>
                  Importar {fmtCount(plan.items.length)} producto{plan.items.length === 1 ? '' : 's'}
                </button>
              )}
            </>}
          </div>
        )}
      </div>
      {upgrade.dialog}
    </div>
  )
}
