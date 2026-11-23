'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/lib/profile'
import { LockedPanel } from '@/components/LockedPanel'
import { filtersQuery, parseFilters, type ReportFilters, type ReportTab } from '@/lib/reports'
import { useWide } from '../comercial/ui'
import { EquipoHoyView } from './EquipoHoyView'
import { DesempenoView } from './DesempenoView'
import { MiAvanceView } from './MiAvanceView'
import { ReportesPageSkeleton } from './Skeletons'
import s from './reportes.module.css'

export default function ReportesPage() {
  // ?tab= y los filtros viven en la dirección: un enlace abre el reporte tal cual
  return <Suspense fallback={<ReportesPageSkeleton />}><Reportes /></Suspense>
}

/**
 * Reportes (plan Cubeta). El administrador ve Equipo hoy y Desempeño de todo
 * el equipo; el vendedor, Mi avance y Desempeño solo con lo suyo. En Litro se
 * ve con candado y un ejemplo.
 */
function Reportes() {
  const router = useRouter()
  const params = useSearchParams()
  const session = useSession()
  const compact = !useWide(761)
  const isAdmin = !!session?.isAdmin
  const tabs: { key: ReportTab; label: string }[] = isAdmin
    ? [{ key: 'equipo', label: 'Equipo hoy' }, { key: 'desempeno', label: 'Desempeño' }]
    : [{ key: 'avance', label: 'Mi avance' }, { key: 'desempeno', label: 'Desempeño' }]
  const wanted = params.get('tab')
  const tab = tabs.find(t => t.key === wanted)?.key ?? tabs[0].key
  const filters = parseFilters(params)

  const go = (next: ReportTab, f: ReportFilters) => {
    const qs = new URLSearchParams(filtersQuery(f))
    if (next !== tabs[0].key) qs.set('tab', next)
    const str = qs.toString()
    router.replace(str ? `/reportes?${str}` : '/reportes', { scroll: false })
  }

  if (!session) return <ReportesPageSkeleton />
  if (!session.store?.reports) return <LockedPanel feature="reportes" />
  const readonly = session.store.access === 'readonly'
  const onFilters = (f: ReportFilters) => go(tab, f)

  // Cada vista pone las pestañas en su primer renglón, junto a sus botones (Excel, metas)
  const tabBar = (
    <div className={s.tabs} role="tablist" aria-label="Reportes">
      {tabs.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`${s.tab} ${s.press}`} onClick={() => go(t.key, filters)}>
          {t.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className={s.page}>
      {tab === 'equipo' ? <EquipoHoyView tabs={tabBar} filters={filters} onFilters={onFilters} compact={compact} readonly={readonly} />
        : tab === 'avance' ? <MiAvanceView tabs={tabBar} filters={filters} onFilters={onFilters} compact={compact} />
        : <DesempenoView tabs={tabBar} filters={filters} onFilters={onFilters} compact={compact} />}
    </div>
  )
}
