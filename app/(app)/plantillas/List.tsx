'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react'
import { SiWhatsapp } from '@icons-pack/react-simple-icons'
import { LoadFailed } from '@/components/LoadFailed'
import { templateTitle } from '@/lib/campaignWizard'
import { templateState, type ManagedTemplate, type TemplateState } from '@/lib/whatsappTemplates'
import { CATEGORY_LABEL, StatusBadge, fmt, keyOf, languageLabel, type TemplateStats } from './ui'
import { TemplateRowsSkeleton } from './Skeletons'
import s from './plantillas.module.css'

const FILTERS: { key: '' | TemplateState; label: string }[] = [
  { key: '', label: 'Todas' }, { key: 'ok', label: 'Aprobadas' }, { key: 'review', label: 'En revisión' },
  { key: 'rejected', label: 'Rechazadas' }, { key: 'paused', label: 'Pausadas' }, { key: 'off', label: 'Desactivadas' },
]

const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Plantillas de la tienda: el botón para crear una, filtros por estado y la
 * lista (al tocar una, su detalle). Los números son de las campañas de los
 * últimos 90 días.
 */
export function TemplateList({ templates, error, loading, refreshing, onReload, stats, onNew, onOpen }: {
  templates: ManagedTemplate[] | undefined
  error: string
  loading: boolean
  refreshing: boolean
  onReload: () => void
  stats: Map<string, TemplateStats> | null
  onNew: () => void
  onOpen: (key: string) => void
}) {
  const [filter, setFilter] = useState<'' | TemplateState>('')
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const m = new Map<TemplateState, number>()
    for (const t of templates ?? []) { const st = templateState(t.status); m.set(st, (m.get(st) ?? 0) + 1) }
    return m
  }, [templates])
  const term = plain(q.trim())
  const shown = (templates ?? [])
    .filter(t => !filter || templateState(t.status) === filter)
    .filter(t => !term || plain(`${t.name} ${t.bodyPreview}`).includes(term) || plain(templateTitle(t.name)).includes(term))
    .sort((a, b) => templateTitle(a.name).localeCompare(templateTitle(b.name), 'es'))

  const empty = !loading && !error && !templates?.length
  const newButton = (
    <button type="button" className={`btn btn-primary ${s.press}`} onClick={onNew}><Plus aria-hidden="true" /> Nueva plantilla</button>
  )

  return (
    <>
      <div className={s.head}>
        <h2>Plantillas</h2>
        {!empty && (
          <>
            <button type="button" className={`btn btn-ghost ${s.press}`} onClick={onReload} disabled={refreshing} aria-label="Actualizar estados" title="Ver si WhatsApp ya las revisó">
              <RefreshCw aria-hidden="true" /> {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
            {newButton}
          </>
        )}
      </div>

      {error && !loading && (
        <div className={`${s.banner} ${s.warn}`} role="alert"><AlertTriangle aria-hidden="true" /><div className={s.g}>{error}</div></div>
      )}

      {loading ? (
        <TemplateRowsSkeleton />
      ) : empty ? (
        <div className={s.zero}>
          <span className={s.wi}><SiWhatsapp aria-hidden="true" /></span>
          <h3>Tus mensajes, aprobados por WhatsApp</h3>
          <p>Para escribirle a muchos clientes a la vez, WhatsApp pide usar plantillas que revisa antes. Crea una aquí: normalmente la revisa en minutos.</p>
          {newButton}
        </div>
      ) : !templates?.length ? (
        error ? null : <LoadFailed message="No se pudieron cargar tus plantillas" onRetry={onReload} />
      ) : (
        <>
          <div className={s.controls}>
            <div className={s.chips} role="group" aria-label="Estado">
              {FILTERS.filter(f => !f.key || counts.get(f.key) || filter === f.key).map(f => (
                <button key={f.key || 'todas'} type="button" className={`${s.chip} ${s.press}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label} {f.key ? fmt(counts.get(f.key) ?? 0) : fmt(templates.length)}
                </button>
              ))}
            </div>
            <label className={s.search}>
              <Search aria-hidden="true" />
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar plantilla" aria-label="Buscar plantilla" />
            </label>
          </div>

          {shown.length ? (
            <div className={s.list}>
              <div className={s.lh} aria-hidden="true"><span>Plantilla</span><span>Estado</span><span>Enviados</span><span>Leídos</span><span>Respondieron</span><span /></div>
              {shown.map(t => {
                const st = stats?.get(t.name)
                return (
                  <button key={t.id || keyOf(t)} type="button" className={s.lr} onClick={() => onOpen(keyOf(t))}>
                    <span style={{ minWidth: 0 }}>
                      <b>{templateTitle(t.name)}</b>
                      <small>{[CATEGORY_LABEL[t.category ?? ''] ?? t.category, languageLabel(t.language)].filter(Boolean).join(' · ')}</small>
                      {st && <small className={s.ms}>{fmt(st.replied)} de {fmt(st.sent)} respondieron</small>}
                    </span>
                    <StatusBadge status={t.status} />
                    <span className={s.num}>{st ? fmt(st.sent) : '—'}</span>
                    <span className={s.num}>{st ? fmt(st.seen) : '—'}</span>
                    <span className={`${s.num} ${s.r}`}>{st ? fmt(st.replied) : '—'}</span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          ) : (
            <p className={s.more}>Ninguna plantilla coincide.</p>
          )}
          {stats && <p className={s.more}>Enviados, leídos y respondieron: campañas de los últimos 90 días.</p>}
        </>
      )}
    </>
  )
}
