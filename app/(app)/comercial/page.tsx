'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch, cachedQueryData } from '@/lib/apiClient'
import { useDataReady, useQueryEffect } from '@/lib/useCachedQuery'
import { useSession } from '@/lib/profile'
import { notifyDataChanged, useDataChanged } from '@/lib/crmEvents'
import type { CommercialContact } from '@/lib/commercial'
import { HoyView, type Opened } from './HoyView'
import { OportunidadesView } from './OportunidadesView'
import { EquipoView } from './EquipoView'
import { ContactPanel } from './ContactPanel'
import { GuideButton, GuideModal, useGuide } from '@/components/GuideModal'
import { commercialGuide } from '@/components/Guides'
import { Ico, bizName, useWide, type TodayData } from './ui'
import s from './comercial.module.css'

const PATH = '/api/data/commercial'
type Tab = 'hoy' | 'oportunidades' | 'equipo'
const TAB_KEYS: Tab[] = ['hoy', 'oportunidades', 'equipo']

export default function ComercialPage() {
  // ?id= abre un contacto (desde el buscador, Inicio, Contactos o WhatsApp); ?tab= abre una pestaña
  return <Suspense fallback={null}><ComercialContent /></Suspense>
}

function ComercialContent() {
  const router = useRouter()
  const params = useSearchParams()
  const deepId = params.get('id')
  const session = useSession()
  const readonly = session?.store?.access === 'readonly'
  const waModule = !!session?.store?.modules.whatsapp
  const wide = useWide()

  const [data, setData] = useState<TodayData | null>(() => cachedQueryData<TodayData>(PATH) ?? null)
  const [loading, setLoading] = useState(() => !cachedQueryData(PATH))
  useDataReady(loading, 'comercial')
  const wanted = params.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(wanted && TAB_KEYS.includes(wanted) ? wanted : 'hoy')
  const [zone, setZone] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [overlay, setOverlay] = useState<Opened | null>(deepId ? { id: deepId } : null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])

  // La búsqueda espera a que dejes de escribir
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const url = useCallback((offset = 0) => {
    const qs = new URLSearchParams()
    if (zone) qs.set('zone', zone)
    if (search) qs.set('q', search)
    if (offset) qs.set('offset', String(offset))
    const str = qs.toString()
    return str ? `${PATH}?${str}` : PATH
  }, [zone, search])

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(url())
      if (r.ok) setData(await r.json())
    } catch {} finally { setLoading(false) }
  }, [url])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['contact', 'commercial'], load)
  useEffect(() => { if (deepId) setOverlay({ id: deepId }) }, [deepId])

  async function loadMore() {
    if (!data) return
    setLoadingMore(true)
    try {
      const r = await apiFetch(url(data.fresh.length))
      if (r.ok) {
        const more: TodayData = await r.json()
        setData(d => d ? { ...d, fresh: [...d.fresh, ...more.fresh.filter(c => !d.fresh.some(x => x.id === c.id))], freshTotal: more.freshTotal } : d)
      }
    } finally { setLoadingMore(false) }
  }

  // Al guardar: sale de la lista si ya no toca hoy; luego se recargan avance y lista
  const onSaved = useCallback((c: CommercialContact) => {
    setData(d => {
      if (!d) return d
      const stays = (x: CommercialContact) => x.next_action_at !== null && x.next_action_at <= d.today && x.commercial_status !== 'depurar'
      return {
        ...d,
        due: stays(c) ? d.due.map(x => x.id === c.id ? { ...x, ...c } : x) : d.due.filter(x => x.id !== c.id),
        fresh: d.fresh.filter(x => x.id !== c.id || (!c.last_activity_at && !c.owner_id)),
        visit: d.visit.filter(x => x.id !== c.id || (!c.last_activity_at && !c.owner_id)),
      }
    })
    showToast(`${bizName(c)}: guardado`)
    notifyDataChanged('commercial')
  }, [showToast])

  const closeOverlay = () => {
    setOverlay(null)
    if (deepId) router.replace('/comercial', { scroll: false })
  }

  const salesTeam = !!data?.salesTeam
  const isAdmin = !!data?.isAdmin
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'hoy', label: 'Hoy', count: data?.due.length },
    ...(salesTeam ? [{ key: 'oportunidades' as Tab, label: 'Oportunidades' }] : []),
    ...(salesTeam && isAdmin ? [{ key: 'equipo' as Tab, label: 'Equipo' }] : []),
  ]
  const current: Tab = TABS.some(t => t.key === tab) ? tab : 'hoy'
  // Guía de inicio: sola la primera vez (no si se llegó directo a una ficha)
  const guide = useGuide('comercial', !loading && !!data && !deepId)

  return (
    <>
      <div className={s.tabsRow}>
        {TABS.length > 1 && (
          <div className={s.tabs} role="tablist" aria-label="Sistema comercial">
            {TABS.map(t => (
              <button key={t.key} role="tab" aria-selected={current === t.key} className={`${s.tab} ${s.press}`} onClick={() => setTab(t.key)}>
                {t.label}{t.count ? <span className={`${s.tabCount} ${s.num}`}>{t.count}</span> : null}
              </button>
            ))}
          </div>
        )}
        <GuideButton onClick={guide.show} />
      </div>
      {guide.open && <GuideModal title="Cómo usar Comercial" steps={commercialGuide({ isAdmin, salesTeam })} onClose={guide.close} />}

      {loading || !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : current === 'hoy' ? (
        <HoyView data={data} wide={wide} zone={zone} query={query} readonly={readonly} waModule={waModule} loadingMore={loadingMore}
          onZone={setZone} onQuery={setQuery} onMore={loadMore} onSaved={onSaved} opened={opened} onOpen={setOpened} />
      ) : current === 'oportunidades' ? (
        <OportunidadesView isAdmin={isAdmin} onOpen={setOverlay} />
      ) : (
        <EquipoView today={data.today} />
      )}

      {overlay && data && (
        <ContactPanel key={`${overlay.id}-${overlay.result ?? ''}`} contactId={overlay.id} today={data.today} variant="overlay"
          isAdmin={isAdmin} readonly={readonly} waModule={waModule} kind={overlay.kind} result={overlay.result}
          onSaved={c => { onSaved(c); closeOverlay() }} onChanged={onSaved} onClose={closeOverlay} />
      )}

      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </>
  )
}
