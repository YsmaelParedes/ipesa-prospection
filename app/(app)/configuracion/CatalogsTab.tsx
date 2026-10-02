'use client'

import { useCallback, useEffect, useState } from 'react'
import { invalidateCatalogs } from '@/lib/catalogs'
import { Ico, Note, Panel, Spinner, api, send, useToast } from './ui'
import s from './configuracion.module.css'

type ConfigItem = { id: string; type: string; label: string; created_at: string }

function norm(text: string) {
  return (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

const CHIP_PALETTES = [
  { bg: '#FFE9EC', color: '#C2071E' }, { bg: '#FCE6F2', color: '#A80F60' },
  { bg: '#DFF6FB', color: '#006E87' }, { bg: '#E0F6F1', color: '#0F7462' },
  { bg: '#E5F6E9', color: '#1E7A3C' }, { bg: '#FFF4D4', color: '#8A5F00' },
  { bg: '#F6E4EE', color: '#861456' },
]
function chipColor(label: string) {
  let h = 5381
  for (let i = 0; i < label.length; i++) h = ((h << 5) + h) ^ label.charCodeAt(i)
  return CHIP_PALETTES[Math.abs(h) % CHIP_PALETTES.length]
}

function CatalogPanel({ type, title, singular, subtitle, icon, tone, canEdit }: {
  type: 'segment' | 'canal'; title: string; singular: string; subtitle: string
  icon: typeof Ico.tag; tone?: 'tCyan' | 'tMagenta'; canEdit: boolean
}) {
  const [toast, showToast] = useToast()
  const [items, setItems]       = useState<ConfigItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [label, setLabel]       = useState('')
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: ConfigItem[] }>(`/api/data/config?type=${type}`)
      setItems(d.items ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [type])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    if (items.some(i => norm(i.label) === norm(trimmed))) { setError(`Ya existe "${trimmed}"`); return }
    setSaving(true)
    setError('')
    try {
      await api('/api/data/config', send('POST', { type, label: trimmed }))
      setLabel('')
      showToast(`"${trimmed}" agregado`)
      invalidateCatalogs()
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: ConfigItem) => {
    setError('')
    try {
      await api(`/api/data/config/${item.id}`, { method: 'DELETE' })
      showToast(`"${item.label}" eliminado`)
      invalidateCatalogs()
    } catch (err) {
      setError((err as Error).message)
    }
    setConfirmDel(null)
    await load()
  }

  return (
    <Panel icon={icon} tone={tone} title={title} subtitle={subtitle} actions={<span className={s.count}>{items.length}</span>}>
      {loading ? <Spinner /> : (
        <div className={s.list}>
          {items.length === 0 && <div className={s.empty}>Aún no hay {title.toLowerCase()}.</div>}
          {items.map(item => {
            const { bg, color } = chipColor(item.label)
            return (
              <div key={item.id} className={s.item}>
                <span className="chip" style={{ background: bg, color, fontSize: 12.5 }}><span className="chip-dot" style={{ background: color }} />{item.label}</span>
                {canEdit && (
                  <span className={s.itemActions}>
                    {confirmDel === item.id ? (
                      <>
                        <span className={s.confirm}>¿Eliminar?</span>
                        <button className={`${s.mini} ${s.miniDanger}`} onClick={() => remove(item)}>Sí</button>
                        <button className={`${s.mini} ${s.miniGhost}`} onClick={() => setConfirmDel(null)}>No</button>
                      </>
                    ) : (
                      <button className="icon-btn icon-btn-delete" onClick={() => setConfirmDel(item.id)} title="Eliminar" aria-label={`Eliminar ${item.label}`}><Ico.trash /></button>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {canEdit && (
        <form className={s.addRow} onSubmit={add}>
          <input className={s.input} value={label} onChange={e => { setLabel(e.target.value); setError('') }} maxLength={100}
            placeholder={`Nuevo ${singular}…`} aria-label={`Nuevo ${singular}`} />
          <button type="submit" className="btn btn-primary" disabled={!label.trim() || saving} style={{ flexShrink: 0 }}>
            <Ico.plus style={{ width: 14, height: 14 }} />{saving ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
      )}
      {error && <div className={s.error}>{error}</div>}
      {toast}
    </Panel>
  )
}

export function CatalogsTab({ canEdit }: { canEdit: boolean }) {
  return (
    <>
      {!canEdit && <Note>Solo el dueño o un administrador puede cambiar estas opciones, porque afectan a todo el equipo.</Note>}
      <div className={s.grid2}>
        <CatalogPanel type="segment" title="Segmentos" singular="segmento" icon={Ico.tag} canEdit={canEdit}
          subtitle="Tipos de cliente para contactos y leads." />
        <CatalogPanel type="canal" title="Canales" singular="canal" icon={Ico.channel} tone="tCyan" canEdit={canEdit}
          subtitle="Cómo te conoció el cliente." />
      </div>
    </>
  )
}
