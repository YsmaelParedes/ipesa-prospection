'use client'

import { useQueryEffect } from '@/lib/useCachedQuery'


import { useCallback, useState } from 'react'
import { Card, Ico, Note, api, cx, send, useToast } from './ui'
import { ChipsSkeleton } from './SettingsSkeleton'
import { SkText } from '@/components/Skeleton'
import s from './configuracion.module.css'
import { PencilLine, X } from 'lucide-react'
import { notifyDataChanged } from '@/lib/crmEvents'
import { ConfirmDialog } from '@/components/ConfirmDialog'

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

type CatalogType = 'segment' | 'canal' | 'zone'
const CATALOGS: { type: CatalogType; title: string; singular: string; subtitle: string }[] = [
  { type: 'segment', title: 'Segmentos', singular: 'segmento', subtitle: 'Tipos de cliente para tus contactos.' },
  { type: 'canal',   title: 'Canales',   singular: 'canal',    subtitle: 'Cómo te conoció el cliente.' },
  { type: 'zone',    title: 'Zonas',     singular: 'zona',     subtitle: 'Áreas de la ciudad para filtrar el sistema comercial.' },
]

/** Las tres listas se cargan juntas para mostrar cuántas opciones tiene cada pestaña. */
function useCatalogs() {
  const [lists, setLists] = useState<Record<CatalogType, ConfigItem[]> | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const all = await Promise.all(CATALOGS.map(c => api<{ items: ConfigItem[] }>(`/api/data/config?type=${c.type}`)))
      setLists({ segment: all[0].items ?? [], canal: all[1].items ?? [], zone: all[2].items ?? [] })
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])
  useQueryEffect(() => { load() }, [load])
  return { lists, error, load }
}

export function CatalogsTab({ canEdit }: { canEdit: boolean }) {
  const [toast, showToast] = useToast()
  const { lists, error: loadError, load } = useCatalogs()
  const [active, setActive]   = useState<CatalogType>('segment')
  const [label, setLabel]     = useState('')
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  // Cambiar el nombre: la opción y los contactos que la tienen
  const [renaming, setRenaming] = useState<ConfigItem | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState('')

  const cat = CATALOGS.find(c => c.type === active)!
  const items = lists?.[active] ?? []

  const pick = (type: CatalogType) => { setActive(type); setLabel(''); setError(''); setConfirmDel(null); setRenaming(null) }

  const askRename = (item: ConfigItem) => { setRenaming(item); setNewLabel(item.label); setRenameError('') }
  const rename = async () => {
    if (!renaming) return
    const next = newLabel.trim()
    if (!next || next === renaming.label) { setRenaming(null); return }
    setRenameBusy(true); setRenameError('')
    try {
      const r = await api<{ label: string; contacts: number }>(`/api/data/config/${renaming.id}`, send('PATCH', { label: next }))
      showToast(r.contacts ? `«${renaming.label}» ahora es «${r.label}» en ${r.contacts.toLocaleString('es-MX')} contacto${r.contacts !== 1 ? 's' : ''}` : `«${renaming.label}» ahora es «${r.label}»`)
      setRenaming(null)
      notifyDataChanged('contact')
      await load()
    } catch (err) {
      setRenameError((err as Error).message)
    } finally {
      setRenameBusy(false)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    if (items.some(i => norm(i.label) === norm(trimmed))) { setError(`Ya existe "${trimmed}"`); return }
    setSaving(true)
    setError('')
    try {
      await api('/api/data/config', send('POST', { type: active, label: trimmed }))
      setLabel('')
      showToast(`"${trimmed}" agregado`)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const [removing, setRemoving] = useState(false)
  const remove = async (item: ConfigItem) => {
    setError('')
    setRemoving(true)
    try {
      await api(`/api/data/config/${item.id}`, { method: 'DELETE' })
      showToast(`"${item.label}" eliminado`)
    } catch (err) {
      setError((err as Error).message)
    }
    setRemoving(false)
    setConfirmDel(null)
    await load()
  }

  if (loadError) return <Note kind="danger">{loadError}</Note>

  return (
    <>
      {!canEdit && <Note>Solo un administrador puede cambiar estas opciones, porque afectan a todo el equipo.</Note>}
      <Card>
        <div className={s.catTabs} role="tablist" aria-label="Catálogos">
          {CATALOGS.map(c => (
            <button key={c.type} type="button" role="tab" aria-selected={active === c.type}
              className={cx(s.catTab, active === c.type && s.catTabOn)} onClick={() => pick(c.type)}>
              {c.title}<span className={s.catCount}>{lists ? lists[c.type].length : <SkText w={12} inline />}</span>
            </button>
          ))}
        </div>

        <div className={s.cardBody} role="tabpanel" aria-label={cat.title}>
          <p className={s.catHint}>{cat.subtitle}</p>

          {canEdit && (
            <form className={s.catAdd} onSubmit={add}>
              <input className={s.input} value={label} onChange={e => { setLabel(e.target.value); setError('') }} maxLength={100}
                placeholder={`Nuevo ${cat.singular}…`} aria-label={`Nuevo ${cat.singular}`} />
              <button type="submit" className="btn btn-primary" disabled={!label.trim() || saving}>
                <Ico.plus style={{ width: 14, height: 14 }} />{saving ? 'Guardando…' : 'Agregar'}
              </button>
            </form>
          )}
          {error && <div className={s.error}>{error}</div>}

          {!lists ? <ChipsSkeleton /> : items.length === 0 ? (
            <div className={s.empty}>Aún no hay {cat.title.toLowerCase()}.</div>
          ) : (
            <ul className={s.chips}>
              {items.map(item => {
                const { bg, color } = chipColor(item.label)
                return (
                  <li key={item.id} className={s.catChip} style={{ background: bg, color }}>
                    <span className={s.catDot} style={{ background: color }} />
                    <span>{item.label}</span>
                    {canEdit && (
                      <>
                        <button type="button" className={s.catX} onClick={() => askRename(item)} aria-label={`Cambiar el nombre de ${item.label}`} title="Cambiar el nombre">
                          <PencilLine strokeWidth={2.2} aria-hidden="true" />
                        </button>
                        <button type="button" className={s.catX} onClick={() => setConfirmDel(item.id)} aria-label={`Eliminar ${item.label}`} title="Eliminar">
                          <X strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <ConfirmDialog open={!!renaming} busy={renameBusy} error={renameError} tone="warn" icon={PencilLine} focusField
            title={`Cambiar el nombre de «${renaming?.label ?? ''}»`} confirmLabel="Guardar" busyLabel="Guardando…"
            onConfirm={rename} onCancel={() => { if (!renameBusy) setRenaming(null) }}
            field={<>
              <label htmlFor="catalog-rename">Nombre nuevo</label>
              <input id="catalog-rename" value={newLabel} maxLength={active === 'zone' ? 60 : 100} disabled={renameBusy}
                onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rename() } }} />
            </>}>
            Los contactos que tienen esta opción se actualizan con el nombre nuevo.
          </ConfirmDialog>
          {(() => {
            const item = items.find(i => i.id === confirmDel)
            return (
              <ConfirmDialog open={!!item} busy={removing}
                title={`¿Eliminar «${item?.label ?? ''}»?`} confirmLabel="Eliminar" busyLabel="Eliminando…"
                onConfirm={() => { if (item) remove(item) }} onCancel={() => setConfirmDel(null)}>
                Deja de aparecer como opción en {cat.title.toLowerCase()}. Los contactos que ya lo tienen no cambian.
              </ConfirmDialog>
            )
          })()}
        </div>
      </Card>
      {toast}
    </>
  )
}
