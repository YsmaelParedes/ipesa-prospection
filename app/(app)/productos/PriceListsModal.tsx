'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { MAX_PRICE_LISTS, PRODUCT_MAX, normText, type PriceList } from '@/lib/products'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Loading, Sk, skRows } from '@/components/Skeleton'
import { fmtCount } from './ui'
import s from './productos.module.css'

type Row = { key: string; id: string | null; name: string; count: number }
type ListsData = { lists: (PriceList & { count: number })[]; total: number }

let seq = 0

/**
 * Listas de precios de la tienda (administradores): cambiar el nombre, elegir
 * la principal (la de la lista de productos y la de una cotización nueva),
 * agregar y borrar. Borrar quita sus precios de todos los productos y se
 * confirma aparte; la principal no se puede borrar.
 */
export function PriceListsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data, reload } = useCachedQuery<ListsData>('/api/data/products/lists')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [main, setMain] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<Row | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState('')

  // La primera vez que llegan las listas (después, lo que se edita aquí manda)
  useEffect(() => {
    if (!data || rows) return
    setRows(data.lists.map(l => ({ key: l.id, id: l.id, name: l.name, count: l.count })))
    setMain(data.lists.find(l => l.is_main)?.id ?? data.lists[0]?.id ?? '')
  }, [data, rows])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && !removing) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [saving, removing, onClose])

  async function save() {
    if (!rows) return
    setError('')
    if (rows.some(r => !r.name.trim())) { setError('Cada lista necesita un nombre'); return }
    if (new Set(rows.map(r => normText(r.name))).size !== rows.length) { setError('Hay dos listas con el mismo nombre'); return }
    const mainIndex = rows.findIndex(r => r.key === main)
    setSaving(true)
    try {
      const r = await apiFetch('/api/data/products/lists', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists: rows.map(x => ({ id: x.id, name: x.name.trim() })), main: Math.max(0, mainIndex) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudieron guardar las listas'); return }
      onSaved()
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    // Una lista que aún no se guarda solo se quita de aquí
    if (!removing.id) { setRows(rs => rs?.filter(x => x.key !== removing.key) ?? rs); setRemoving(null); return }
    setRemoveBusy(true); setRemoveError('')
    try {
      const r = await apiFetch(`/api/data/products/lists/${removing.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setRemoveError(d.error || 'No se pudo borrar la lista'); return }
      setRows(rs => rs?.filter(x => x.key !== removing.key) ?? rs)
      setRemoving(null)
      reload()
    } catch {
      setRemoveError('Sin conexión. Intenta de nuevo.')
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !saving && !removing) onClose() }}>
      <div className={`modal-card ${s.listsCard}`} role="dialog" aria-modal="true" aria-labelledby="lists-title">
        <div className="modal-head">
          <h3 id="lists-title">Listas de precios</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar" disabled={saving}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
            La principal es la que se ve en la lista de productos y la que usa una cotización nueva. Las listas también se crean al importar.
          </p>
          <div className={s.listsHead}><span>Nombre</span><span>Productos</span><span>Principal</span><span /></div>
          {!rows ? (
            <Loading label="Cargando listas…">
              {skRows(3, i => <div key={i} className={s.listsRow}><Sk h={34} r={6} /><Sk w={70} h={12} /><Sk w={40} h={16} /><span /></div>)}
            </Loading>
          ) : (
            <div role="radiogroup" aria-label="Lista principal">
              {rows.map(r => (
                <div key={r.key} className={s.listsRow}>
                  <input type="text" value={r.name} maxLength={PRODUCT_MAX.listName} aria-label="Nombre de la lista"
                    onChange={e => setRows(rs => rs?.map(x => (x.key === r.key ? { ...x, name: e.target.value } : x)) ?? rs)} />
                  <small>{r.id ? `${fmtCount(r.count)} con precio` : 'Nueva'}</small>
                  <label className={s.mainRadio}>
                    <input type="radio" name="main-list" checked={main === r.key} onChange={() => setMain(r.key)} />
                    {main === r.key ? 'Sí' : ''}
                  </label>
                  <button type="button" className={s.iconBtn} aria-label={`Borrar la lista ${r.name}`} disabled={main === r.key || rows.length <= 1}
                    title={main === r.key ? 'La principal no se puede borrar' : undefined}
                    onClick={() => { setRemoveError(''); setRemoving(r) }}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
              {rows.length < MAX_PRICE_LISTS && (
                <button type="button" className={`link-btn ${s.addList}`}
                  onClick={() => setRows(rs => [...(rs ?? []), { key: `new-${++seq}`, id: null, name: '', count: 0 }])}>
                  <Plus aria-hidden="true" /> Nueva lista
                </button>
              )}
            </div>
          )}
          {error && <div className="field-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !rows}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>

      <ConfirmDialog open={!!removing} busy={removeBusy} error={removeError}
        title={`¿Borrar la lista «${removing?.name.trim() || 'sin nombre'}»?`} confirmLabel="Borrar lista" busyLabel="Borrando…"
        onConfirm={confirmRemove} onCancel={() => { setRemoving(null); setRemoveError('') }}>
        {removing?.id
          ? `Sus precios se quitan de ${removing.count === 1 ? '1 producto' : `${fmtCount(removing.count)} productos`} y las cotizaciones que la usaban toman la principal. No se puede deshacer.`
          : 'Todavía no se guarda: solo se quita de esta ventana.'}
      </ConfirmDialog>
    </div>
  )
}
