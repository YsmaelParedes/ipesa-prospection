'use client'

import { useQueryEffect } from '@/lib/useCachedQuery'


import { useCallback, useState } from 'react'
import { Card, Ico, Note, Spinner, api, cx, send, useToast } from './ui'
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

  const cat = CATALOGS.find(c => c.type === active)!
  const items = lists?.[active] ?? []

  const pick = (type: CatalogType) => { setActive(type); setLabel(''); setError(''); setConfirmDel(null) }

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

  const remove = async (item: ConfigItem) => {
    setError('')
    try {
      await api(`/api/data/config/${item.id}`, { method: 'DELETE' })
      showToast(`"${item.label}" eliminado`)
    } catch (err) {
      setError((err as Error).message)
    }
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
              {c.title}<span className={s.catCount}>{lists ? lists[c.type].length : '…'}</span>
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

          {!lists ? <Spinner /> : items.length === 0 ? (
            <div className={s.empty}>Aún no hay {cat.title.toLowerCase()}.</div>
          ) : (
            <ul className={s.chips}>
              {items.map(item => {
                const { bg, color } = chipColor(item.label)
                const asking = confirmDel === item.id
                return (
                  <li key={item.id} className={cx(s.catChip, asking && s.catChipAsk)} style={asking ? undefined : { background: bg, color }}>
                    {asking ? (
                      <>
                        <span>¿Eliminar «{item.label}»?</span>
                        <button type="button" className={cx(s.mini, s.miniDanger)} onClick={() => remove(item)}>Sí</button>
                        <button type="button" className={cx(s.mini, s.miniGhost)} onClick={() => setConfirmDel(null)}>No</button>
                      </>
                    ) : (
                      <>
                        <span className={s.catDot} style={{ background: color }} />
                        <span>{item.label}</span>
                        {canEdit && (
                          <button type="button" className={s.catX} onClick={() => setConfirmDel(item.id)} aria-label={`Eliminar ${item.label}`} title="Eliminar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
      {toast}
    </>
  )
}
